from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # DeepSeek API
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    # Per-request HTTP timeout (seconds); chapter calls can be slow
    deepseek_http_timeout: float = 420.0
    
    # Database
    database_url: str = "sqlite+aiosqlite:///../data/telos.db"
    
    # Paths
    data_dir: Path = Path("../data")
    upload_dir: Path = Path("../data/uploads")
    vector_dir: Path = Path("../data/vectors")
    
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
