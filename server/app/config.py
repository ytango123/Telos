from pydantic_settings import BaseSettings
from pathlib import Path
import os


class Settings(BaseSettings):
    # DeepSeek API
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    # Per-request HTTP timeout (seconds); chapter calls can be slow
    deepseek_http_timeout: float = 420.0

    # Web retrieval
    tavily_api_key: str = ""
    tavily_search_url: str = "https://api.tavily.com/search"
    jina_api_key: str = ""
    jina_reader_url: str = "https://r.jina.ai"
    jina_search_url: str = "https://s.jina.ai"
    # One-switch observability mode:
    # - emit detailed retrieval logs
    # - persist generation_debug metadata
    # - dump retrieved markdown to local files
    retrieval_debug_mode: bool = False

    # arXiv & GitHub source retrieval
    arxiv_base_url: str = "http://export.arxiv.org/api/query"
    github_api_base: str = "https://api.github.com"
    github_token: str = ""

    # Vision (GLM-4.6V-Flash via z.ai)
    zai_api_key: str = ""
    zai_base_url: str = "https://api.z.ai/api/paas/v4"
    zai_vision_model: str = "glm-4.6v-flash"
    vision_concurrency: int = 4
    vision_max_images_per_block: int = 8

    # Speech (DashScope qwen3-asr-flash)
    dashscope_api_key: str = ""
    dashscope_asr_model: str = "qwen3-asr-flash"
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/api/v1"
    video_max_duration_sec: int = 3600
    video_cache_dir: Path = Path("../data/video-cache")
    bilibili_cookies_file: str = ""
    asr_timeout_sec: float = 90.0
    
    # RAG embedding model (sentence-transformers / Hugging Face Hub)
    hf_token: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///../data/telos.db"
    
    # Paths
    data_dir: Path = Path("../data")
    upload_dir: Path = Path("../data/uploads")
    vector_dir: Path = Path("../data/vectors")
    retrieval_debug_dir: Path = Path("../data/retrieval-debug")
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    
    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
if settings.hf_token:
    os.environ.setdefault("HF_TOKEN", settings.hf_token)
