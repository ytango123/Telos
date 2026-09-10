"""Normalized material value objects for the multi-agent pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional


@dataclass
class TextDoc:
  text: str
  source_type: str  # file | text | link | image_caption | video_transcript | docx
  title: str = ""
  source_url: str = ""
  attachment_id: str = ""
  meta: dict = field(default_factory=dict)


@dataclass
class ImageDoc:
  url: str
  path: str = ""
  alt: str = ""
  caption: str = ""
  ocr_text: str = ""
  source_url: str = ""
  attachment_id: str = ""
  media_id: str = ""  # img-N for MediaCatalog cross-ref
  meta: dict = field(default_factory=dict)


@dataclass
class MediaRef:
  kind: str = "video"
  platform: str = ""
  video_id: str = ""
  source_url: str = ""
  title: str = ""
  attachment_id: str = ""
  media_id: str = ""  # vid-N
  transcript: Optional[TextDoc] = None
  transcript_status: str = "pending"  # pending | subtitles | asr | failed | skipped
  meta: dict = field(default_factory=dict)


@dataclass
class MaterialMetadata:
  """Lightweight summary for Planner (no body text)."""

  kind: str
  title: str
  source_url: str = ""
  attachment_id: str = ""
  status: str = "ready"
  extra: dict = field(default_factory=dict)

  def to_dict(self) -> dict:
    return asdict(self)


@dataclass
class MaterialBundle:
  text_docs: list[TextDoc] = field(default_factory=list)
  images: list[ImageDoc] = field(default_factory=list)
  videos: list[MediaRef] = field(default_factory=list)
  metadata: list[MaterialMetadata] = field(default_factory=list)

  def to_debug_dict(self) -> dict:
    return {
      "text_docs": len(self.text_docs),
      "images": [asdict(i) for i in self.images],
      "videos": [
        {
          **{k: v for k, v in asdict(v).items() if k != "transcript"},
          "transcript_length": len(v.transcript.text) if v.transcript else 0,
        }
        for v in self.videos
      ],
      "metadata": [m.to_dict() for m in self.metadata],
    }
