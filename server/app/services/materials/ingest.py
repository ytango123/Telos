"""Orchestrate multimodal material ingestion at generation start."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Callable, Awaitable, Optional
from urllib.parse import urlparse

from app.agents.runtime import dump_json
from app.config import settings
from app.services.materials.extractors.docx import extract_text_from_docx
from app.services.materials.types import (
  ImageDoc,
  MaterialBundle,
  MaterialMetadata,
  MediaRef,
  TextDoc,
)
from app.services.media_service import MediaCatalog, MediaImage, MediaVideo
from app.services.rag_service import rag_service
from app.services.video_service import video_service
from app.services.vision_service import vision_service

logger = logging.getLogger(__name__)

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_IMG_MD_RE = re.compile(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[^)]*)?\)")


def _detect_video_platform(url: str) -> tuple[str, str]:
  from app.services.media_service import _extract_youtube_id, _extract_bilibili_id

  yt = _extract_youtube_id(url)
  if yt:
    return "youtube", yt
  bv = _extract_bilibili_id(url)
  if bv:
    return "bilibili", bv
  host = urlparse(url).netloc.lower()
  return host or "video", url


def build_media_catalog_from_materials(bundle: MaterialBundle) -> MediaCatalog:
  catalog = MediaCatalog()
  for idx, img in enumerate(bundle.images):
    catalog.images.append(
      MediaImage(
        id=img.media_id or f"img-{idx + 1}",
        url=img.url or img.path,
        alt=img.caption or img.alt,
        source_url=img.source_url,
      )
    )
  for idx, vid in enumerate(bundle.videos):
    catalog.videos.append(
      MediaVideo(
        id=vid.media_id or f"vid-{idx + 1}",
        platform=vid.platform,
        video_id=vid.video_id,
        url=vid.source_url,
        title=vid.title,
        source_url=vid.source_url,
      )
    )
  return catalog


async def annotate_markdown_images(
  markdown: str,
  *,
  source_url: str = "",
  limit: Optional[int] = None,
) -> tuple[str, list[ImageDoc]]:
  """Caption images embedded in markdown and rewrite alt text."""
  if not markdown or not vision_service.enabled:
    return markdown, []

  cap = limit or settings.vision_max_images_per_block
  seen: set[str] = set()
  items: list[dict] = []
  for m in _IMG_MD_RE.finditer(markdown):
    alt, url = m.group(1).strip(), m.group(2).strip()
    if not url or url in seen:
      continue
    seen.add(url)
    items.append({"url": url, "alt": alt, "prompt_role": "general", "source_url": source_url})
    if len(items) >= cap:
      break

  if not items:
    return markdown, []

  captioned = await vision_service.caption_many(items, limit=cap)
  image_docs: list[ImageDoc] = []
  out = markdown
  for item in captioned:
    url = item.get("url", "")
    alt = item.get("alt", "")
    caption = item.get("caption", "") or alt
    ocr = item.get("ocr_text", "")
    new_alt = f"{alt} — {caption}" if alt and caption else (caption or alt)
    out = out.replace(f"![{alt}]({url})", f"![{new_alt}]({url})", 1)
    image_docs.append(
      ImageDoc(
        url=url,
        alt=alt,
        caption=caption,
        ocr_text=ocr,
        source_url=item.get("source_url", source_url),
      )
    )
  return out, image_docs


class MaterialIngestService:
  async def ingest_block(
    self,
    *,
    block_id: str,
    attachments: list,
    on_progress: Optional[Callable[[str], Awaitable[None]]] = None,
  ) -> MaterialBundle:
    bundle = MaterialBundle()
    img_counter = 0
    vid_counter = 0

    async def _progress(msg: str) -> None:
      if on_progress:
        await on_progress(msg)

    for att in attachments:
      kind = getattr(att, "kind", "file") or "file"
      att_id = str(getattr(att, "id", ""))
      name = getattr(att, "original_name", "") or getattr(att, "filename", "")
      path = getattr(att, "file_path", "") or ""
      source_url = getattr(att, "source_url", "") or ""

      if kind == "text":
        bundle.metadata.append(
          MaterialMetadata(kind="text", title=name, attachment_id=att_id, status="indexed")
        )
        continue

      if kind == "file":
        ext = Path(path).suffix.lower() if path else ""
        if ext in _IMAGE_EXTS and path:
          await _progress(f"正在理解图片：{name}")
          img_counter += 1
          media_id = f"img-{img_counter}"
          # Serve local uploads via download API path for vision if needed
          result = await vision_service.caption_image(path, alt=name)
          caption = result.get("caption", "")
          ocr = result.get("ocr_text", "")
          img_doc = ImageDoc(
            path=path,
            url=f"/api/blocks/{block_id}/attachments/{att_id}/download",
            alt=name,
            caption=caption,
            ocr_text=ocr,
            attachment_id=att_id,
            media_id=media_id,
            meta=result,
          )
          bundle.images.append(img_doc)
          text_for_rag = f"【图片: {name}】\n{caption}\n{ocr}".strip()
          if text_for_rag:
            await rag_service.index_raw_text(block_id, att_id, text_for_rag, f"{name} (caption)")
            bundle.text_docs.append(
              TextDoc(
                text=text_for_rag,
                source_type="image_caption",
                title=name,
                attachment_id=att_id,
              )
            )
          bundle.metadata.append(
            MaterialMetadata(
              kind="image",
              title=name,
              attachment_id=att_id,
              status="captioned" if caption else "failed",
              extra={"caption_preview": caption[:120]},
            )
          )
        elif ext == ".docx" and path:
          bundle.metadata.append(
            MaterialMetadata(kind="docx", title=name, attachment_id=att_id, status="indexed")
          )
        else:
          bundle.metadata.append(
            MaterialMetadata(kind="file", title=name, attachment_id=att_id, status="indexed")
          )
        continue

      if kind == "link":
        bundle.metadata.append(
          MaterialMetadata(
            kind="link",
            title=name,
            source_url=source_url,
            attachment_id=att_id,
            status="pending_fetch",
          )
        )
        continue

      if kind == "video" and source_url:
        await _progress(f"正在获取视频字幕：{name}")
        vid_counter += 1
        platform, video_id = _detect_video_platform(source_url)
        transcript = await video_service.fetch_transcript(source_url)
        text_doc: Optional[TextDoc] = None
        if transcript.text.strip():
          rag_label = f"{name} (transcript)"
          await rag_service.index_raw_text(block_id, att_id, transcript.text, rag_label)
          text_doc = TextDoc(
            text=transcript.text,
            source_type="video_transcript",
            title=name,
            source_url=source_url,
            attachment_id=att_id,
            meta={"source": transcript.source, "status": transcript.status},
          )
          bundle.text_docs.append(text_doc)

        media_ref = MediaRef(
          kind="video",
          platform=platform,
          video_id=video_id,
          source_url=source_url,
          title=name,
          attachment_id=att_id,
          media_id=f"vid-{vid_counter}",
          transcript=text_doc,
          transcript_status=transcript.status,
          meta={"error": transcript.error, "source": transcript.source},
        )
        bundle.videos.append(media_ref)
        status_label = {
          "subtitles": "字幕已就绪",
          "asr": "语音转写完成",
          "failed": "转写失败",
          "skipped_too_long": "视频过长已跳过",
        }.get(transcript.status, transcript.status)
        bundle.metadata.append(
          MaterialMetadata(
            kind="video",
            title=name,
            source_url=source_url,
            attachment_id=att_id,
            status=transcript.status,
            extra={"status_label": status_label, "transcript_chars": len(transcript.text)},
          )
        )

    dump_json(block_id, "40_materials.json", bundle.to_debug_dict())
    if bundle.images:
      dump_json(
        block_id,
        "40_image_captions.json",
        [{"media_id": i.media_id, "caption": i.caption, "url": i.url or i.path} for i in bundle.images],
      )
    if bundle.videos:
      dump_json(
        block_id,
        "41_video_transcripts.json",
        [
          {
            "media_id": v.media_id,
            "status": v.transcript_status,
            "chars": len(v.transcript.text) if v.transcript else 0,
            "url": v.source_url,
          }
          for v in bundle.videos
        ],
      )
    return bundle


material_ingest_service = MaterialIngestService()
