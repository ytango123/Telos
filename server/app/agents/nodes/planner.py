"""Planner Agent: decides which retrievers to enable and generates sub_queries.

Combines heuristic gating (keyword + source_preferences) with an LLM call. The
LLM choice is treated as a suggestion - we always intersect it with what is
actually available (e.g. don't enable `rag` if the block has no attachments).
"""

from __future__ import annotations

import logging
from typing import Iterable

from app.agents.runtime import dump_json
from app.agents.state import BlockGenerationState, PlannerDecision
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)


_ARXIV_KEYWORDS = (
    "论文", "学术", "研究", "理论", "算法", "推导", "证明",
    "paper", "research", "theorem", "proof", "model architecture",
)
_GITHUB_KEYWORDS = (
    "代码", "项目", "库", "实现", "源码", "工程", "框架", "SDK",
    "code", "library", "framework", "implementation", "repo", "repository",
)


def _heuristic_sources(
    *,
    title: str,
    description: str,
    target: str,
    source_preferences: list[str],
    target_depth: str,
    has_user_links: bool,
    has_rag: bool,
) -> set[str]:
    enabled: set[str] = {"web"}
    if has_rag:
        enabled.add("rag")
    if has_user_links:
        enabled.add("user_links")

    blob = " ".join([title, description, target]).lower()
    prefs_lower = {p.lower() for p in source_preferences}

    if "arxiv" in prefs_lower or any(k.lower() in blob for k in _ARXIV_KEYWORDS):
        enabled.add("arxiv")
    if target_depth == "deep_dive" and any(
        k.lower() in blob for k in ("model", "学习", "网络", "transformer")
    ):
        # deep_dive on technical topics implicitly benefits from arxiv
        enabled.add("arxiv")

    if "github" in prefs_lower or any(k.lower() in blob for k in _GITHUB_KEYWORDS):
        enabled.add("github")

    return enabled


def _intersect(llm: Iterable[str] | None, allowed: set[str]) -> list[str]:
    if not llm:
        return sorted(allowed)
    chosen = {s.strip().lower() for s in llm if s}
    return sorted(chosen & allowed | {"web"})  # web always on as a safety net


async def run(state: BlockGenerationState) -> dict:
    has_user_links = bool(state.get("user_links"))
    material_meta = state.get("material_metadata") or []
    has_images = any(m.get("kind") == "image" for m in material_meta)
    has_videos = any(m.get("kind") == "video" for m in material_meta)
    title = state.get("block_title", "")
    desc = state.get("block_description", "")
    target = state.get("block_target", "")
    depth = state.get("block_target_depth", "standard")
    prefs = state.get("block_source_preferences") or []

    heur = _heuristic_sources(
        title=title,
        description=desc,
        target=target,
        source_preferences=prefs,
        target_depth=depth,
        has_user_links=has_user_links,
        has_rag=True,  # let RAG always be eligible; node returns empty if no docs
    )

    ai = AIService()
    llm_plan: dict = {}
    try:
        llm_plan = await ai.plan_retrieval(
            title=title,
            description=desc,
            target=target,
            target_depth=depth,
            source_preferences=prefs,
            has_user_links=has_user_links,
            has_rag=True,
            material_metadata=material_meta,
        )
    except Exception as exc:
        logger.warning("[planner] llm plan failed: %s", exc)

    allowed = heur
    enabled = _intersect(llm_plan.get("enabled_retrievers"), allowed)
    sub_queries = [
        q for q in (llm_plan.get("sub_queries") or []) if isinstance(q, str) and q.strip()
    ][:3]
    if not sub_queries:
        fallback_q = " ".join(p for p in [title, target] if p).strip()
        if fallback_q:
            sub_queries = [fallback_q]

    plan: PlannerDecision = {
        "enabled_retrievers": enabled,
        "sub_queries": sub_queries,
        "chapter_hint_count": llm_plan.get("chapter_hint_count"),
        "notes": llm_plan.get("notes", ""),
    }

    dump_json(state["block_id"], "10_planner.json", {
        "heuristic": sorted(heur),
        "llm_plan": llm_plan,
        "final": plan,
        "material_metadata": material_meta,
    })

    return {"plan": plan}


def enabled_sources(state: BlockGenerationState) -> set[str]:
    plan = state.get("plan") or {}
    return set(plan.get("enabled_retrievers") or [])
