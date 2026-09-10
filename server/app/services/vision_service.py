"""GLM-4.6V-Flash vision captioning via z.ai OpenAI-compatible API."""

from __future__ import annotations

import asyncio
import base64
import logging
import mimetypes
from pathlib import Path
from typing import Optional

import httpx
from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_PROMPTS = {
  "general": (
    "请描述这张图片的内容，并提取图中可见的关键文字（OCR）。"
    "用中文回答，格式：\n【描述】...\n【文字】..."
  ),
  "technical": (
    "这是一张技术类图片（图表/截图/架构图）。请描述其结构与关键信息，"
    "并提取图中文字。用中文回答，格式：\n【描述】...\n【文字】..."
  ),
}


class VisionService:
  def __init__(self) -> None:
    self._enabled = bool(settings.zai_api_key)
    self._client: Optional[AsyncOpenAI] = None
    if self._enabled:
      self._client = AsyncOpenAI(
        api_key=settings.zai_api_key,
        base_url=settings.zai_base_url,
        timeout=httpx.Timeout(60.0, connect=15.0),
      )
    else:
      logger.warning("[Vision] ZAI_API_KEY not set; image captioning disabled")

  @property
  def enabled(self) -> bool:
    return self._enabled

  def _image_url_for_api(self, url_or_path: str) -> str:
    if url_or_path.startswith(("http://", "https://", "data:")):
      return url_or_path
    path = Path(url_or_path)
    if not path.exists():
      raise FileNotFoundError(url_or_path)
    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "image/jpeg"
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{b64}"

  def _parse_response(self, raw: str) -> tuple[str, str]:
    caption = raw.strip()
    ocr_text = ""
    if "【描述】" in raw and "【文字】" in raw:
      parts = raw.split("【文字】", 1)
      caption = parts[0].replace("【描述】", "").strip()
      ocr_text = parts[1].strip() if len(parts) > 1 else ""
    elif "【描述】" in raw:
      caption = raw.split("【描述】", 1)[-1].strip()
    return caption, ocr_text

  async def caption_image(
    self,
    url_or_path: str,
    *,
    prompt_role: str = "general",
    alt: str = "",
  ) -> dict:
    if not self._enabled or not self._client:
      return {"caption": alt or "", "ocr_text": "", "skipped": True}

    prompt = _PROMPTS.get(prompt_role, _PROMPTS["general"])
    if alt:
      prompt = f"图片原始 alt 文本：{alt}\n\n{prompt}"

    try:
      image_url = self._image_url_for_api(url_or_path)
      response = await self._client.chat.completions.create(
        model=settings.zai_vision_model,
        messages=[
          {
            "role": "user",
            "content": [
              {"type": "image_url", "image_url": {"url": image_url}},
              {"type": "text", "text": prompt},
            ],
          }
        ],
        temperature=0.2,
        max_tokens=512,
      )
      raw = response.choices[0].message.content or ""
      caption, ocr_text = self._parse_response(raw)
      return {"caption": caption, "ocr_text": ocr_text, "skipped": False}
    except Exception as exc:
      logger.warning("[Vision] caption failed for %s: %s", url_or_path[:80], exc)
      return {"caption": alt or "", "ocr_text": "", "error": str(exc)}

  async def caption_many(
    self,
    items: list[dict],
    *,
    limit: Optional[int] = None,
  ) -> list[dict]:
    """Caption a list of {url|path, alt, prompt_role}. Returns same list with caption fields."""
    if not items:
      return []
    cap = limit or settings.vision_max_images_per_block
    items = items[:cap]
    sem = asyncio.Semaphore(settings.vision_concurrency)

    async def _one(item: dict) -> dict:
      src = item.get("url") or item.get("path") or ""
      async with sem:
        result = await self.caption_image(
          src,
          prompt_role=item.get("prompt_role", "general"),
          alt=item.get("alt", ""),
        )
      return {**item, **result}

    return await asyncio.gather(*[_one(it) for it in items])


vision_service = VisionService()
