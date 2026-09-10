"""RAG retriever: pulls relevant chunks from LanceDB for the whole-block query."""

from __future__ import annotations

import logging

from app.agents.state import BlockGenerationState, RetrievalItem, RetrievalResult
from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)


async def run(state: BlockGenerationState) -> dict:
    block_id = state["block_id"]
    title = state.get("block_title", "")
    desc = state.get("block_description", "")
    target = state.get("block_target", "")
    query = f"{title} {desc} {target}".strip()
    meta = {"provider": "lancedb", "query_length": len(query)}

    try:
        context = await rag_service.get_context_for_generation(block_id, query)
    except Exception as exc:
        logger.warning("[retriever:rag] failed: %s", exc)
        meta["error"] = f"{exc.__class__.__name__}: {exc}"
        context = None

    items: list[RetrievalItem] = []
    if context:
        items.append(
            RetrievalItem(
                title="用户上传材料 (RAG)",
                url="",
                snippet=context[:300],
                raw_text=context,
                source_type="rag",
            )
        )
    meta["items_count"] = len(items)

    return {
        "retrievals": {
            "rag": RetrievalResult(
                source_key="rag",
                items=items,
                rendered_text=context,
                meta=meta,
            )
        }
    }
