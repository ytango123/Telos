"""Extract plain text from DOCX files."""

from __future__ import annotations

from pathlib import Path


def extract_text_from_docx(file_path: str) -> str:
  from docx import Document

  path = Path(file_path)
  if not path.exists():
    raise FileNotFoundError(f"File not found: {file_path}")

  doc = Document(str(path))
  parts: list[str] = []
  for para in doc.paragraphs:
    t = (para.text or "").strip()
    if t:
      parts.append(t)
  return "\n\n".join(parts)
