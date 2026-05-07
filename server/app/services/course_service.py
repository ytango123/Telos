from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from typing import Optional, List

from app.models.db_models import Course, Chapter


async def get_courses(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
) -> List[Course]:
    """Get list of courses"""
    query = (
        select(Course)
        .options(selectinload(Course.chapters))
        .order_by(Course.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


async def count_courses(db: AsyncSession) -> int:
    """Count total courses"""
    query = select(func.count(Course.id))
    result = await db.execute(query)
    return result.scalar() or 0


async def get_course(db: AsyncSession, course_id: UUID) -> Optional[Course]:
    """Get a single course by ID"""
    query = select(Course).where(Course.id == str(course_id))
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_course_with_chapters(db: AsyncSession, course_id: UUID) -> Optional[Course]:
    """Get a course with all its chapters"""
    query = (
        select(Course)
        .options(selectinload(Course.chapters))
        .where(Course.id == str(course_id))
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create_course(
    db: AsyncSession,
    block_id: str,
    title: str,
    description: Optional[str] = None,
    course_metadata: dict = None,
) -> Course:
    """Create a new course"""
    course = Course(
        block_id=block_id,
        title=title,
        description=description,
        course_metadata=course_metadata or {},
    )
    db.add(course)
    await db.flush()
    await db.refresh(course)
    return course


async def add_chapter(
    db: AsyncSession,
    course_id: str,
    order: int,
    title: str,
    content: str,
    content_blocks: list = None,
) -> Chapter:
    """Add a chapter to a course"""
    chapter = Chapter(
        course_id=course_id,
        order=order,
        title=title,
        content=content,
        content_blocks=content_blocks or [],
    )
    db.add(chapter)
    await db.flush()
    await db.refresh(chapter)
    return chapter


async def delete_course(db: AsyncSession, course_id: UUID) -> bool:
    """Delete a course and its chapters"""
    course = await get_course(db, course_id)
    if not course:
        return False
    
    await db.delete(course)
    await db.flush()
    return True
