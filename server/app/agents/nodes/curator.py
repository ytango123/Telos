"""Curator Agent: compresses raw retrieval blobs into atomic knowledge cards.

Also extracts media (currently from user_links rendered text, matching the
legacy pipeline) and produces a fallback combined_context so the graph can
gracefully degrade if cards fail.
"""

from __future__ import annotations

import logging
from typing import Any

from app.agents.runtime import dump_json, dump_text
from app.agents.state import BlockGenerationState, KnowledgeCard, RetrievalResult
from app.services.ai_service import AIService
from app.services.media_service import (
    extract_media_from_text,
    merge_catalogs,
    render_catalog_for_prompt,
)

logger = logging.getLogger(__name__)


def _build_combined_context(retrievals: dict[str, RetrievalResult]) -> str | None:
    """Fallback assembly identical in spirit to generation_service._assemble_context."""
    sections: list[str] = []

    user_parts: list[str] = []
    rag = retrievals.get("rag")
    if rag and rag.rendered_text:
        user_parts.append(f"## 上传的文件与笔记\n{rag.rendered_text}")

    links = retrievals.get("user_links")
    if links and links.rendered_text:
        user_parts.append(f"## 用户指定的链接（确定来源，已转为正文）\n{links.rendered_text}")

    if user_parts:
        sections.append(
            "# 用户提供的资料（请优先采纳）\n\n" + "\n\n".join(user_parts)
        )

    extras: list[str] = []
    for key in ("web", "arxiv", "github"):
        r = retrievals.get(key)
        if r and r.rendered_text:
            extras.append(f"## 来源: {key}\n{r.rendered_text}")
    if extras:
        sections.append("# 网络/专项检索补充资料\n\n" + "\n\n".join(extras))

    if not sections:
        return None
    return "\n\n========\n\n".join(sections)


def _cards_from_payload(payload: dict[str, Any]) -> tuple[list[KnowledgeCard], dict[str, list[str]]]:
    raw_cards = payload.get("cards") or []
    cards: list[KnowledgeCard] = []
    used_ids: set[str] = set()
    for idx, raw in enumerate(raw_cards):
        if not isinstance(raw, dict):
            continue
        cid = str(raw.get("id") or f"c{idx+1}").strip()
        if not cid or cid in used_ids:
            cid = f"c{idx+1}"
        used_ids.add(cid)
        cards.append(
            KnowledgeCard(
                id=cid,
                topic=str(raw.get("topic") or "").strip() or f"主题 {idx+1}",
                summary=str(raw.get("summary") or "").strip(),
                key_facts=[str(f) for f in (raw.get("key_facts") or []) if f],
                source_urls=[str(u) for u in (raw.get("source_urls") or []) if u],
                source_types=[str(t) for t in (raw.get("source_types") or []) if t],
            )
        )
    topic_index_raw = payload.get("topic_index") or {}
    topic_index: dict[str, list[str]] = {}
    if isinstance(topic_index_raw, dict):
        for topic, ids in topic_index_raw.items():
            if isinstance(ids, list):
                topic_index[str(topic)] = [str(i) for i in ids]
    return cards, topic_index


async def run(state: BlockGenerationState) -> dict:
    block_id = state["block_id"]
    retrievals: dict[str, RetrievalResult] = state.get("retrievals") or {}

    # Always compute the legacy combined_context for safe fallback.
    combined_context = _build_combined_context(retrievals)
    dump_text(block_id, "20_combined_context.md", combined_context)

    # Media catalog: merge ingested materials + links markdown extraction.
    link_rendered = ""
    links = retrievals.get("user_links")
    if links and links.rendered_text:
        link_rendered = links.rendered_text
    link_catalog = extract_media_from_text(
        link_rendered,
        source_url="user_links",
        image_limit=8,
        video_limit=3,
    )
    ingested = state.get("ingested_media_catalog")
    if ingested and not ingested.is_empty():
        media_catalog = merge_catalogs([ingested, link_catalog], image_limit=8, video_limit=3)
    else:
        media_catalog = link_catalog

    media_prompt = render_catalog_for_prompt(media_catalog) if not media_catalog.is_empty() else None

    # Build blocks fed to curator.
    blocks = []
    for key in ("rag", "user_links", "web", "arxiv", "github"):
        r = retrievals.get(key)
        if r and r.rendered_text:
            blocks.append({"source_key": key, "text": r.rendered_text})

    if not blocks:
        logger.info("[curator] no retrieval text available; skipping LLM curation")
        return {
            "knowledge_cards": [],
            "topic_index": {},
            "combined_context": combined_context,
            "media_catalog": media_catalog,
        }

    ai = AIService()
    payload: dict[str, Any] = {}
    try:
        payload = await ai.curate_knowledge_cards(
            title=state.get("block_title", ""),
            target=state.get("block_target", ""),
            retrieval_blocks=blocks,
            media_catalog_prompt=media_prompt,
        )
    except Exception as exc:
        logger.warning("[curator] LLM curation failed: %s", exc)

    cards, topic_index = _cards_from_payload(payload)

    dump_json(block_id, "21_cards.json", {
        "cards": [
            {
                "id": c.id,
                "topic": c.topic,
                "summary": c.summary,
                "key_facts": c.key_facts,
                "source_urls": c.source_urls,
                "source_types": c.source_types,
            }
            for c in cards
        ],
        "topic_index": topic_index,
    })

    return {
        "knowledge_cards": cards,
        "topic_index": topic_index,
        "combined_context": combined_context,
        "media_catalog": media_catalog,
    }
