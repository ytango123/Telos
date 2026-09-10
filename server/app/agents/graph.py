"""LangGraph DAG assembly for course generation.

Topology:

    planner -> [enabled retrievers in parallel] -> curator -> outliner -> writer -> END

`enabled retrievers` is selected by the planner via `enabled_sources(state)` and
routed via a conditional edge that returns the list of node names to dispatch
in parallel.
"""

from __future__ import annotations

import logging
from typing import Awaitable, Callable

from langgraph.graph import END, START, StateGraph

from app.agents.nodes import (
    chapter_writer,
    curator,
    outliner,
    planner,
)
from app.agents.nodes.retrievers import (
    arxiv as arxiv_node,
    github as github_node,
    rag as rag_node,
    user_links as user_links_node,
    web as web_node,
)
from app.agents.state import BlockGenerationState

logger = logging.getLogger(__name__)


_RETRIEVER_NODES = {
    "rag": ("retriever_rag", rag_node.run),
    "user_links": ("retriever_user_links", user_links_node.run),
    "web": ("retriever_web", web_node.run),
    "arxiv": ("retriever_arxiv", arxiv_node.run),
    "github": ("retriever_github", github_node.run),
}


def _route_to_retrievers(state: BlockGenerationState) -> list[str]:
    enabled = planner.enabled_sources(state)
    nodes = [
        node_name for key, (node_name, _fn) in _RETRIEVER_NODES.items() if key in enabled
    ]
    if not nodes:
        # Safety net: always pull web so curator has something to work with.
        nodes = [_RETRIEVER_NODES["web"][0]]
    return nodes


def build_course_graph(
    *,
    on_chapter_done: Callable[[int, int, dict], Awaitable[None]] | None = None,
):
    """Build and compile the multi-agent course graph.

    `on_chapter_done(order, total, written_chapter)` is invoked as each chapter
    finishes, so the orchestrator can stream progress updates to the user.
    """
    graph: StateGraph = StateGraph(BlockGenerationState)

    graph.add_node("planner", planner.run)
    for key, (node_name, fn) in _RETRIEVER_NODES.items():
        graph.add_node(node_name, fn)
    graph.add_node("curator", curator.run)
    graph.add_node("outliner", outliner.run)
    graph.add_node("writer", chapter_writer.make_chapter_writer_node(on_chapter_done))

    graph.add_edge(START, "planner")
    graph.add_conditional_edges(
        "planner",
        _route_to_retrievers,
        {node_name: node_name for _, (node_name, _) in _RETRIEVER_NODES.items()},
    )
    for _, (node_name, _) in _RETRIEVER_NODES.items():
        graph.add_edge(node_name, "curator")
    graph.add_edge("curator", "outliner")
    graph.add_edge("outliner", "writer")
    graph.add_edge("writer", END)

    return graph.compile()
