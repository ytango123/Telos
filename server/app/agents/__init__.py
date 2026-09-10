"""Multi-agent course generation graph.

The pipeline (LangGraph DAG):

    Planner -> [Retrievers in parallel] -> Curator -> Outliner -> ChapterWriter (fan-out) -> Persist

Each node is an async function that receives `BlockGenerationState` and returns
a partial state dict for LangGraph to merge.

Keep nodes thin: heavy lifting stays inside `app.services.*` so the graph can
remain a coordinator and stay easy to swap (e.g. fallback to legacy linear
pipeline when the graph fails).
"""
