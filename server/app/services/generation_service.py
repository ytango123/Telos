"""Course generation orchestration.

Phase 1 was a hand-rolled linear pipeline. We now delegate the heavy lifting to
a LangGraph DAG (`app.agents.graph`) so retrieval can fan-out, knowledge can be
curated into cards, and chapters can be written in parallel.

This module is responsible for:
  - Spawning the background task and wiring it to FastAPI status updates
  - Title summarization (still done up front, cheap)
  - Cancellation semantics
  - Streaming progress as each chapter completes
  - Falling back gracefully if the graph raises
"""

from __future__ import annotations

import logging
import re
import threading
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.agents.graph import build_course_graph
from app.agents.state import BlockGenerationState
from app.db.database import AsyncSessionLocal
from app.services import block_service, course_service
from app.services.ai_service import AIService
from app.services.materials.ingest import (
    build_media_catalog_from_materials,
    material_ingest_service,
)

logger = logging.getLogger(__name__)

_generation_cancelled: set[str] = set()
_generation_cancel_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Cancellation helpers (kept; consumed by both the orchestrator and nodes)
# ---------------------------------------------------------------------------


def _is_valid_summary_title(title: str, description: str) -> bool:
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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mark_generation_cancelled(block_id: UUID) -> None:
    with _generation_cancel_lock:
        _generation_cancelled.add(str(block_id))


def clear_generation_cancelled(block_id: UUID) -> None:
    with _generation_cancel_lock:
        _generation_cancelled.discard(str(block_id))


def is_generation_cancelled(block_id: UUID) -> bool:
    with _generation_cancel_lock:
        return str(block_id) in _generation_cancelled


async def abort_if_user_cancelled(block_id: UUID) -> bool:
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
            debug = block.generation_debug or {}
            events = list(debug.get("events", []))
            events.append({"ts": _utc_now_iso(), "stage": "cancel", "message": "generation_cancelled"})
            debug["events"] = events[-80:]
            debug["status"] = "cancelled"
            debug["finished_at"] = _utc_now_iso()
            block.generation_debug = debug
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
    if status in ("processing", "completed") and is_generation_cancelled(block_id):
        await abort_if_user_cancelled(block_id)
        return
    async with AsyncSessionLocal() as db:
        await block_service.update_block_status(
            db, block_id, status, progress, message, course_id, clear_course_id=clear_course_id
        )
        await db.commit()


def _debug_enabled() -> bool:
    from app.config import settings  # local import to allow runtime reconfig

    return bool(settings.retrieval_debug_mode)


async def append_generation_debug_event(block_id: UUID, event: dict) -> None:
    if not _debug_enabled():
        return
    async with AsyncSessionLocal() as db:
        block = await block_service.get_block(db, block_id)
        if not block:
            return
        debug = block.generation_debug or {}
        events = list(debug.get("events", []))
        events.append({"ts": _utc_now_iso(), **event})
        debug["events"] = events[-80:]
        block.generation_debug = debug
        await db.commit()


async def merge_generation_debug(block_id: UUID, patch: dict) -> None:
    if not _debug_enabled():
        return
    async with AsyncSessionLocal() as db:
        block = await block_service.get_block(db, block_id)
        if not block:
            return
        debug = block.generation_debug or {}
        debug.update(patch)
        block.generation_debug = debug
        await db.commit()


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def generate_course(block_id: UUID):
    """Background task: drive the multi-agent graph for one block."""
    clear_generation_cancelled(block_id)

    try:
        if _debug_enabled():
            await merge_generation_debug(
                block_id,
                {
                    "started_at": _utc_now_iso(),
                    "status": "running",
                    "events": [],
                    "graph": "multi-agent.v1",
                },
            )

        # 1) Snapshot the block (we re-open sessions later as needed).
        async with AsyncSessionLocal() as db:
            block = await block_service.get_block(db, block_id)
            if not block:
                return
            block_title = block.title
            block_description = block.description or ""
            block_target = block.target or ""
            block_target_depth = block.target_depth
            block_source_preferences = list(block.source_preferences or [])
            user_links = [
                {"url": a.source_url, "title": a.original_name, "kind": a.kind}
                for a in block.attachments
                if a.kind in ("link", "video") and a.source_url
            ]
            attachments = list(block.attachments)

        if await abort_if_user_cancelled(block_id):
            return

        await update_status(block_id, "processing", 2, "正在理解你的资料…")
        await append_generation_debug_event(
            block_id, {"stage": "start", "message": "generation_started"}
        )

        async def _ingest_progress(msg: str) -> None:
            await update_status(block_id, "processing", 4, msg)

        material_bundle = await material_ingest_service.ingest_block(
            block_id=str(block_id),
            attachments=attachments,
            on_progress=_ingest_progress,
        )
        material_metadata = [m.to_dict() for m in material_bundle.metadata]
        ingested_media_catalog = build_media_catalog_from_materials(material_bundle)
        video_transcripts = []
        for v in material_bundle.videos:
            if v.transcript and v.transcript.text:
                excerpt = v.transcript.text[:600]
                video_transcripts.append(
                    {
                        "media_id": v.media_id,
                        "title": v.title,
                        "source_url": v.source_url,
                        "excerpt": excerpt,
                        "status": v.transcript_status,
                    }
                )

        if await abort_if_user_cancelled(block_id):
            return

        await update_status(block_id, "processing", 6, "检索学习资料…")

        # 2) Title summarization (cheap; up front so the UI updates fast).
        ai_service = AIService()
        summarized_title = "新任务"
        if block_description.strip():
            summarized_title = await ai_service.summarize_title(block_description)
        if _is_valid_summary_title(summarized_title, block_description):
            block_title = summarized_title
            async with AsyncSessionLocal() as db:
                block = await block_service.get_block(db, block_id)
                if block:
                    block.title = block_title
                    await db.commit()

        if await abort_if_user_cancelled(block_id):
            return

        # 3) Build initial graph state.
        state: BlockGenerationState = {
            "block_id": str(block_id),
            "block_title": block_title,
            "block_description": block_description,
            "block_target": block_target,
            "block_target_depth": block_target_depth or "standard",
            "block_source_preferences": block_source_preferences,
            "user_links": user_links,
            "material_metadata": material_metadata,
            "ingested_media_catalog": ingested_media_catalog,
            "video_transcripts": video_transcripts,
            "retrievals": {},
            "chapters": [],
        }

        # 4) Course row is created after the outliner runs (we need its title);
        #    however we want to stream chapter persistence, so we create a
        #    placeholder course as soon as the outline is ready.
        course_id_holder: dict[str, Optional[str]] = {"id": None}
        outline_holder: dict[str, dict] = {"outline": {}}

        async def _on_chapter_done(order: int, total: int, written: dict) -> None:
            if await abort_if_user_cancelled(block_id):
                return
            cid = course_id_holder["id"]
            if not cid:
                return
            async with AsyncSessionLocal() as db:
                await course_service.add_chapter(
                    db,
                    course_id=cid,
                    order=order,
                    title=written["title"],
                    content=written["content"],
                )
                await db.commit()
            progress = 20 + int((order / max(total, 1)) * 75)
            await update_status(
                block_id,
                "processing",
                progress,
                f"第 {order}/{total} 章：{written['title']}",
            )

        graph = build_course_graph(on_chapter_done=_on_chapter_done)

        # 5) Stream graph execution so we can react when the outline is ready.
        await update_status(block_id, "processing", 5, "规划检索策略…")
        last_event_stage = "planner"

        async for event in graph.astream(state, stream_mode="values"):
            if await abort_if_user_cancelled(block_id):
                return

            # Progress heuristics keyed by which state fields are now present.
            if event.get("plan") and last_event_stage == "planner":
                enabled = ",".join(event["plan"].get("enabled_retrievers", []))
                await update_status(
                    block_id, "processing", 8, f"已选检索源：{enabled or 'web'}"
                )
                await append_generation_debug_event(
                    block_id,
                    {"stage": "planner", "message": "plan_ready", "plan": event["plan"]},
                )
                last_event_stage = "retrievals"

            elif event.get("retrievals") and last_event_stage == "retrievals":
                # Multi-pass during fanout; only emit once when something landed.
                count = len(event["retrievals"])
                await update_status(
                    block_id, "processing", 12, f"汇总检索结果（{count} 路）…"
                )
                await append_generation_debug_event(
                    block_id,
                    {
                        "stage": "retrievals",
                        "message": "retrievals_partial",
                        "sources": sorted(event["retrievals"].keys()),
                    },
                )
                last_event_stage = "curator"

            elif event.get("knowledge_cards") is not None and last_event_stage == "curator":
                await update_status(
                    block_id,
                    "processing",
                    15,
                    f"策展出 {len(event['knowledge_cards'])} 张知识卡片…",
                )
                last_event_stage = "outliner"

            elif event.get("outline") and not course_id_holder["id"]:
                outline = event["outline"]
                outline_holder["outline"] = outline
                # Title fallback: if summarize_title left the placeholder, take outline title.
                if block_title == "新任务":
                    outline_title = (outline.get("title") or "").strip()
                    if _is_valid_summary_title(outline_title, block_description):
                        block_title = outline_title
                        async with AsyncSessionLocal() as db:
                            block = await block_service.get_block(db, block_id)
                            if block:
                                block.title = block_title
                                await db.commit()
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
                    course_id_holder["id"] = course.id

                await append_generation_debug_event(
                    block_id,
                    {
                        "stage": "outline",
                        "message": "outline_ready",
                        "chapter_count": len(outline.get("chapters") or []),
                    },
                )
                last_event_stage = "writer"

        # Graph finished.
        if await abort_if_user_cancelled(block_id):
            return

        course_id = course_id_holder["id"]
        if not course_id:
            raise RuntimeError("Graph finished without producing an outline")

        await update_status(
            block_id, "completed", 100, "Course generation completed!", str(course_id)
        )
        await append_generation_debug_event(
            block_id,
            {"stage": "finish", "message": "generation_completed", "course_id": course_id},
        )
        await merge_generation_debug(
            block_id, {"finished_at": _utc_now_iso(), "status": "completed"}
        )
        clear_generation_cancelled(block_id)

    except Exception as e:
        if is_generation_cancelled(block_id):
            await abort_if_user_cancelled(block_id)
            return
        clear_generation_cancelled(block_id)
        logger.exception("[Generation] block=%s failed", block_id)
        await append_generation_debug_event(
            block_id, {"stage": "error", "message": "generation_failed", "error": str(e)}
        )
        await merge_generation_debug(
            block_id, {"finished_at": _utc_now_iso(), "status": "failed", "error": str(e)}
        )
        await update_status(block_id, "failed", 0, f"Generation failed: {str(e)}")
        raise
