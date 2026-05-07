from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "telos-api",
        "version": "0.1.0"
    }


@router.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Telos API",
        "docs": "/docs"
    }
