from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_current_user, require_admin, require_csrf
from app.api.v1.rate_limit import check_kyc_upload_rate_limit
from app.core.database import get_db
from app.models.document import Document
from app.models.user import User
from app.schemas import DocumentAdminOut, DocumentOut
from app.services.storage_backend import save_kyc_document

router = APIRouter()

# Document types that count as identity proof
IDENTITY_TYPES = {"ine", "passport"}
ADDRESS_TYPES = {"proof_address"}


@router.post("/me/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    type: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    if current_user.kyc_status == "approved":
        raise HTTPException(status_code=400, detail="KYC already approved")

    allowed_types = IDENTITY_TYPES | ADDRESS_TYPES
    if type not in allowed_types:
        raise HTTPException(status_code=422, detail=f"Tipo de documento inválido. Permitidos: {', '.join(sorted(allowed_types))}")

    # Rate limit: max 10 uploads per user per day
    await check_kyc_upload_rate_limit(str(current_user.id))

    try:
        file_path = await save_kyc_document(file, current_user.id, type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Error al guardar el archivo. Intenta de nuevo.")

    doc = Document(
        user_id=current_user.id,
        type=type,
        file_path=file_path,
        status="pending",
    )
    db.add(doc)

    # Reset KYC status to pending if it was rejected
    if current_user.kyc_status == "rejected":
        current_user.kyc_status = "pending"

    await db.commit()
    await db.refresh(doc)

    return DocumentOut.model_validate(doc)


@router.get("/me/documents", response_model=List[DocumentOut])
async def list_my_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.user_id == current_user.id).order_by(Document.uploaded_at.desc())
    )
    return [DocumentOut.model_validate(d) for d in result.scalars().all()]


# Admin endpoints
@router.get("/admin/kyc-queue", response_model=List[DocumentAdminOut])
async def kyc_queue(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document, User)
        .join(User, User.id == Document.user_id)
        .where(Document.status == "pending")
        .order_by(Document.uploaded_at.asc())
    )
    rows = result.all()
    out = []
    for doc, user in rows:
        d = DocumentAdminOut.model_validate(doc)
        d.user_email = user.email
        d.user_full_name = user.full_name
        out.append(d)
    return out


@router.post("/admin/documents/{document_id}/review")
async def review_document(
    document_id: UUID,
    status: str = Form(...),  # approved or rejected
    notes: str = Form(""),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    _csrf: None = Depends(require_csrf),
):
    if status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    doc.status = status
    doc.reviewed_by = admin.id
    doc.review_notes = notes
    from datetime import datetime, timezone
    doc.reviewed_at = datetime.now(timezone.utc)

    # Re-evaluate the user's KYC status based on ALL their approved docs
    user_result = await db.execute(select(User).where(User.id == doc.user_id))
    user = user_result.scalar_one()

    # Fetch all approved docs for this user (including the one just reviewed)
    approved_result = await db.execute(
        select(Document).where(
            Document.user_id == doc.user_id,
            Document.status == "approved",
            Document.id != document_id,  # exclude current (not committed yet)
        )
    )
    approved_types = {d.type for d in approved_result.scalars().all()}
    if status == "approved":
        approved_types.add(doc.type)

    has_identity = bool(approved_types & IDENTITY_TYPES)
    has_address = bool(approved_types & ADDRESS_TYPES)

    if status == "rejected":
        # Only set rejected if not already fully approved
        if user.kyc_status != "approved":
            user.kyc_status = "rejected"
    elif has_identity and has_address:
        user.kyc_status = "approved"
    else:
        # Partial approval — keep as pending so user knows to upload the missing type
        user.kyc_status = "pending"

    await db.commit()
    return DocumentOut.model_validate(doc)
