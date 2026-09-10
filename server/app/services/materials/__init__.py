"""Normalized user material types and ingestion pipeline."""

from app.services.materials.types import (
    ImageDoc,
    MaterialBundle,
    MaterialMetadata,
    MediaRef,
    TextDoc,
)
from app.services.materials.ingest import MaterialIngestService

__all__ = [
    "ImageDoc",
    "MaterialBundle",
    "MaterialIngestService",
    "MaterialMetadata",
    "MediaRef",
    "TextDoc",
]
