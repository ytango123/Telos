"""GitHub Search API client.

We use the public REST search endpoints. Anonymous quota is 60 req/h per IP
(enough for local dev); set `GITHUB_TOKEN` to lift it. We do a single search
call per query then fan-out README fetches concurrently (capped).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.agents.state import RetrievalItem, RetrievalResult
from app.config import settings

logger = logging.getLogger(__name__)


_USER_AGENT = "Telos/0.1 (+https://telos.local) httpx"
_README_FETCH_CONCURRENCY = 3
_README_MAX_CHARS = 1500


def _auth_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": _USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _repo_to_item(repo: dict[str, Any], readme: str) -> RetrievalItem:
    full_name = repo.get("full_name") or repo.get("name") or "repo"
    description = (repo.get("description") or "").strip()
    topics = ", ".join((repo.get("topics") or [])[:10])
    stars = repo.get("stargazers_count") or 0
    language = repo.get("language") or ""
    html_url = repo.get("html_url") or ""

    summary_parts = [description] if description else []
    if topics:
        summary_parts.append(f"Topics: {topics}")
    if language:
        summary_parts.append(f"Primary language: {language}")
    summary_parts.append(f"Stars: {stars}")
    snippet = " | ".join(summary_parts)

    raw_parts = [
        f"Repository: {full_name}",
        f"URL: {html_url}",
        snippet,
    ]
    if readme:
        raw_parts.append("README excerpt:\n" + readme[:_README_MAX_CHARS])
    raw_text = "\n\n".join(raw_parts)

    return RetrievalItem(
        title=full_name,
        url=html_url,
        snippet=snippet,
        raw_text=raw_text,
        source_type="github",
        meta={
            "stars": stars,
            "language": language,
            "topics": repo.get("topics") or [],
            "default_branch": repo.get("default_branch"),
        },
    )


async def _fetch_readme(
    client: httpx.AsyncClient,
    full_name: str,
    sem: asyncio.Semaphore,
) -> str:
    """Best-effort raw README fetch. Returns "" on any failure."""
    headers = _auth_headers()
    headers["Accept"] = "application/vnd.github.raw"
    url = f"{settings.github_api_base}/repos/{full_name}/readme"
    async with sem:
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.text or ""
            logger.debug("[github] readme %s -> %s", full_name, resp.status_code)
        except Exception as exc:
            logger.debug("[github] readme %s failed: %s", full_name, exc)
    return ""


async def search_github(
    query: str,
    *,
    max_results: int = 5,
    client: httpx.AsyncClient | None = None,
) -> RetrievalResult:
    """Search GitHub repositories and pull README for the top results."""
    meta = {
        "provider": "github",
        "query": query,
        "results_count": 0,
        "authenticated": bool(settings.github_token),
    }
    if not query.strip():
        return RetrievalResult(source_key="github", items=[], meta=meta)

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0))
    assert client is not None

    params = {
        "q": query,
        "sort": "stars",
        "order": "desc",
        "per_page": max_results,
    }
    repos: list[dict[str, Any]] = []
    try:
        resp = await client.get(
            f"{settings.github_api_base}/search/repositories",
            params=params,
            headers=_auth_headers(),
        )
        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            meta["error"] = "rate_limited"
            logger.warning("[github] rate limited query=%r", query)
        else:
            resp.raise_for_status()
            data = resp.json()
            repos = data.get("items") or []
    except Exception as exc:
        logger.warning("[github] search failed query=%r: %s", query, exc)
        meta["error"] = f"{exc.__class__.__name__}: {exc}"

    repos = repos[:max_results]
    sem = asyncio.Semaphore(_README_FETCH_CONCURRENCY)
    readmes: list[str] = []
    if repos:
        try:
            readmes = await asyncio.gather(
                *[
                    _fetch_readme(client, r.get("full_name", ""), sem)
                    for r in repos
                ]
            )
        except Exception as exc:
            logger.warning("[github] readme batch failed: %s", exc)
            readmes = [""] * len(repos)

    if owns_client:
        await client.aclose()

    items = [_repo_to_item(repo, readme) for repo, readme in zip(repos, readmes)]
    meta["results_count"] = len(items)

    rendered = ""
    if items:
        rendered = "\n\n---\n\n".join(
            f"[GitHub: {it.title}]\nURL: {it.url}\n{it.raw_text}" for it in items
        )

    return RetrievalResult(
        source_key="github",
        items=items,
        rendered_text=rendered or None,
        meta=meta,
    )
