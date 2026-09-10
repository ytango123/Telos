"""GitHub retriever node."""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.agents.state import BlockGenerationState, RetrievalResult
from app.services.sources.github import search_github

logger = logging.getLogger(__name__)


def _queries_for_state(state: BlockGenerationState) -> list[str]:
    plan = state.get("plan") or {}
    sub = [q for q in (plan.get("sub_queries") or []) if q]
    if sub:
        return sub[:2]
    parts = [state.get("block_title", ""), state.get("block_target", "")]
    fallback = " ".join(p for p in parts if p and p.strip())
    return [fallback] if fallback else []


async def run(state: BlockGenerationState) -> dict:
    queries = _queries_for_state(state)
    if not queries:
        return {
            "retrievals": {
                "github": RetrievalResult(
                    source_key="github",
                    items=[],
                    meta={"provider": "github", "skipped": "no_query"},
                )
            }
        }

    aggregated_items = []
    aggregated_meta = {"provider": "github", "queries": queries, "per_query": []}

    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as client:
        results = await asyncio.gather(
            *[search_github(q, max_results=5, client=client) for q in queries]
        )
    for q, result in zip(queries, results):
        aggregated_items.extend(result.items)
        aggregated_meta["per_query"].append(
            {"query": q, "count": len(result.items), **{k: v for k, v in result.meta.items() if k != "query"}}
        )

    dedup: dict[str, object] = {}
    for it in aggregated_items:
        if it.url and it.url not in dedup:
            dedup[it.url] = it
    items = list(dedup.values())[:8]
    aggregated_meta["items_count"] = len(items)

    rendered = (
        "\n\n---\n\n".join(
            f"[GitHub: {it.title}]\nURL: {it.url}\n{it.raw_text}" for it in items
        )
        if items
        else None
    )

    return {
        "retrievals": {
            "github": RetrievalResult(
                source_key="github",
                items=items,
                rendered_text=rendered,
                meta=aggregated_meta,
            )
        }
    }
