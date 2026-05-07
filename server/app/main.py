from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.routers import blocks, courses, health, uploads


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure directories exist
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.vector_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    
    # Initialize database
    from app.db.database import init_db
    await init_db()
    
    yield
    
    # Shutdown: cleanup if needed
    pass


app = FastAPI(
    title="Telos API",
    description="AI-driven personalized learning platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(blocks.router, prefix="/api/blocks", tags=["Blocks"])
app.include_router(courses.router, prefix="/api/courses", tags=["Courses"])
app.include_router(uploads.router, prefix="/api/blocks", tags=["Uploads"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
