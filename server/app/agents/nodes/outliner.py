"""Outliner Agent: turns knowledge cards into a course outline.

Falls back to the legacy `generate_outline(context=...)` path when no cards are
available, so partial failures still produce a usable course.
"""

from __future__ import annotations

import logging

from app.agents.runtime import dump_json
from app.agents.state import BlockGenerationState, KnowledgeCard
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)


def _format_cards_for_outline(cards: list[KnowledgeCard], limit: int = 30) -> str:
    if not cards:
        return ""
    rows = []
    for c in cards[:limit]:
        rows.append(f"- [{c.id}] {c.topic}: {c.summary[:160]}")
    return "\n".join(rows)


async def run(state: BlockGenerationState) -> dict:
    block_id = state["block_id"]
    cards: list[KnowledgeCard] = state.get("knowledge_cards") or []
    plan = state.get("plan") or {}
    chapter_hint = plan.get("chapter_hint_count")

    ai = AIService()

    outline: dict
    if cards:
        cards_summary = _format_cards_for_outline(cards)
        try:
            outline = await ai.generate_outline_from_cards(
                title=state.get("block_title", ""),
                description=state.get("block_description", ""),
                target=state.get("block_target", ""),
                target_depth=state.get("block_target_depth", "standard"),
                cards_summary=cards_summary,
                chapter_hint=chapter_hint,
            )
        except Exception as exc:
            logger.warning("[outliner] card-based outline failed, fallback to context outline: %s", exc)
            outline = await _fallback_outline(state, ai)
    else:
        outline = await _fallback_outline(state, ai)

    # Validate shape & ensure chapters carry relevant_card_ids field.
    chapters_raw = outline.get("chapters") or []
    chapters: list[dict] = []
    known_ids = {c.id for c in cards}
    for idx, ch in enumerate(chapters_raw):
        if not isinstance(ch, dict):
            continue
        rel = ch.get("relevant_card_ids") or []
        rel_clean = [str(r) for r in rel if isinstance(r, (str, int)) and str(r) in known_ids]
        chapters.append({
            "title": str(ch.get("title") or f"Chapter {idx+1}").strip(),
            "outline": str(ch.get("outline") or "").strip(),
            "relevant_card_ids": rel_clean,
        })
    outline["chapters"] = chapters

    dump_json(block_id, "30_outline.json", outline)
    return {"outline": outline}


async def _fallback_outline(state: BlockGenerationState, ai: AIService) -> dict:
    context = state.get("combined_context")
    return await ai.generate_outline(
        title=state.get("block_title", ""),
        description=state.get("block_description", ""),
        target=state.get("block_target", ""),
        target_depth=state.get("block_target_depth", "standard"),
        context=context,
    )
