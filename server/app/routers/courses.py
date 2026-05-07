from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.db.database import get_db
from app.models.schemas import CourseResponse, CourseListResponse
from app.services import course_service

router = APIRouter()


@router.get("", response_model=CourseListResponse)
async def list_courses(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """List all generated courses"""
    courses = await course_service.get_courses(db, skip=skip, limit=limit)
    total = await course_service.count_courses(db)
    return CourseListResponse(courses=courses, total=total)


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific course with all chapters"""
    course = await course_service.get_course_with_chapters(db, course_id)
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


@router.delete("/{course_id}", status_code=204)
async def delete_course(
    course_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a course"""
    success = await course_service.delete_course(db, course_id)
    if not success:
        raise HTTPException(status_code=404, detail="Course not found")
    return None
