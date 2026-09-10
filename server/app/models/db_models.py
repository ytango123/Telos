from sqlalchemy import Column, String, Text, DateTime, Integer, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from app.db.database import Base


class BlockStatus(enum.Enum):
    DRAFT = "draft"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class TargetDepth(enum.Enum):
    STANDARD = "standard"
    DEEP_DIVE = "deep_dive"


def generate_uuid():
    return str(uuid.uuid4())


class Block(Base):
    __tablename__ = "blocks"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    target = Column(String(500), nullable=True)
    target_depth = Column(String(20), default="standard")
    source_preferences = Column(JSON, default=list)
    status = Column(String(20), default="draft")
    generation_progress = Column(Integer, default=0)
    status_message = Column(String(500), nullable=True)
    generation_debug = Column(JSON, default=dict)
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    attachments = relationship("Attachment", back_populates="block", cascade="all, delete-orphan")
    course = relationship("Course", back_populates="block", foreign_keys=[course_id])


class Course(Base):
    __tablename__ = "courses"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    block_id = Column(String(36), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    course_metadata = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    chapters = relationship("Chapter", back_populates="course", cascade="all, delete-orphan", order_by="Chapter.order")
    block = relationship("Block", back_populates="course", foreign_keys=[Block.course_id], uselist=False)


class Chapter(Base):
    __tablename__ = "chapters"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    course_id = Column(String(36), ForeignKey("courses.id"), nullable=False)
    order = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    content_blocks = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    course = relationship("Course", back_populates="chapters")


class Attachment(Base):
    __tablename__ = "attachments"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    block_id = Column(String(36), ForeignKey("blocks.id"), nullable=False)
    # kind distinguishes user-provided material pipelines:
    #   file  -> uploaded document (RAG indexed)
    #   text  -> pasted note saved as text (RAG indexed)
    #   link  -> user-given URL (deterministic Jina fetch at generation time)
    kind = Column(String(20), default="file")
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_path = Column(String(500), nullable=False)
    # Only set for kind == "link": the original URL the user pasted.
    source_url = Column(String(2000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    block = relationship("Block", back_populates="attachments")
