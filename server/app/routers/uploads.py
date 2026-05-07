from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID, uuid4
from pathlib import Path
import aiofiles
import os

from app.db.database import get_db
from app.config import settings
from app.models.schemas import AttachmentResponse
from app.models.db_models import Attachment, Block

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".doc", ".docx", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/{block_id}/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    block_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload an attachment to a block"""
    from sqlalchemy import select
    
    # Check block exists
    result = await db.execute(select(Block).where(Block.id == str(block_id)))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read file content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Generate unique filename
    unique_filename = f"{uuid4()}{ext}"
    file_path = settings.upload_dir / unique_filename
    
    # Ensure upload directory exists
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Save file
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)
    
    # Create attachment record
    attachment = Attachment(
        block_id=str(block_id),
        filename=unique_filename,
        original_name=file.filename,
        file_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        file_path=str(file_path),
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    
    # Index document for RAG (if applicable)
    if ext in [".pdf", ".txt", ".md"]:
        try:
            from app.services.rag_service import rag_service
            await rag_service.index_document(
                block_id=str(block_id),
                attachment_id=attachment.id,
                file_path=str(file_path),
                file_type=ext,
                filename=file.filename,
            )
        except Exception as e:
            pass
    
    return attachment


@router.get("/{block_id}/attachments/{attachment_id}/download")
async def download_attachment(
    block_id: UUID,
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Download an attachment"""
    from sqlalchemy import select
    
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == str(attachment_id),
            Attachment.block_id == str(block_id),
        )
    )
    attachment = result.scalar_one_or_none()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        attachment.file_path,
        filename=attachment.original_name,
        media_type=attachment.file_type,
    )


@router.delete("/{block_id}/attachments/{attachment_id}", status_code=204)
async def delete_attachment(
    block_id: UUID,
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete an attachment"""
    from sqlalchemy import select
    
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == str(attachment_id),
            Attachment.block_id == str(block_id),
        )
    )
    attachment = result.scalar_one_or_none()
    
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    # Delete file from disk
    try:
        if os.path.exists(attachment.file_path):
            os.remove(attachment.file_path)
    except Exception:
        pass
    
    # Delete from vector index
    try:
        from app.services.rag_service import rag_service
        await rag_service.delete_document_index(str(block_id), str(attachment_id))
    except Exception:
        pass
    
    # Delete record
    await db.delete(attachment)
    await db.flush()
    
    return None
