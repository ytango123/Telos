from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum
from uuid import UUID


class TargetDepth(str, Enum):
    QUICK_OVERVIEW = "quick_overview"
    STANDARD = "standard"
    DEEP_DIVE = "deep_dive"


class BlockStatus(str, Enum):
    DRAFT = "draft"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# Attachment schemas
class AttachmentBase(BaseModel):
    filename: str
    original_name: str
    file_type: str
    file_size: int


class AttachmentResponse(AttachmentBase):
    id: str
    file_path: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# Block schemas
class BlockBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    target: Optional[str] = None
    target_depth: TargetDepth = TargetDepth.STANDARD
    source_preferences: List[str] = Field(default_factory=list)


class BlockCreate(BlockBase):
    pass


class BlockUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    target: Optional[str] = None
    target_depth: Optional[TargetDepth] = None
    source_preferences: Optional[List[str]] = None


class BlockResponse(BlockBase):
    id: str
    status: BlockStatus = BlockStatus.DRAFT
    generation_progress: int = 0
    status_message: Optional[str] = None
    course_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    attachments: List[AttachmentResponse] = []
    
    class Config:
        from_attributes = True


class BlockListResponse(BaseModel):
    blocks: List[BlockResponse]
    total: int


# Chapter schemas
class ChapterBase(BaseModel):
    title: str
    order: int
    content: Optional[str] = None
    content_blocks: List[dict] = Field(default_factory=list)


class ChapterResponse(ChapterBase):
    id: str
    course_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# Course schemas
class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None


class CourseResponse(CourseBase):
    id: str
    block_id: str
    course_metadata: dict = Field(default_factory=dict)
    chapters: List[ChapterResponse] = []
    created_at: datetime
    
    class Config:
        from_attributes = True


class CourseListResponse(BaseModel):
    courses: List[CourseResponse]
    total: int


# Generation status
class GenerationStatus(BaseModel):
    block_id: str
    status: str
    progress: int = 0
    course_id: Optional[str] = None
    message: Optional[str] = None
