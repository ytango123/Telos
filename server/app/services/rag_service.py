import os
from pathlib import Path
from typing import List, Optional
import lancedb
from sentence_transformers import SentenceTransformer
import fitz  # PyMuPDF

from app.config import settings


class RAGService:
    def __init__(self):
        self.db_path = settings.vector_dir
        self.db_path.mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(str(self.db_path))
        self.model = None
        self._embedding_dim = 384
    
    def _get_model(self):
        if self.model is None:
            self.model = SentenceTransformer("all-MiniLM-L6-v2")
        return self.model
    
    def _chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
        """Split text into overlapping chunks"""
        if not text:
            return []
        
        chunks = []
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end]
            
            if end < text_len:
                last_period = chunk.rfind("。")
                last_newline = chunk.rfind("\n")
                split_point = max(last_period, last_newline)
                if split_point > chunk_size // 2:
                    chunk = text[start:start + split_point + 1]
                    end = start + split_point + 1
            
            chunk = chunk.strip()
            if chunk:
                chunks.append(chunk)
            
            start = end - overlap
        
        return chunks
    
    def extract_text_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF file"""
        try:
            doc = fitz.open(file_path)
            text_parts = []
            for page in doc:
                text_parts.append(page.get_text())
            doc.close()
            return "\n\n".join(text_parts)
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF: {e}")
    
    def extract_text_from_file(self, file_path: str, file_type: str) -> str:
        """Extract text from various file types"""
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        ext = path.suffix.lower()
        
        if ext == ".pdf":
            return self.extract_text_from_pdf(file_path)
        elif ext in [".txt", ".md"]:
            return path.read_text(encoding="utf-8")
        else:
            raise ValueError(f"Unsupported file type: {ext}")
    
    async def index_document(
        self,
        block_id: str,
        attachment_id: str,
        file_path: str,
        file_type: str,
        filename: str,
    ) -> int:
        """Index a document for RAG retrieval"""
        text = self.extract_text_from_file(file_path, file_type)
        chunks = self._chunk_text(text)
        
        if not chunks:
            return 0
        
        model = self._get_model()
        embeddings = model.encode(chunks, show_progress_bar=False)
        
        table_name = f"block_{block_id}"
        
        data = [
            {
                "id": f"{attachment_id}_{i}",
                "block_id": block_id,
                "attachment_id": attachment_id,
                "filename": filename,
                "chunk_index": i,
                "text": chunk,
                "vector": embedding.tolist(),
            }
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
        ]
        
        if table_name in self.db.table_names():
            table = self.db.open_table(table_name)
            table.add(data)
        else:
            self.db.create_table(table_name, data)
        
        return len(chunks)
    
    async def search(
        self,
        block_id: str,
        query: str,
        top_k: int = 5,
    ) -> List[dict]:
        """Search for relevant chunks"""
        table_name = f"block_{block_id}"
        
        if table_name not in self.db.table_names():
            return []
        
        model = self._get_model()
        query_embedding = model.encode([query], show_progress_bar=False)[0]
        
        table = self.db.open_table(table_name)
        results = (
            table.search(query_embedding.tolist())
            .limit(top_k)
            .to_list()
        )
        
        return [
            {
                "text": r["text"],
                "filename": r["filename"],
                "score": r.get("_distance", 0),
            }
            for r in results
        ]
    
    async def get_context_for_generation(
        self,
        block_id: str,
        query: str,
        max_context_length: int = 3000,
    ) -> Optional[str]:
        """Get relevant context for content generation"""
        results = await self.search(block_id, query, top_k=10)
        
        if not results:
            return None
        
        context_parts = []
        total_length = 0
        
        for r in results:
            text = r["text"]
            if total_length + len(text) > max_context_length:
                break
            context_parts.append(f"[来源: {r['filename']}]\n{text}")
            total_length += len(text)
        
        if not context_parts:
            return None
        
        return "\n\n---\n\n".join(context_parts)
    
    async def delete_document_index(self, block_id: str, attachment_id: str):
        """Delete indexed chunks for a specific attachment"""
        table_name = f"block_{block_id}"
        
        if table_name not in self.db.table_names():
            return
        
        table = self.db.open_table(table_name)
        table.delete(f"attachment_id = '{attachment_id}'")
    
    async def delete_block_index(self, block_id: str):
        """Delete all indexed data for a block"""
        table_name = f"block_{block_id}"
        
        if table_name in self.db.table_names():
            self.db.drop_table(table_name)


rag_service = RAGService()
