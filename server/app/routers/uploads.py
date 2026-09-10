from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID, uuid4
from pathlib import Path
import aiofiles
import os

from app.db.database import get_db
from app.config import settings
from app.models.schemas import AttachmentResponse, NoteCreate, LinkCreate
from app.models.db_models import Attachment, Block

router = APIRouter()


async def _get_block_or_404(db: AsyncSession, block_id: UUID) -> Block:
    from sqlalchemy import select

    result = await db.execute(select(Block).where(Block.id == str(block_id)))
    block = result.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".doc", ".docx", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/{block_id}/attachments", response_model=AttachmentResponse)
async def upload_attachment(
    block_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload an attachment (file) to a block"""
    await _get_block_or_404(db, block_id)
    
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
        kind="file",
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
        except Exception:
            pass
    elif ext == ".docx":
        try:
            from app.services.materials.extractors.docx import extract_text_from_docx
            from app.services.rag_service import rag_service

            text = extract_text_from_docx(str(file_path))
            if text.strip():
                await rag_service.index_raw_text(
                    str(block_id),
                    attachment.id,
                    text,
                    file.filename or "document.docx",
                )
        except Exception:
            pass
    
    return attachment


@router.post("/{block_id}/notes", response_model=AttachmentResponse)
async def add_note(
    block_id: UUID,
    note: NoteCreate,
    db: AsyncSession = Depends(get_db),
):
    """Add a pasted text note as reference material (stored as text + RAG indexed)."""
    await _get_block_or_404(db, block_id)

    unique_filename = f"{uuid4()}.txt"
    file_path = settings.upload_dir / unique_filename
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
        await f.write(note.content)

    preview = note.content.strip().splitlines()[0][:40] if note.content.strip() else "文本笔记"
    original_name = preview or "文本笔记"

    attachment = Attachment(
        block_id=str(block_id),
        kind="text",
        filename=unique_filename,
        original_name=original_name,
        file_type="text/plain",
        file_size=len(note.content.encode("utf-8")),
        file_path=str(file_path),
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    try:
        from app.services.rag_service import rag_service
        await rag_service.index_document(
            block_id=str(block_id),
            attachment_id=attachment.id,
            file_path=str(file_path),
            file_type=".txt",
            filename=original_name,
        )
    except Exception:
        pass

    return attachment


@router.post("/{block_id}/links", response_model=AttachmentResponse)
async def add_link(
    block_id: UUID,
    link: LinkCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a user-specified URL. Content is fetched deterministically at generation time."""
    await _get_block_or_404(db, block_id)

    url = link.url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="链接需以 http:// 或 https:// 开头")

    display = (link.title or url).strip()[:255]
    kind = link.kind if link.kind in ("link", "video") else "link"

    attachment = Attachment(
        block_id=str(block_id),
        kind=kind,
        filename=display,
        original_name=display,
        file_type=kind,
        file_size=0,
        file_path="",
        source_url=url,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

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
