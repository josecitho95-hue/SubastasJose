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
from app.schemas import DocumentOut
from app.services.storage_backend import save_kyc_document

router = APIRouter()


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

    # Rate limit: max 10 uploads per user per day
    await check_kyc_upload_rate_limit(str(current_user.id))

    file_path = await save_kyc_document(file, current_user.id, type)

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
@router.get("/admin/kyc-queue", response_model=List[DocumentOut])
async def kyc_queue(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document)
        .where(Document.status == "pending")
        .order_by(Document.uploaded_at.asc())
    )
    return [DocumentOut.model_validate(d) for d in result.scalars().all()]


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

    # Update user KYC status
    user = await db.execute(select(User).where(User.id == doc.user_id))
    user = user.scalar_one()

    if status == "approved":
        user.kyc_status = "approved"
    else:
        user.kyc_status = "rejected"

    await db.commit()
    return DocumentOut.model_validate(doc)
