"""Source-specific retrieval clients.

Each module exposes a thin async function that takes a query string and returns
a `RetrievalResult` from `app.agents.state`. Keep them self-contained so they
can be unit-tested without LangGraph.
"""
