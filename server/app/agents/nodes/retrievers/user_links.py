"""User-link retriever: fetches user-pasted URLs via Jina Reader (Pipeline B)."""

from __future__ import annotations

import logging

from app.agents.state import BlockGenerationState, RetrievalItem, RetrievalResult
from app.services.retrieval_service import RetrievalService

logger = logging.getLogger(__name__)


async def run(state: BlockGenerationState) -> dict:
    links = state.get("user_links") or []
    meta: dict = {"provider": "jina_reader", "input_count": len(links)}

    if not links:
        return {
            "retrievals": {
                "user_links": RetrievalResult(
                    source_key="user_links",
                    items=[],
                    rendered_text=None,
                    meta=meta,
                )
            }
        }

    svc = RetrievalService()
    try:
        rendered, link_meta = await svc.get_user_links_context(
            links,
            video_transcripts=state.get("video_transcripts"),
        )
    except Exception as exc:
        logger.warning("[retriever:user_links] failed: %s", exc)
        meta["error"] = f"{exc.__class__.__name__}: {exc}"
        rendered, link_meta = None, {}
    finally:
        await svc.close()

    meta.update(link_meta)

    items: list[RetrievalItem] = []
    if rendered:
        # Keep one synthetic item per logical user link (we don't have a clean per-link split here).
        items.append(
            RetrievalItem(
                title="用户指定链接合集",
                url="",
                snippet=rendered[:300],
                raw_text=rendered,
                source_type="user_link",
                meta=link_meta,
            )
        )
    meta["items_count"] = len(items)

    return {
        "retrievals": {
            "user_links": RetrievalResult(
                source_key="user_links",
                items=items,
                rendered_text=rendered,
                meta=meta,
            )
        }
    }
