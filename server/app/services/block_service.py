from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional, List

from app.models.db_models import Block, Attachment
from app.models.schemas import BlockCreate, BlockUpdate


async def _normalize_legacy_target_depth(db: AsyncSession, block: Optional[Block]) -> None:
    """Map removed legacy depth to current enum values."""
    if block and block.target_depth == "quick_overview":
        block.target_depth = "standard"
        await db.flush()


async def get_blocks(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
) -> List[Block]:
    """Get list of blocks with optional status filter"""
    query = select(Block).options(selectinload(Block.attachments))
    
    if status:
        query = query.where(Block.status == status)
    
    query = query.order_by(Block.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    blocks = result.scalars().all()
    for block in blocks:
        await _normalize_legacy_target_depth(db, block)
    return blocks


async def count_blocks(db: AsyncSession, status: Optional[str] = None) -> int:
    """Count total blocks with optional status filter"""
    query = select(func.count(Block.id))
    if status:
        query = query.where(Block.status == status)
    result = await db.execute(query)
    return result.scalar() or 0


async def get_block(db: AsyncSession, block_id: UUID) -> Optional[Block]:
    """Get a single block by ID"""
    query = select(Block).options(selectinload(Block.attachments)).where(Block.id == str(block_id))
    result = await db.execute(query)
    block = result.scalar_one_or_none()
    await _normalize_legacy_target_depth(db, block)
    return block


async def create_block(db: AsyncSession, block_data: BlockCreate) -> Block:
    """Create a new block"""
    block = Block(
        title=block_data.title,
        description=block_data.description,
        target=block_data.target,
        target_depth=block_data.target_depth.value,
        source_preferences=block_data.source_preferences,
        status="draft",
    )
    db.add(block)
    await db.flush()
    
    # Re-fetch with relationships loaded
    query = select(Block).options(selectinload(Block.attachments)).where(Block.id == block.id)
    result = await db.execute(query)
    return result.scalar_one()


async def update_block(
    db: AsyncSession,
    block_id: UUID,
    block_data: BlockUpdate,
) -> Optional[Block]:
    """Update an existing block"""
    block = await get_block(db, block_id)
    if not block:
        return None
    
    update_data = block_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "target_depth" and value:
            value = value.value
        setattr(block, field, value)
    
    await db.flush()
    
    # Re-fetch with relationships loaded
    return await get_block(db, block_id)


async def update_block_status(
    db: AsyncSession,
    block_id: UUID,
    status: str,
    progress: int = 0,
    message: Optional[str] = None,
    course_id: Optional[str] = None,
    *,
    clear_course_id: bool = False,
) -> Optional[Block]:
    """Update block status and progress"""
    block = await get_block(db, block_id)
    if not block:
        return None
    
    block.status = status
    block.generation_progress = progress
    block.status_message = message
    if clear_course_id:
        block.course_id = None
    elif course_id:
        block.course_id = course_id
    
    await db.flush()
    
    # Re-fetch with relationships loaded
    return await get_block(db, block_id)


async def delete_block(db: AsyncSession, block_id: UUID) -> bool:
    """Delete a block, its courses (including partial generation), and vector index."""
    block = await get_block(db, block_id)
    if not block:
        return False

    from . import course_service
    from .rag_service import rag_service

    await course_service.delete_courses_by_block(db, str(block_id))
    try:
        await rag_service.delete_block_index(str(block_id))
    except Exception:
        pass

    await db.delete(block)
    await db.flush()
    return True
