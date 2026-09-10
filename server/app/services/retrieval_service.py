import asyncio
import logging
import re
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


# Maps preset source keys (from the UI) to concrete domains for search filtering.
SOURCE_DOMAIN_MAP = {
    # Open-web sources that don't require login. Login-gated platforms
    # (zhihu / xiaohongshu / weixin / bilibili / youtube) are intentionally excluded
    # because Tavily + Jina can only get bot-protected / login-wall pages from them.
    "arxiv": ["arxiv.org"],
    "github": ["github.com"],
    "stackoverflow": ["stackoverflow.com"],
    "mdn": ["developer.mozilla.org"],
    "csdn": ["csdn.net"],
}

_DOMAIN_LIKE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$", re.IGNORECASE)
_LOW_QUALITY_PATTERNS = [
    "安全验证",
    "请您登录后查看更多",
    "需要 CAPTCHA",
    "requiring CAPTCHA",
    "进入知乎",
    "网络环境存在异常",
]


def _error_reason(exc: Exception) -> str:
    """Return stable, informative error text for logs/debug payloads."""
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code if exc.response is not None else "unknown"
        return f"HTTPStatusError(status={status})"
    if isinstance(exc, httpx.ReadTimeout):
        return "ReadTimeout"
    if isinstance(exc, httpx.ConnectTimeout):
        return "ConnectTimeout"
    if isinstance(exc, httpx.ConnectError):
        return "ConnectError"
    text = str(exc).strip()
    if text:
        return f"{exc.__class__.__name__}: {text}"
    return exc.__class__.__name__


class RetrievalService:
    """Web context retrieval.

    Two distinct pipelines:
      - Pipeline A (exploratory): preferred-source search via Tavily, then Jina Reader.
      - Pipeline B (deterministic): user-given URLs fetched directly via Jina Reader.
    """

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))

    async def close(self) -> None:
        await self._client.aclose()

    def _split_source_preferences(self, source_preferences: list[str]) -> tuple[list[str], list[str]]:
        """Return (domains, free_keywords) from mixed preset/custom source preferences."""
        domains: set[str] = set()
        keywords: list[str] = []
        for source in source_preferences:
            s = (source or "").strip()
            if not s:
                continue
            if s in SOURCE_DOMAIN_MAP:
                domains.update(SOURCE_DOMAIN_MAP[s])
            elif _DOMAIN_LIKE.match(s):
                domains.add(s.lower())
            else:
                keywords.append(s)
        return sorted(domains), keywords

    def _build_query(self, title: str, description: str, target: str, extra_keywords: list[str]) -> str:
        parts = [p.strip() for p in [title, description, target] if p and p.strip()]
        parts.extend(extra_keywords)
        return " ".join(parts)[:800]

    def _is_low_quality_page(self, text: str) -> bool:
        if not text:
            return True
        t = text.strip()
        if not t:
            return True
        if len(t) < 120:
            return True
        lowered = t.lower()
        for pat in _LOW_QUALITY_PATTERNS:
            if pat.lower() in lowered:
                return True
        return False

    async def _search_urls(self, query: str, preferred_domains: list[str], max_results: int) -> list[dict]:
        if not settings.tavily_api_key:
            logger.info("[Retrieval] tavily_api_key not set, skip Tavily search")
            return []

        payload = {
            "query": query,
            "search_depth": "basic",
            "max_results": max_results,
            "include_raw_content": False,
        }
        if preferred_domains:
            payload["include_domains"] = preferred_domains

        headers = {"Authorization": f"Bearer {settings.tavily_api_key}"}
        response = await self._client.post(
            settings.tavily_search_url,
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("results", [])

    async def read_url(self, url: str) -> str:
        """Convert a single URL to LLM-friendly markdown via Jina Reader."""
        if not url.startswith("http://") and not url.startswith("https://"):
            return ""
        target_url = f"{settings.jina_reader_url.rstrip('/')}/{url}"
        headers = {}
        if settings.jina_api_key:
            headers["Authorization"] = f"Bearer {settings.jina_api_key}"
        # Retry for transient upstream/network jitter.
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                response = await self._client.get(target_url, headers=headers)
                response.raise_for_status()
                return response.text
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                raise
        if last_exc:
            raise last_exc
        return ""

    async def _search_with_jina(self, query: str) -> list[dict]:
        # Fallback when Tavily key is unavailable.
        encoded = quote(query)
        url = f"{settings.jina_search_url.rstrip('/')}/{encoded}"
        headers = {}
        if settings.jina_api_key:
            headers["Authorization"] = f"Bearer {settings.jina_api_key}"
        response = await self._client.get(url, headers=headers)
        response.raise_for_status()
        text = response.text
        if not text:
            return []
        return [{"url": "", "title": "Jina Search", "content": text[:2000]}]

    async def get_user_links_context(
        self,
        urls: list[dict],
        *,
        max_context_length: int = 12000,
        per_doc_limit: int = 5000,
        video_transcripts: list[dict] | None = None,
    ) -> tuple[str | None, dict]:
        """Pipeline B: deterministically fetch user-specified URLs and convert to markdown.

        `urls` items: {"url": str, "title": str | None, "kind": "link" | "video"}
        Routing rules:
          - kind == "video": no Jina call, just emit a placeholder segment so the
            media extractor can still pick up the URL for in-page embedding.
          - kind == "link" (or missing): normal Jina-based markdown extraction.

        Returns a clearly-labeled block, or None when nothing usable.
        """
        clean: list[dict] = []
        seen: set[str] = set()
        for item in urls:
            u = (item.get("url") or "").strip()
            if u and u not in seen and (u.startswith("http://") or u.startswith("https://")):
                seen.add(u)
                clean.append(
                    {
                        "url": u,
                        "title": (item.get("title") or "").strip(),
                        "kind": (item.get("kind") or "link").lower(),
                    }
                )

        if not clean:
            return None, {
                "input_count": len(urls),
                "valid_count": 0,
                "success_count": 0,
                "failed_count": 0,
                "video_count": 0,
                "failed_urls": [],
            }

        video_items = [it for it in clean if it["kind"] == "video"]
        textual_items = [it for it in clean if it["kind"] != "video"]
        transcript_by_url = {
            (vt.get("source_url") or "").strip(): vt
            for vt in (video_transcripts or [])
            if (vt.get("source_url") or "").strip()
        }

        read_results: list = []
        if textual_items:
            read_results = await asyncio.gather(
                *[self.read_url(it["url"]) for it in textual_items], return_exceptions=True
            )

        parts: list[str] = []
        total = 0
        failed_urls: list[dict] = []
        success_count = 0

        # 1) Video links: emit a compact placeholder so the URL stays in context
        #    for the media extractor, but no body text is wasted on it.
        for it in video_items:
            title = it["title"] or it["url"]
            segment = (
                f"【用户指定视频: {title}】\n"
                f"URL: {it['url']}"
            )
            vt = transcript_by_url.get(it["url"])
            if vt and vt.get("excerpt"):
                segment += f"\n\n{vt['excerpt']}"
            if total + len(segment) > max_context_length:
                break
            parts.append(segment)
            total += len(segment)
            success_count += 1

        # 2) Regular links: Jina Reader → markdown.
        for it, res in zip(textual_items, read_results):
            if not isinstance(res, str):
                reason = _error_reason(res) if isinstance(res, Exception) else str(res)
                logger.warning("[Retrieval] user link fetch failed: %s (%s)", it["url"], reason)
                failed_urls.append({"url": it["url"], "reason": reason})
                continue
            text = res.strip()
            if not text:
                failed_urls.append({"url": it["url"], "reason": "empty_content"})
                continue
            title = it["title"] or it["url"]
            body = text[:per_doc_limit]
            # Caption embedded images so agents can "see" diagram content via text.
            try:
                from app.services.materials.ingest import annotate_markdown_images

                body, _ = await annotate_markdown_images(body, source_url=it["url"])
            except Exception as exc:
                logger.debug("[Retrieval] image caption in link skipped: %s", exc)
            segment = f"【用户指定来源: {title}】\nURL: {it['url']}\n{body}"
            if total + len(segment) > max_context_length:
                break
            parts.append(segment)
            total += len(segment)
            success_count += 1

        meta = {
            "input_count": len(urls),
            "valid_count": len(clean),
            "video_count": len(video_items),
            "success_count": success_count,
            "failed_count": len(failed_urls),
            "failed_urls": failed_urls,
        }
        if not parts:
            return None, meta
        return "\n\n---\n\n".join(parts), meta

    async def get_web_context(
        self,
        *,
        title: str,
        description: str,
        target: str,
        source_preferences: list[str],
        target_depth: str,
        max_context_length: int = 5000,
    ) -> tuple[str | None, dict]:
        """Pipeline A: search preferred sources, then extract top pages."""
        preferred_domains, extra_keywords = self._split_source_preferences(source_preferences)
        query = self._build_query(title, description, target, extra_keywords)
        meta = {
            "source_preferences": source_preferences,
            "preferred_domains": preferred_domains,
            "extra_keywords": extra_keywords,
            "query": query,
            "search_provider": "tavily",
            "search_results_count": 0,
            "url_fetch_count": 0,
            "reader_success_count": 0,
            "reader_failed_count": 0,
            "reader_failed_urls": [],
        }
        if not query:
            return None, meta

        max_results = 6 if target_depth == "deep_dive" else 4
        candidate_limit = max(max_results * 3, 10)

        try:
            search_results = await self._search_urls(
                query,
                preferred_domains,
                max_results=candidate_limit,
            )
        except Exception as exc:
            logger.warning("[Retrieval] Tavily search failed: %s", exc)
            search_results = []

        if not search_results:
            try:
                search_results = await self._search_with_jina(query)
                meta["search_provider"] = "jina_fallback"
            except Exception as exc:
                logger.warning("[Retrieval] Jina search fallback failed: %s", exc)
                meta["search_provider"] = "none"
                meta["error"] = f"search_failed: {str(exc)}"
                return None, meta
        meta["search_results_count"] = len(search_results)

        candidates: list[dict] = []
        seen_urls: set[str] = set()
        for item in search_results:
            u = (item.get("url") or "").strip()
            if not u or u in seen_urls:
                continue
            seen_urls.add(u)
            candidates.append(
                {
                    "url": u,
                    "title": (item.get("title") or "").strip() or "未命名来源",
                    "content": (item.get("content") or ""),
                }
            )
            if len(candidates) >= candidate_limit:
                break

        urls = [c["url"] for c in candidates]
        meta["url_fetch_count"] = len(urls)

        # Prefer full page extraction via Jina Reader.
        read_tasks = [self.read_url(u) for u in urls]
        read_results = await asyncio.gather(*read_tasks, return_exceptions=True)

        context_parts: list[str] = []
        total_length = 0
        reader_failed_urls: list[dict] = []
        reader_success_count = 0

        for idx, item in enumerate(candidates):
            url = item["url"]
            item_title = item["title"]
            raw_text = ""

            if idx < len(read_results) and isinstance(read_results[idx], str):
                raw_text = read_results[idx]
            elif idx < len(read_results) and isinstance(read_results[idx], Exception):
                reader_failed_urls.append({"url": url, "reason": _error_reason(read_results[idx])})
            elif item.get("content"):
                raw_text = str(item["content"])

            raw_text = raw_text.strip()
            if not raw_text:
                continue
            if self._is_low_quality_page(raw_text):
                reader_failed_urls.append({"url": url, "reason": "low_quality_or_blocked_page"})
                continue

            segment = f"[来源: {item_title}]\nURL: {url or 'N/A'}\n{raw_text[:1800]}"
            if total_length + len(segment) > max_context_length:
                break
            context_parts.append(segment)
            total_length += len(segment)
            reader_success_count += 1
            if reader_success_count >= max_results:
                break

        meta["reader_success_count"] = reader_success_count
        meta["reader_failed_count"] = len(reader_failed_urls)
        meta["reader_failed_urls"] = reader_failed_urls
        if not context_parts:
            return None, meta
        return "\n\n---\n\n".join(context_parts), meta
