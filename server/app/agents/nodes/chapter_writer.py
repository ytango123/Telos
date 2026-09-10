"""ChapterWriter node: writes every chapter in parallel under a semaphore.

For simplicity we run the whole fan-out inside one LangGraph node. This keeps
ordering and per-chapter progress reporting easy, while still parallelizing the
expensive LLM calls. Concurrency is bounded by `_WRITER_CONCURRENCY` to stay
well within DeepSeek rate limits.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Awaitable

from app.agents.state import BlockGenerationState, KnowledgeCard, WrittenChapter
from app.services.ai_service import AIService
from app.services.media_service import (
    MediaCatalog,
    apply_media_placeholders,
    render_catalog_for_prompt,
)

logger = logging.getLogger(__name__)

_WRITER_CONCURRENCY = 3


def _cards_block_for_chapter(
    chapter: dict,
    cards: list[KnowledgeCard],
    max_cards: int = 8,
) -> str:
    if not cards:
        return ""
    by_id = {c.id: c for c in cards}
    ids = chapter.get("relevant_card_ids") or []
    chosen: list[KnowledgeCard] = []
    for cid in ids:
        c = by_id.get(cid)
        if c and c not in chosen:
            chosen.append(c)
        if len(chosen) >= max_cards:
            break
    # If outliner didn't pick any, fall back to top-N as a safety net.
    if not chosen:
        chosen = cards[:max_cards]
    return "\n\n".join(c.render() for c in chosen)


def _transcript_snippet_for_chapter(
    chapter: dict,
    cards: list,
    video_transcripts: list[dict],
    max_chars: int = 600,
) -> str:
    if not video_transcripts:
        return ""
    relevant_ids = set(chapter.get("relevant_card_ids") or [])
    card_urls: set[str] = set()
    for c in cards:
        if c.id in relevant_ids:
            card_urls.update(c.source_urls or [])
    parts: list[str] = []
    used = 0
    for vt in video_transcripts:
        mid = vt.get("media_id", "")
        if card_urls and mid not in card_urls and vt.get("source_url") not in card_urls:
            continue
        title = vt.get("title") or "视频"
        excerpt = (vt.get("excerpt") or "")[:max_chars]
        if not excerpt:
            continue
        piece = f"【视频字幕摘录: {title} ({mid})】\n{excerpt}"
        if used + len(piece) > max_chars:
            break
        parts.append(piece)
        used += len(piece)
    if not parts and video_transcripts:
        vt = video_transcripts[0]
        excerpt = (vt.get("excerpt") or "")[:max_chars]
        if excerpt:
            parts.append(f"【视频字幕摘录: {vt.get('title', '视频')}】\n{excerpt}")
    return "\n\n".join(parts)


def _card_source_refs(chapter: dict, cards: list[KnowledgeCard]) -> set[str]:
    relevant_ids = set(chapter.get("relevant_card_ids") or [])
    refs: set[str] = set()
    for c in cards:
        if c.id in relevant_ids:
            refs.update((u or "").strip() for u in c.source_urls or [])
    return {r for r in refs if r}


def _media_catalog_for_chapter(
    chapter: dict,
    cards: list[KnowledgeCard],
    catalog: MediaCatalog | None,
    *,
    used_image_ids: set[str] | None = None,
    used_video_ids: set[str] | None = None,
) -> MediaCatalog | None:
    """Only expose media explicitly tied to this chapter's knowledge cards."""
    if not catalog or catalog.is_empty():
        return None

    used_image_ids = used_image_ids or set()
    used_video_ids = used_video_ids or set()
    refs = _card_source_refs(chapter, cards)
    if not refs:
        return None

    images = [
        img
        for img in catalog.images
        if img.id not in used_image_ids
        and (
            img.id in refs
            or img.url in refs
            or (img.source_url and img.source_url in refs)
        )
    ]
    videos = [
        vid
        for vid in catalog.videos
        if vid.id not in used_video_ids
        and (
            vid.id in refs
            or vid.url in refs
            or (vid.source_url and vid.source_url in refs)
        )
    ]
    filtered = MediaCatalog(images=images, videos=videos)
    return filtered if not filtered.is_empty() else None


def _assign_media_to_chapters(
    chapters: list[dict],
    cards: list[KnowledgeCard],
    catalog: MediaCatalog | None,
) -> list[MediaCatalog | None]:
    """Distribute relevant media across chapters instead of showing all media everywhere."""
    assigned: list[MediaCatalog | None] = []
    used_image_ids: set[str] = set()
    used_video_ids: set[str] = set()

    for chapter in chapters:
        chapter_media = _media_catalog_for_chapter(
            chapter,
            cards,
            catalog,
            used_image_ids=used_image_ids,
            used_video_ids=used_video_ids,
        )
        if chapter_media:
            used_image_ids.update(img.id for img in chapter_media.images)
            used_video_ids.update(vid.id for vid in chapter_media.videos)
        assigned.append(chapter_media)
    return assigned


async def _write_one(
    ai: AIService,
    *,
    course_title: str,
    chapter: dict,
    target: str,
    target_depth: str,
    cards: list[KnowledgeCard],
    media_catalog: MediaCatalog | None,
    media_prompt: str | None,
    transcript_snippet: str | None,
    fallback_context: str | None,
    sem: asyncio.Semaphore,
    on_done: Callable[[int, dict], Awaitable[None]] | None,
    order: int,
) -> WrittenChapter:
    cards_block = _cards_block_for_chapter(chapter, cards)
    if transcript_snippet:
        cards_block = (cards_block + "\n\n" + transcript_snippet).strip()
    async with sem:
        try:
            if cards_block:
                content = await ai.generate_chapter_from_cards(
                    course_title=course_title,
                    chapter_title=chapter["title"],
                    chapter_outline=chapter.get("outline", ""),
                    target=target,
                    target_depth=target_depth,
                    cards_block=cards_block,
                    media_catalog_prompt=media_prompt,
                )
            else:
                content = await ai.generate_chapter(
                    course_title=course_title,
                    chapter_title=chapter["title"],
                    chapter_outline=chapter.get("outline", ""),
                    target=target,
                    target_depth=target_depth,
                    context=fallback_context,
                    media_catalog_prompt=media_prompt,
                )
        except Exception as exc:
            logger.exception("[writer] chapter %s failed: %s", chapter.get("title"), exc)
            content = f"> 本章生成失败：{exc}"

    if media_catalog and not media_catalog.is_empty():
        content = apply_media_placeholders(content, media_catalog)

    written: WrittenChapter = {
        "order": order,
        "title": chapter["title"],
        "outline": chapter.get("outline", ""),
        "content": content,
        "relevant_card_ids": chapter.get("relevant_card_ids") or [],
    }
    if on_done:
        try:
            await on_done(order, written)
        except Exception as exc:  # pragma: no cover - progress is best-effort
            logger.debug("[writer] on_done callback raised: %s", exc)
    return written


def make_chapter_writer_node(
    on_chapter_done: Callable[[int, int, dict], Awaitable[None]] | None = None,
):
    """Factory so callers can inject a progress callback (per chapter)."""

    async def run(state: BlockGenerationState) -> dict[str, Any]:
        outline = state.get("outline") or {}
        chapters = outline.get("chapters") or []
        if not chapters:
            return {"chapters": []}

        cards = state.get("knowledge_cards") or []
        media_catalog = state.get("media_catalog")
        fallback_context = state.get("combined_context")
        course_title = outline.get("title") or state.get("block_title", "")
        target = state.get("block_target", "")
        depth = state.get("block_target_depth", "standard")

        video_transcripts = state.get("video_transcripts") or []

        ai = AIService()
        sem = asyncio.Semaphore(_WRITER_CONCURRENCY)
        total = len(chapters)

        async def _emit(order: int, written: WrittenChapter) -> None:
            if on_chapter_done:
                await on_chapter_done(order, total, written)

        chapter_media_list = _assign_media_to_chapters(chapters, cards, media_catalog)

        tasks = []
        for i, chapter in enumerate(chapters):
            chapter_media = chapter_media_list[i] if i < len(chapter_media_list) else None
            tasks.append(
                _write_one(
                    ai,
                    course_title=course_title,
                    chapter=chapter,
                    target=target,
                    target_depth=depth,
                    cards=cards,
                    media_catalog=chapter_media,
                    media_prompt=(
                        render_catalog_for_prompt(chapter_media)
                        if chapter_media and not chapter_media.is_empty()
                        else None
                    ),
                    transcript_snippet=_transcript_snippet_for_chapter(
                        chapter, cards, video_transcripts
                    ),
                    fallback_context=fallback_context,
                    sem=sem,
                    on_done=_emit,
                    order=i + 1,
                )
            )

        results = await asyncio.gather(*tasks)
        results_sorted = sorted(results, key=lambda c: c.get("order", 0))
        return {"chapters": results_sorted}

    return run
