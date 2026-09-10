from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum
from uuid import UUID


class TargetDepth(str, Enum):
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
    kind: str = "file"
    file_path: str
    source_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class NoteCreate(BaseModel):
    """A pasted text note provided by the user as reference material."""
    content: str = Field(..., min_length=1)


class LinkCreate(BaseModel):
    """A specific URL the user wants converted directly to context.

    `kind` distinguishes:
      - "link" (default): regular web page, will be fetched and converted to markdown
      - "video": video page (YouTube/Bilibili/...), will only be referenced for
        in-page embedding (no markdown extraction)
    """
    url: str = Field(..., min_length=1, max_length=2000)
    title: Optional[str] = None
    kind: str = Field(default="link", pattern="^(link|video)$")


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
    generation_debug: Optional[dict] = Field(default_factory=dict)
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
