import threading
import logging
import re
from uuid import UUID
from typing import Optional

from app.db.database import AsyncSessionLocal
from app.services import block_service, course_service
from app.services.ai_service import AIService
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)

_generation_cancelled: set[str] = set()
_generation_cancel_lock = threading.Lock()


def _is_valid_summary_title(title: str, description: str) -> bool:
    """Allow only concise non-placeholder non-description-like titles."""
    t = (title or "").strip()
    if not t or t == "新任务":
        return False
    if len(t) < 4:
        return False
    d = re.sub(r"\s+", " ", (description or "").strip())
    if d:
        prefix = d[:12]
        if prefix and t.startswith(prefix):
            return False
    return True


def mark_generation_cancelled(block_id: UUID) -> None:
    """User requested cancel; background task should stop at the next safe point."""
    with _generation_cancel_lock:
        _generation_cancelled.add(str(block_id))


def clear_generation_cancelled(block_id: UUID) -> None:
    with _generation_cancel_lock:
        _generation_cancelled.discard(str(block_id))


def is_generation_cancelled(block_id: UUID) -> bool:
    with _generation_cancel_lock:
        return str(block_id) in _generation_cancelled


async def abort_if_user_cancelled(block_id: UUID) -> bool:
    """If cancel was requested, wipe partial course and reset block to draft. Returns True if aborted."""
    if not is_generation_cancelled(block_id):
        return False
    clear_generation_cancelled(block_id)
    async with AsyncSessionLocal() as db:
        await course_service.delete_courses_by_block(db, str(block_id))
        await block_service.update_block_status(
            db, block_id, "draft", 0, "已取消生成", clear_course_id=True
        )
        block = await block_service.get_block(db, block_id)
        if block:
            block.title = "新任务"
        await db.commit()
    return True


async def update_status(
    block_id: UUID,
    status: str,
    progress: int = 0,
    message: str = "",
    course_id: Optional[str] = None,
    *,
    clear_course_id: bool = False,
):
    """Helper to update block status with its own session"""
    # Avoid writing stale "processing/completed" states after user requested cancel.
    if status in ("processing", "completed") and is_generation_cancelled(block_id):
        await abort_if_user_cancelled(block_id)
        return
    async with AsyncSessionLocal() as db:
        await block_service.update_block_status(
            db, block_id, status, progress, message, course_id, clear_course_id=clear_course_id
        )
        await db.commit()


async def generate_course(block_id: UUID):
    """Background task to generate course content for a block"""
    clear_generation_cancelled(block_id)
    ai_service = AIService()

    try:
        async with AsyncSessionLocal() as db:
            block = await block_service.get_block(db, block_id)
            if not block:
                return
            block_title = block.title
            block_description = block.description or ""
            block_target = block.target or ""
            block_target_depth = block.target_depth

        if await abort_if_user_cancelled(block_id):
            return

        await update_status(block_id, "processing", 2, "检索学习资料…")

        # Always try to regenerate title on each generation run.
        logger.info("[Generation] block=%s title_before=%r", block_id, block_title)
        summarized_title = "新任务"
        if block_description.strip():
            summarized_title = await ai_service.summarize_title(block_description)

        # Two-state guarantee: keep "新任务" unless we have a valid summary title.
        block_title = summarized_title if _is_valid_summary_title(summarized_title, block_description) else "新任务"

        async with AsyncSessionLocal() as db:
            block = await block_service.get_block(db, block_id)
            if block:
                block.title = block_title
                await db.commit()
                logger.info("[Generation] block=%s title_after_summarize=%r", block_id, block_title)

        if await abort_if_user_cancelled(block_id):
            return

        rag_context = await rag_service.get_context_for_generation(
            str(block_id),
            f"{block_title} {block_description} {block_target}",
        )

        if await abort_if_user_cancelled(block_id):
            return

        await update_status(block_id, "processing", 10, "正在生成课程大纲…")

        outline = await ai_service.generate_outline(
            title=block_title,
            description=block_description,
            target=block_target,
            target_depth=block_target_depth,
            context=rag_context,
        )

        if await abort_if_user_cancelled(block_id):
            return

        # Fallback: if summarize_title stayed "新任务", use outline title only when it is valid.
        if block_title == "新任务":
            outline_title = (outline.get("title") or "").strip()
            if _is_valid_summary_title(outline_title, block_description):
                block_title = outline_title
                async with AsyncSessionLocal() as db:
                    block = await block_service.get_block(db, block_id)
                    if block:
                        block.title = block_title
                        await db.commit()
                        logger.info("[Generation] block=%s title_after_outline_fallback=%r", block_id, block_title)

        await update_status(block_id, "processing", 20, "正在创建课程结构…")

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

        chapters = outline.get("chapters", [])
        total_chapters = len(chapters)

        for i, chapter_outline in enumerate(chapters):
            if await abort_if_user_cancelled(block_id):
                return

            progress = 20 + int((i / max(total_chapters, 1)) * 70)
            chapter_title = chapter_outline.get("title", f"Chapter {i + 1}")

            await update_status(
                block_id,
                "processing",
                progress,
                f"第 {i + 1}/{total_chapters} 章：{chapter_title}",
            )

            chapter_context = await rag_service.get_context_for_generation(
                str(block_id),
                f"{chapter_title} {chapter_outline.get('outline', '')}",
                max_context_length=2000,
            )

            if await abort_if_user_cancelled(block_id):
                return

            await update_status(
                block_id,
                "processing",
                progress,
                f"第 {i + 1}/{total_chapters} 章：{chapter_title}",
            )

            chapter_content = await ai_service.generate_chapter(
                course_title=outline.get("title", block_title),
                chapter_title=chapter_title,
                chapter_outline=chapter_outline.get("outline", ""),
                target=block_target,
                target_depth=block_target_depth,
                context=chapter_context,
            )

            if await abort_if_user_cancelled(block_id):
                return

            async with AsyncSessionLocal() as db:
                await course_service.add_chapter(
                    db,
                    course_id=course_id,
                    order=i + 1,
                    title=chapter_title,
                    content=chapter_content,
                )
                await db.commit()

        await update_status(
            block_id, "completed", 100, "Course generation completed!", str(course_id)
        )
        clear_generation_cancelled(block_id)

    except Exception as e:
        if is_generation_cancelled(block_id):
            await abort_if_user_cancelled(block_id)
            return
        clear_generation_cancelled(block_id)
        await update_status(block_id, "failed", 0, f"Generation failed: {str(e)}")
        raise
