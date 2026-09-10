"""Extract image / video resources from retrieved markdown.

Goal: turn raw retrieval output into a small, structured "media catalog" that
we can pass into the LLM prompt. The LLM then references items by symbolic id
(e.g. `![[img-3]]`, `::video[vid-1]`), and the generation pipeline does the
final substitution to real URLs / video embeds.

This avoids LLM URL hallucination and keeps media in line with verified sources.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse, parse_qs


# Markdown image: ![alt](url)  -- captures alt and url, ignores titles
_IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)")

# Video platform patterns
_YOUTUBE_RES = [
    re.compile(r"https?://(?:www\.|m\.)?youtube\.com/watch\?[^\s\)]*v=([A-Za-z0-9_-]{6,})"),
    re.compile(r"https?://youtu\.be/([A-Za-z0-9_-]{6,})"),
    re.compile(r"https?://(?:www\.)?youtube\.com/embed/([A-Za-z0-9_-]{6,})"),
]
_BILIBILI_RE = re.compile(
    r"https?://(?:www\.)?bilibili\.com/video/(BV[A-Za-z0-9]+)"
)


# Junk image patterns we don't want in the catalog
_JUNK_IMAGE_HINTS = (
    "captcha",
    "tracking",
    "pixel.gif",
    "1x1",
    "spacer",
    "blank.png",
)
_JUNK_IMAGE_EXT = (".svg",)  # icons / decorative


@dataclass
class MediaImage:
    id: str
    url: str
    alt: str = ""
    source_url: str = ""


@dataclass
class MediaVideo:
    id: str
    platform: str          # "youtube" | "bilibili"
    video_id: str          # YouTube id or Bilibili BVid
    url: str
    title: str = ""
    source_url: str = ""


@dataclass
class MediaCatalog:
    images: list[MediaImage] = field(default_factory=list)
    videos: list[MediaVideo] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.images and not self.videos


def _looks_like_junk_image(url: str) -> bool:
    if not url:
        return True
    u = url.lower()
    if u.startswith("data:"):
        return True
    if any(ext in u for ext in _JUNK_IMAGE_EXT):
        return True
    if any(token in u for token in _JUNK_IMAGE_HINTS):
        return True
    # Treat tiny .gif spacers
    if u.endswith(".gif") and ("blank" in u or "spacer" in u or "pixel" in u):
        return True
    return False


def _extract_youtube_id(url: str) -> Optional[str]:
    for pat in _YOUTUBE_RES:
        m = pat.search(url)
        if m:
            return m.group(1)
    # Fallback via parsed query
    try:
        p = urlparse(url)
        if p.netloc.endswith("youtube.com"):
            qs = parse_qs(p.query)
            if "v" in qs and qs["v"]:
                return qs["v"][0]
        if p.netloc == "youtu.be":
            return p.path.strip("/").split("/")[0] or None
    except Exception:
        pass
    return None


def _extract_bilibili_id(url: str) -> Optional[str]:
    m = _BILIBILI_RE.search(url)
    return m.group(1) if m else None


def extract_media_from_text(
    text: str,
    *,
    source_url: str = "",
    image_limit: int = 8,
    video_limit: int = 3,
) -> MediaCatalog:
    """Pull images and videos from one chunk of markdown / plain text."""
    catalog = MediaCatalog()
    if not text:
        return catalog

    seen_images: set[str] = set()
    seen_videos: set[str] = set()

    # Images
    for m in _IMG_RE.finditer(text):
        url = (m.group(2) or "").strip()
        alt = (m.group(1) or "").strip()
        if not url or url in seen_images:
            continue
        if _looks_like_junk_image(url):
            continue
        seen_images.add(url)
        catalog.images.append(
            MediaImage(
                id=f"img-{len(catalog.images) + 1}",
                url=url,
                alt=alt,
                source_url=source_url,
            )
        )
        if len(catalog.images) >= image_limit:
            break

    # Videos: scan every URL-looking token
    for url in re.findall(r"https?://[^\s\)\]\<\>]+", text):
        yt = _extract_youtube_id(url)
        if yt and yt not in seen_videos:
            seen_videos.add(yt)
            catalog.videos.append(
                MediaVideo(
                    id=f"vid-{len(catalog.videos) + 1}",
                    platform="youtube",
                    video_id=yt,
                    url=f"https://www.youtube.com/watch?v={yt}",
                    source_url=source_url,
                )
            )
            if len(catalog.videos) >= video_limit:
                break
            continue
        bv = _extract_bilibili_id(url)
        if bv and bv not in seen_videos:
            seen_videos.add(bv)
            catalog.videos.append(
                MediaVideo(
                    id=f"vid-{len(catalog.videos) + 1}",
                    platform="bilibili",
                    video_id=bv,
                    url=f"https://www.bilibili.com/video/{bv}",
                    source_url=source_url,
                )
            )
            if len(catalog.videos) >= video_limit:
                break

    return catalog


def merge_catalogs(
    catalogs: list[MediaCatalog],
    *,
    image_limit: int = 8,
    video_limit: int = 3,
) -> MediaCatalog:
    """Merge multiple per-source catalogs, dedupe, and renumber ids."""
    merged = MediaCatalog()
    seen_imgs: set[str] = set()
    seen_vids: set[str] = set()

    for cat in catalogs:
        for img in cat.images:
            if img.url in seen_imgs:
                continue
            seen_imgs.add(img.url)
            merged.images.append(
                MediaImage(
                    id=f"img-{len(merged.images) + 1}",
                    url=img.url,
                    alt=img.alt,
                    source_url=img.source_url,
                )
            )
            if len(merged.images) >= image_limit:
                break

        for vid in cat.videos:
            key = f"{vid.platform}:{vid.video_id}"
            if key in seen_vids:
                continue
            seen_vids.add(key)
            merged.videos.append(
                MediaVideo(
                    id=f"vid-{len(merged.videos) + 1}",
                    platform=vid.platform,
                    video_id=vid.video_id,
                    url=vid.url,
                    title=vid.title,
                    source_url=vid.source_url,
                )
            )
            if len(merged.videos) >= video_limit:
                break

    return merged


def render_catalog_for_prompt(catalog: MediaCatalog) -> str:
    """Compact text section to inject into the LLM prompt."""
    if catalog.is_empty():
        return ""

    lines: list[str] = []
    if catalog.images:
        lines.append("可用图片（按 id 引用，禁止编造 URL）：")
        for img in catalog.images:
            label = img.alt or "（未命名）"
            lines.append(f"  - {img.id}: {label}")
    if catalog.videos:
        lines.append("")
        lines.append("可用视频（按 id 引用）：")
        for v in catalog.videos:
            label = v.title or f"{v.platform} 视频"
            lines.append(f"  - {v.id}: {v.platform}:{v.video_id} - {label}")
    return "\n".join(lines)


# --- Post-processing ---------------------------------------------------------

_PLACEHOLDER_IMG = re.compile(r"!\[\[(img-\d+)\]\]")
_PLACEHOLDER_VIDEO = re.compile(r"::video\[(vid-\d+)\]")


def apply_media_placeholders(content: str, catalog: MediaCatalog) -> str:
    """Replace placeholder syntax in LLM output with real markdown / HTML.

    - `![[img-1]]` → `![alt](url)` (standard markdown)
    - `::video[vid-1]` → `<div data-telos-video="platform:id"></div>`
                         (frontend turns this into an iframe player)

    Unknown ids are stripped to avoid leaking placeholders in the final output.
    """
    if not content:
        return content

    images = {img.id: img for img in catalog.images}
    videos = {v.id: v for v in catalog.videos}

    def _img_sub(match: re.Match) -> str:
        ref = match.group(1)
        img = images.get(ref)
        if not img:
            return ""
        alt = img.alt.replace("]", "").replace("[", "") if img.alt else ""
        return f"![{alt}]({img.url})"

    def _video_sub(match: re.Match) -> str:
        ref = match.group(1)
        v = videos.get(ref)
        if not v:
            return ""
        return (
            f'<div data-telos-video="{v.platform}:{v.video_id}" '
            f'data-telos-video-url="{v.url}"></div>'
        )

    content = _PLACEHOLDER_IMG.sub(_img_sub, content)
    content = _PLACEHOLDER_VIDEO.sub(_video_sub, content)
    return content


def catalog_to_debug_dict(catalog: MediaCatalog) -> dict:
    return {
        "images": [
            {"id": i.id, "url": i.url, "alt": i.alt, "source_url": i.source_url}
            for i in catalog.images
        ],
        "videos": [
            {
                "id": v.id,
                "platform": v.platform,
                "video_id": v.video_id,
                "url": v.url,
                "title": v.title,
                "source_url": v.source_url,
            }
            for v in catalog.videos
        ],
    }
