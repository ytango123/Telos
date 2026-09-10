"""Web retriever: Tavily search + Jina Reader extraction (Pipeline A)."""

from __future__ import annotations

import logging

from app.agents.state import BlockGenerationState, RetrievalItem, RetrievalResult
from app.services.retrieval_service import RetrievalService

logger = logging.getLogger(__name__)


async def run(state: BlockGenerationState) -> dict:
    title = state.get("block_title", "")
    desc = state.get("block_description", "")
    target = state.get("block_target", "")
    prefs = list(state.get("block_source_preferences") or [])
    depth = state.get("block_target_depth", "standard")

    meta: dict = {"provider": "tavily+jina"}

    svc = RetrievalService()
    try:
        rendered, web_meta = await svc.get_web_context(
            title=title,
            description=desc,
            target=target,
            source_preferences=prefs,
            target_depth=depth,
        )
    except Exception as exc:
        logger.warning("[retriever:web] failed: %s", exc)
        meta["error"] = f"{exc.__class__.__name__}: {exc}"
        rendered, web_meta = None, {}
    finally:
        await svc.close()

    meta.update(web_meta)

    items: list[RetrievalItem] = []
    if rendered:
        items.append(
            RetrievalItem(
                title="网络检索合集",
                url="",
                snippet=rendered[:300],
                raw_text=rendered,
                source_type="web",
                meta=web_meta,
            )
        )
    meta["items_count"] = len(items)

    return {
        "retrievals": {
            "web": RetrievalResult(
                source_key="web",
                items=items,
                rendered_text=rendered,
                meta=meta,
            )
        }
    }
