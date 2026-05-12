import io
import uuid
from pathlib import Path
from typing import List, Tuple

import magic
import structlog
from fastapi import UploadFile
from PIL import Image

from app.core.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
THUMB_SIZES = {
    "thumb": (200, 200),
    "card": (600, 600),
    "full": (1200, 1200),
}


def _validate_image(content: bytes) -> str:
    """Validate file by magic bytes, not extension."""
    detected = magic.from_buffer(content, mime=True)
    if detected not in ALLOWED_TYPES:
        raise ValueError(f"Invalid file type: {detected}")
    if len(content) > MAX_FILE_SIZE:
        raise ValueError(f"File too large: {len(content)} bytes (max {MAX_FILE_SIZE})")
    return detected


def _generate_thumbnail(img: Image.Image, size: Tuple[int, int]) -> bytes:
    """Generate a thumbnail stripping EXIF metadata."""
    thumb = img.copy()
    thumb.thumbnail(size, Image.LANCZOS)
    # Strip metadata
    data = list(thumb.getdata())
    clean = Image.new(thumb.mode, thumb.size)
    clean.putdata(data)

    buf = io.BytesIO()
    clean.save(buf, format="JPEG", quality=85, optimize=True)
    return buf.getvalue()


async def save_item_images(files: List[UploadFile], item_id: uuid.UUID) -> List[str]:
    """Save uploaded images with thumbnails. Returns list of relative paths."""
    base_path = Path(settings.local_storage_path) / "items" / str(item_id)
    base_path.mkdir(parents=True, exist_ok=True)

    image_paths = []
    for idx, file in enumerate(files):
        content = await file.read()
        _validate_image(content)

        try:
            img = Image.open(io.BytesIO(content))
        except Exception as exc:
            raise ValueError("Cannot open image") from exc

        # Generate thumbnails
        for suffix, size in THUMB_SIZES.items():
            thumb_data = _generate_thumbnail(img, size)
            thumb_path = base_path / f"{suffix}_{idx}.jpg"
            thumb_path.write_bytes(thumb_data)

        # Store original as full
        image_paths.append(f"items/{item_id}/full_0.jpg")

    logger.info("item_images_saved", item_id=str(item_id), count=len(files))
    return image_paths


async def save_kyc_document(file: UploadFile, user_id: uuid.UUID, doc_type: str) -> str:
    """Save KYC document. Returns relative path."""
    content = await file.read()
    detected = magic.from_buffer(content, mime=True)
    if detected not in {"image/jpeg", "image/png", "application/pdf"}:
        raise ValueError(f"Invalid KYC document type: {detected}")
    if len(content) > MAX_FILE_SIZE:
        raise ValueError("KYC document too large")

    ext = "pdf" if detected == "application/pdf" else "jpg"
    filename = f"{uuid.uuid4()}.{ext}"
    base_path = Path(settings.local_storage_path) / "kyc" / str(user_id)
    base_path.mkdir(parents=True, exist_ok=True)

    file_path = base_path / filename
    file_path.write_bytes(content)

    logger.info("kyc_document_saved", user_id=str(user_id), doc_type=doc_type, path=str(file_path))
    return f"kyc/{user_id}/{filename}"
