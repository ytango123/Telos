"""Video transcript extraction: yt-dlp subtitles first, DashScope ASR fallback."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_SRT_TS = re.compile(
  r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})"
)


@dataclass
class VideoTranscript:
  text: str = ""
  source: str = "none"  # subtitles | asr | none
  status: str = "failed"  # subtitles | asr | failed | skipped_too_long | skipped
  segments: list[dict] = field(default_factory=list)
  error: str = ""
  duration_sec: Optional[float] = None
  cache_key: str = ""


def _cache_key(url: str) -> str:
  return hashlib.sha1(url.strip().encode()).hexdigest()


def _cache_dir_for(url: str) -> Path:
  base = settings.video_cache_dir / _cache_key(url)
  base.mkdir(parents=True, exist_ok=True)
  return base


def _parse_srt(content: str) -> tuple[str, list[dict]]:
  blocks = re.split(r"\n\s*\n", content.strip())
  segments: list[dict] = []
  lines_out: list[str] = []
  for block in blocks:
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    if len(lines) < 2:
      continue
    m = _SRT_TS.search(block)
    if not m:
      continue
    text_lines = [ln for ln in lines if not ln.isdigit() and "-->" not in ln]
    text = " ".join(text_lines).strip()
    if not text:
      continue
    segments.append({"start": m.group(1), "end": m.group(2), "text": text})
    lines_out.append(text)
  return "\n".join(lines_out), segments


def _run_ytdlp(args: list[str], url: str) -> subprocess.CompletedProcess:
  cmd = ["yt-dlp", *args, url]
  return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def _fetch_metadata_sync(url: str) -> dict:
  args = ["--dump-json", "--skip-download", "--no-warnings"]
  if settings.bilibili_cookies_file:
    args.extend(["--cookies", settings.bilibili_cookies_file])
  proc = _run_ytdlp(args, url)
  if proc.returncode != 0:
    return {}
  try:
    return json.loads(proc.stdout.strip().splitlines()[-1])
  except Exception:
    return {}


def _fetch_subtitles_sync(url: str, out_dir: Path) -> Optional[Path]:
  tmpl = str(out_dir / "subs")
  args = [
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", "zh.*,en.*,ai-zh,ai-en,en-orig",
    "--sub-format", "srt",
    "--no-warnings",
    "-o", tmpl,
  ]
  if settings.bilibili_cookies_file:
    args.extend(["--cookies", settings.bilibili_cookies_file])
  proc = _run_ytdlp(args, url)
  if proc.returncode != 0:
    logger.debug("[Video] subtitle fetch stderr: %s", proc.stderr[:500])
  srts = sorted(out_dir.glob("*.srt"), key=lambda p: p.stat().st_mtime, reverse=True)
  return srts[0] if srts else None


def _fetch_audio_sync(url: str, out_path: Path) -> bool:
  args = [
    "-f", "bestaudio/best",
    "--extract-audio",
    "--audio-format", "wav",
    "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
    "--no-warnings",
    "-o", str(out_path.with_suffix("")),
  ]
  if settings.bilibili_cookies_file:
    args.extend(["--cookies", settings.bilibili_cookies_file])
  proc = _run_ytdlp(args, url)
  wav = out_path if out_path.suffix == ".wav" else out_path.with_suffix(".wav")
  return proc.returncode == 0 and wav.exists()


def _asr_sync(audio_path: Path) -> str:
  if not settings.dashscope_api_key:
    raise RuntimeError("DASHSCOPE_API_KEY not set")

  import dashscope
  from dashscope import MultiModalConversation

  dashscope.api_key = settings.dashscope_api_key
  dashscope.base_http_api_url = settings.dashscope_base_url

  file_uri = audio_path.resolve().as_uri()
  response = MultiModalConversation.call(
    model=settings.dashscope_asr_model,
    messages=[
      {
        "role": "user",
        "content": [
          {"audio": file_uri},
          {"text": "请将这段音频转写为文字，保留原语言。"},
        ],
      }
    ],
  )
  if getattr(response, "status_code", None) and response.status_code != 200:
    raise RuntimeError(f"ASR failed: {getattr(response, 'message', response)}")
  output = response.output
  if not output:
    return ""
  choices = output.get("choices") or []
  if not choices:
    return ""
  message = choices[0].get("message") or {}
  content = message.get("content") or []
  texts: list[str] = []
  for part in content:
    if isinstance(part, dict) and part.get("text"):
      texts.append(str(part["text"]))
    elif isinstance(part, str):
      texts.append(part)
  return "\n".join(texts).strip()


class VideoService:
  async def fetch_transcript(self, url: str) -> VideoTranscript:
    cache_key = _cache_key(url)
    cache_dir = _cache_dir_for(url)
    cached_text = cache_dir / "transcript.txt"
    cached_meta = cache_dir / "meta.json"

    if cached_text.exists() and cached_meta.exists():
      try:
        meta = json.loads(cached_meta.read_text(encoding="utf-8"))
        text = cached_text.read_text(encoding="utf-8")
        return VideoTranscript(
          text=text,
          source=meta.get("source", "cache"),
          status=meta.get("status", "subtitles"),
          segments=meta.get("segments", []),
          cache_key=cache_key,
        )
      except Exception:
        pass

    meta = await asyncio.to_thread(_fetch_metadata_sync, url)
    duration = meta.get("duration")
    if duration and float(duration) > settings.video_max_duration_sec:
      return VideoTranscript(
        status="skipped_too_long",
        error=f"duration {duration}s exceeds limit",
        duration_sec=float(duration),
        cache_key=cache_key,
      )

    try:
      srt_path = await asyncio.to_thread(_fetch_subtitles_sync, url, cache_dir)
      if srt_path and srt_path.exists():
        content = srt_path.read_text(encoding="utf-8", errors="replace")
        text, segments = _parse_srt(content)
        if text.strip():
          result = VideoTranscript(
            text=text,
            source="subtitles",
            status="subtitles",
            segments=segments,
            duration_sec=float(duration) if duration else None,
            cache_key=cache_key,
          )
          cached_text.write_text(text, encoding="utf-8")
          cached_meta.write_text(
            json.dumps(
              {"source": "subtitles", "status": "subtitles", "segments": segments[:50]},
              ensure_ascii=False,
            ),
            encoding="utf-8",
          )
          return result

      if not settings.dashscope_api_key:
        return VideoTranscript(
          status="failed",
          error="no subtitles and DASHSCOPE_API_KEY not set",
          cache_key=cache_key,
        )

      with tempfile.TemporaryDirectory(dir=cache_dir) as tmp:
        audio_path = Path(tmp) / "audio.wav"
        ok = await asyncio.to_thread(_fetch_audio_sync, url, audio_path)
        if not ok:
          return VideoTranscript(status="failed", error="audio download failed", cache_key=cache_key)

        text = await asyncio.wait_for(
          asyncio.to_thread(_asr_sync, audio_path),
          timeout=settings.asr_timeout_sec,
        )
        if not text.strip():
          return VideoTranscript(status="failed", error="empty ASR result", cache_key=cache_key)

        result = VideoTranscript(
          text=text,
          source="asr",
          status="asr",
          duration_sec=float(duration) if duration else None,
          cache_key=cache_key,
        )
        cached_text.write_text(text, encoding="utf-8")
        cached_meta.write_text(
          json.dumps({"source": "asr", "status": "asr"}, ensure_ascii=False),
          encoding="utf-8",
        )
        return result

    except asyncio.TimeoutError:
      return VideoTranscript(status="failed", error="ASR timeout", cache_key=cache_key)
    except Exception as exc:
      logger.warning("[Video] transcript failed for %s: %s", url, exc)
      return VideoTranscript(status="failed", error=str(exc), cache_key=cache_key)


video_service = VideoService()
