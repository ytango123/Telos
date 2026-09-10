"""Shared state and value objects for the multi-agent course graph."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Annotated, Any, Optional, TypedDict

from app.services.media_service import MediaCatalog


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass
class RetrievalItem:
    """One discrete document recovered by a retriever (web page, paper, repo, ...)."""

    title: str
    url: str
    snippet: str = ""
    raw_text: str = ""
    source_type: str = "web"  # "web" | "user_link" | "rag" | "arxiv" | "github" | "user_video"
    meta: dict = field(default_factory=dict)


@dataclass
class RetrievalResult:
    """Output of one retriever node."""

    source_key: str  # "rag" | "user_links" | "web" | "arxiv" | "github"
    items: list[RetrievalItem] = field(default_factory=list)
    # rendered_text is a markdown blob the legacy pipeline can fall back to.
    rendered_text: Optional[str] = None
    meta: dict = field(default_factory=dict)

    def to_debug_dict(self) -> dict:
        return {
            "source_key": self.source_key,
            "items": [asdict(it) for it in self.items],
            "meta": self.meta,
            "rendered_length": len(self.rendered_text or ""),
        }


@dataclass
class KnowledgeCard:
    """Atomic fact/topic distilled from retrieval results, indexed by id."""

    id: str
    topic: str
    summary: str
    key_facts: list[str] = field(default_factory=list)
    source_urls: list[str] = field(default_factory=list)
    source_types: list[str] = field(default_factory=list)

    def render(self) -> str:
        bullets = "\n".join(f"- {f}" for f in self.key_facts if f)
        sources = ", ".join(self.source_urls[:3])
        out = f"### [{self.id}] {self.topic}\n{self.summary}"
        if bullets:
            out += f"\n{bullets}"
        if sources:
            out += f"\n来源: {sources}"
        return out


# ---------------------------------------------------------------------------
# LangGraph state
# ---------------------------------------------------------------------------


def _merge_retrievals(
    left: dict[str, RetrievalResult] | None,
    right: dict[str, RetrievalResult] | None,
) -> dict[str, RetrievalResult]:
    """Reducer used by parallel retriever nodes so concurrent updates don't drop entries."""
    out: dict[str, RetrievalResult] = {}
    if left:
        out.update(left)
    if right:
        out.update(right)
    return out


def _extend_list(left: list | None, right: list | None) -> list:
    return list(left or []) + list(right or [])


class WrittenChapter(TypedDict, total=False):
    order: int
    title: str
    outline: str
    content: str
    relevant_card_ids: list[str]


class PlannerDecision(TypedDict, total=False):
    enabled_retrievers: list[str]
    sub_queries: list[str]
    chapter_hint_count: Optional[int]
    notes: str


class BlockGenerationState(TypedDict, total=False):
    # Inputs (set up by the entry node)
    block_id: str
    block_title: str
    block_description: str
    block_target: str
    block_target_depth: str
    block_source_preferences: list[str]
    user_links: list[dict]

    # Material ingestion (images captioned, videos transcribed)
    material_metadata: list[dict]
    ingested_media_catalog: Optional[MediaCatalog]
    video_transcripts: list[dict]  # {media_id, title, excerpt, source_url}

    # Planner output
    plan: PlannerDecision

    # Retrieval outputs (merged in parallel; uses reducer)
    retrievals: Annotated[dict[str, RetrievalResult], _merge_retrievals]

    # Curator output
    knowledge_cards: list[KnowledgeCard]
    topic_index: dict[str, list[str]]  # topic -> card ids

    # Fallback assembled context (when curator declines)
    combined_context: Optional[str]

    # Outliner output
    outline: dict  # { title, description, chapters: [{title, outline, relevant_card_ids}] }
    course_id: Optional[str]

    # Chapter generation
    media_catalog: Optional[MediaCatalog]
    chapters: Annotated[list[WrittenChapter], _extend_list]

    # Telemetry
    errors: Annotated[list[str], _extend_list]
    aborted: bool


__all__ = [
    "BlockGenerationState",
    "KnowledgeCard",
    "PlannerDecision",
    "RetrievalItem",
    "RetrievalResult",
    "WrittenChapter",
]
