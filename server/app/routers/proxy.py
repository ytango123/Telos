"""Lightweight image proxy for hotlink-protected domains.

Some image hosts (Zhihu / Xiaohongshu / WeChat / weibo / etc.) reject requests
without a matching `Referer`, returning 403 or a placeholder image. We bypass
that by fetching server-side with appropriate headers and streaming the bytes
back to the browser.

Security:
- Only http(s) URLs are allowed
- Localhost and private network ranges are rejected
- Only image content-types are streamed back
- A 6MB hard cap to avoid abuse
"""

from __future__ import annotations

import ipaddress
import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_BYTES = 6 * 1024 * 1024  # 6 MB
TIMEOUT = httpx.Timeout(15.0, connect=8.0)

# Per-host referer overrides for hotlink protection
REFERER_OVERRIDES = {
    "zhimg.com": "https://www.zhihu.com/",
    "xhscdn.com": "https://www.xiaohongshu.com/",
    "xiaohongshu.com": "https://www.xiaohongshu.com/",
    "mmbiz.qpic.cn": "https://mp.weixin.qq.com/",
    "sinaimg.cn": "https://weibo.com/",
    "hdslb.com": "https://www.bilibili.com/",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)


def _is_disallowed_host(host: str) -> bool:
    h = host.lower()
    if h in ("localhost", "0.0.0.0"):
        return True
    try:
        ip = ipaddress.ip_address(h)
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except ValueError:
        return False


def _pick_referer(host: str) -> str | None:
    h = host.lower()
    for suffix, referer in REFERER_OVERRIDES.items():
        if h == suffix or h.endswith("." + suffix):
            return referer
    return None


@router.get("/image")
async def proxy_image(url: str = Query(..., min_length=8, max_length=2000)) -> Response:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="only http(s) urls allowed")
    if not parsed.hostname or _is_disallowed_host(parsed.hostname):
        raise HTTPException(status_code=400, detail="host not allowed")

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "image/*,*/*;q=0.8",
    }
    referer = _pick_referer(parsed.hostname)
    if referer:
        headers["Referer"] = referer

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("[ProxyImage] fetch failed %s: %r", url, exc)
        raise HTTPException(status_code=502, detail="upstream fetch failed") from exc

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail="upstream returned error")

    content_type = resp.headers.get("content-type", "").lower()
    if not (content_type.startswith("image/") or content_type.startswith("application/octet-stream")):
        raise HTTPException(status_code=415, detail="not an image")

    body = resp.content
    if len(body) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="image too large")

    cache_headers = {
        "Cache-Control": "public, max-age=86400, immutable",
    }
    return Response(content=body, media_type=content_type or "image/jpeg", headers=cache_headers)
