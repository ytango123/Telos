"""Shared runtime helpers for graph nodes.

Wraps the legacy `generation_service` helpers so nodes don't have to import the
heavy generation module directly. Also exposes a small `dump_debug` helper.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict
from pathlib import Path
from typing import Any
from uuid import UUID

from app.config import settings
from app.services.media_service import catalog_to_debug_dict

logger = logging.getLogger(__name__)


def debug_enabled() -> bool:
    return bool(settings.retrieval_debug_mode)


def debug_dir_for(block_id: str) -> Path:
    base = settings.retrieval_debug_dir / str(block_id)
    base.mkdir(parents=True, exist_ok=True)
    return base


def dump_text(block_id: str, filename: str, content: str | None) -> str | None:
    if not debug_enabled() or not content:
        return None
    out = debug_dir_for(block_id) / filename
    out.write_text(content, encoding="utf-8")
    logger.info("[AgentDebug] block=%s dumped %s", block_id, out)
    return str(out)


def dump_json(block_id: str, filename: str, payload: Any) -> str | None:
    if not debug_enabled() or payload is None:
        return None
    out = debug_dir_for(block_id) / filename

    def _default(obj):
        try:
            return asdict(obj)
        except Exception:
            return str(obj)

    out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=_default),
        encoding="utf-8",
    )
    logger.info("[AgentDebug] block=%s dumped %s", block_id, out)
    return str(out)


def media_catalog_debug(catalog) -> dict | None:
    if catalog is None:
        return None
    return catalog_to_debug_dict(catalog)


def as_uuid(block_id: str) -> UUID:
    return UUID(str(block_id))
