from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import Optional

from app.db.database import get_db
from app.models.schemas import (
    BlockCreate,
    BlockUpdate,
    BlockResponse,
    BlockListResponse,
    GenerationStatus,
)
from app.services import block_service, course_service

router = APIRouter()


@router.get("", response_model=BlockListResponse)
async def list_blocks(
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all blocks with optional filtering"""
    blocks = await block_service.get_blocks(db, skip=skip, limit=limit, status=status)
    total = await block_service.count_blocks(db, status=status)
    return BlockListResponse(blocks=blocks, total=total)


@router.post("", response_model=BlockResponse, status_code=201)
async def create_block(
    block: BlockCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new learning block"""
    return await block_service.create_block(db, block)


@router.get("/{block_id}", response_model=BlockResponse)
async def get_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific block by ID"""
    block = await block_service.get_block(db, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


@router.put("/{block_id}", response_model=BlockResponse)
async def update_block(
    block_id: UUID,
    block_update: BlockUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a block"""
    block = await block_service.update_block(db, block_id, block_update)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    return block


@router.delete("/{block_id}", status_code=204)
async def delete_block(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a block"""
    from app.services import generation_service
    # Ensure running generation loop stops touching this block while deleting.
    generation_service.mark_generation_cancelled(block_id)
    success = await block_service.delete_block(db, block_id)
    if not success:
        raise HTTPException(status_code=404, detail="Block not found")
    return None


@router.post("/{block_id}/generate", response_model=GenerationStatus)
async def generate_course(
    block_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger course generation for a block"""
    block = await block_service.get_block(db, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    if block.status == "processing":
        return GenerationStatus(
            block_id=str(block_id),
            status="processing",
            message="正在生成中，请稍候或先取消后再试",
        )

    if block.status not in ("draft", "failed"):
        raise HTTPException(
            status_code=400,
            detail="仅草稿或失败的任务可以开始生成",
        )

    from app.services import generation_service

    generation_service.clear_generation_cancelled(block_id)
    await block_service.update_block_status(
        db,
        block_id,
        "processing",
        0,
        "生成任务已启动…",
    )
    await db.commit()

    background_tasks.add_task(generation_service.generate_course, block_id)

    return GenerationStatus(
        block_id=str(block_id),
        status="processing",
        message="Course generation started",
    )


@router.post("/{block_id}/cancel-generation")
async def cancel_generation(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Cancel generation immediately in UI state, and stop worker at next safe step."""
    block = await block_service.get_block(db, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    if block.status != "processing":
        raise HTTPException(status_code=400, detail="当前不在生成中，无法取消")

    from app.services import generation_service

    # 1) Mark cancellation for background worker.
    generation_service.mark_generation_cancelled(block_id)
    # 2) Immediately rollback visible block state so user can edit/resubmit right away.
    await course_service.delete_courses_by_block(db, str(block_id))
    await block_service.update_block_status(
        db,
        block_id,
        "draft",
        0,
        "已取消生成",
        clear_course_id=True,
    )
    block = await block_service.get_block(db, block_id)
    if block:
        block.title = "新任务"
    await db.commit()

    return {
        "ok": True,
        "message": "已取消，任务已退回草稿",
    }


@router.get("/{block_id}/status", response_model=GenerationStatus)
async def get_generation_status(
    block_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the generation status for a block"""
    block = await block_service.get_block(db, block_id)
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")
    
    return GenerationStatus(
        block_id=str(block_id),
        status=block.status,
        progress=block.generation_progress,
        course_id=block.course_id,
        message=block.status_message,
    )
