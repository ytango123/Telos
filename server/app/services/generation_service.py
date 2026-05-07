import asyncio
from uuid import UUID
from typing import Optional

from app.db.database import AsyncSessionLocal
from app.services import block_service, course_service
from app.services.ai_service import AIService
from app.services.rag_service import rag_service


async def update_status(block_id: UUID, status: str, progress: int = 0, message: str = "", course_id: Optional[str] = None):
    """Helper to update block status with its own session"""
    async with AsyncSessionLocal() as db:
        await block_service.update_block_status(db, block_id, status, progress, message, course_id)
        await db.commit()


async def generate_course(block_id: UUID):
    """Background task to generate course content for a block"""
    ai_service = AIService()
    
    try:
        # Get the block with a short-lived session
        async with AsyncSessionLocal() as db:
            block = await block_service.get_block(db, block_id)
            if not block:
                return
            # Extract data we need before session closes
            block_title = block.title
            block_description = block.description or ""
            block_target = block.target or ""
            block_target_depth = block.target_depth
        
        # Update status to processing
        await update_status(block_id, "processing", 0, "Starting course generation...")
        
        # Step 1: Get RAG context if available
        rag_context = await rag_service.get_context_for_generation(
            str(block_id),
            f"{block_title} {block_description} {block_target}",
        )
        
        # Step 2: Generate course outline
        await update_status(block_id, "processing", 10, "Generating course outline...")
        
        outline = await ai_service.generate_outline(
            title=block_title,
            description=block_description,
            target=block_target,
            target_depth=block_target_depth,
            context=rag_context,
        )
        
        # Step 3: Create course
        await update_status(block_id, "processing", 20, "Creating course structure...")
        
        async with AsyncSessionLocal() as db:
            course = await course_service.create_course(
                db,
                block_id=str(block_id),
                title=outline.get("title", block_title),
                description=outline.get("description", ""),
                course_metadata={"outline": outline},
            )
            await db.commit()
            course_id = course.id
        
        # Step 4: Generate chapters
        chapters = outline.get("chapters", [])
        total_chapters = len(chapters)
        
        for i, chapter_outline in enumerate(chapters):
            progress = 20 + int((i / max(total_chapters, 1)) * 70)
            chapter_title = chapter_outline.get("title", f"Chapter {i + 1}")
            
            await update_status(
                block_id, "processing", progress,
                f"Generating chapter {i + 1}/{total_chapters}: {chapter_title}"
            )
            
            # Get chapter-specific RAG context
            chapter_context = await rag_service.get_context_for_generation(
                str(block_id),
                f"{chapter_title} {chapter_outline.get('outline', '')}",
                max_context_length=2000,
            )
            
            # Generate chapter content
            chapter_content = await ai_service.generate_chapter(
                course_title=outline.get("title", block_title),
                chapter_title=chapter_title,
                chapter_outline=chapter_outline.get("outline", ""),
                target=block_target,
                target_depth=block_target_depth,
                context=chapter_context,
            )
            
            # Save chapter with its own session
            async with AsyncSessionLocal() as db:
                await course_service.add_chapter(
                    db,
                    course_id=course_id,
                    order=i + 1,
                    title=chapter_title,
                    content=chapter_content,
                )
                await db.commit()
        
        # Complete
        await update_status(block_id, "completed", 100, "Course generation completed!", course_id)
        
    except Exception as e:
        # Handle error
        await update_status(block_id, "failed", 0, f"Generation failed: {str(e)}")
        raise
