"""arXiv Atom API client.

Docs: https://info.arxiv.org/help/api/user-manual.html

We deliberately stay on the public Atom endpoint (no auth required). arXiv asks
clients to space requests at least 3s apart, so callers should treat this as a
serial source - don't fan-out multiple queries in parallel.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import feedparser
import httpx

from app.agents.state import RetrievalItem, RetrievalResult
from app.config import settings

logger = logging.getLogger(__name__)


_USER_AGENT = "Telos/0.1 (+https://telos.local) httpx"


def _format_authors(authors: list[Any]) -> str:
    if not authors:
        return ""
    names = []
    for a in authors[:5]:
        name = getattr(a, "name", None) or (a.get("name") if isinstance(a, dict) else None)
        if name:
            names.append(name)
    return ", ".join(names)


def _entry_to_item(entry: Any) -> RetrievalItem:
    title = (entry.get("title") or "").strip().replace("\n", " ")
    summary = (entry.get("summary") or "").strip()
    abs_url = entry.get("link") or ""
    pdf_url = abs_url
    for link in entry.get("links", []) or []:
        href = link.get("href") if isinstance(link, dict) else None
        rel_type = link.get("type") if isinstance(link, dict) else None
        if href and rel_type == "application/pdf":
            pdf_url = href
            break
    authors = _format_authors(entry.get("authors") or [])
    published = entry.get("published", "")[:10]
    snippet = summary[:500]
    raw_text = (
        f"Title: {title}\n"
        f"Authors: {authors}\n"
        f"Published: {published}\n"
        f"Abstract:\n{summary}"
    )
    return RetrievalItem(
        title=title or "arXiv paper",
        url=abs_url,
        snippet=snippet,
        raw_text=raw_text,
        source_type="arxiv",
        meta={
            "authors": authors,
            "published": published,
            "pdf_url": pdf_url,
        },
    )


async def search_arxiv(
    query: str,
    *,
    max_results: int = 5,
    client: httpx.AsyncClient | None = None,
) -> RetrievalResult:
    """Search arXiv and return up to `max_results` papers as a RetrievalResult."""
    meta = {
        "provider": "arxiv",
        "query": query,
        "results_count": 0,
    }
    if not query.strip():
        return RetrievalResult(source_key="arxiv", items=[], meta=meta)

    params = {
        "search_query": f"all:{query}",
        "start": 0,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    headers = {"User-Agent": _USER_AGENT}

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0))
    assert client is not None

    text = ""
    try:
        response = await client.get(settings.arxiv_base_url, params=params, headers=headers)
        response.raise_for_status()
        text = response.text
    except Exception as exc:
        logger.warning("[arxiv] query=%r failed: %s", query, exc)
        meta["error"] = f"{exc.__class__.__name__}: {exc}"
        if owns_client:
            await client.aclose()
        return RetrievalResult(source_key="arxiv", items=[], meta=meta)
    finally:
        if owns_client:
            await client.aclose()

    parsed = await asyncio.to_thread(feedparser.parse, text)
    entries = parsed.entries or []
    items = [_entry_to_item(e) for e in entries[:max_results]]
    meta["results_count"] = len(items)

    rendered = ""
    if items:
        rendered = "\n\n---\n\n".join(
            f"[arXiv: {it.title}]\nURL: {it.url}\n{it.raw_text}" for it in items
        )

    return RetrievalResult(
        source_key="arxiv",
        items=items,
        rendered_text=rendered or None,
        meta=meta,
    )
