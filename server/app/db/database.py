from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import event, text
from pathlib import Path

from app.config import settings

# Ensure data directory exists
data_dir = Path(__file__).parent.parent.parent.parent / "data"
data_dir.mkdir(parents=True, exist_ok=True)

# Database URL with timeout
DATABASE_URL = f"sqlite+aiosqlite:///{data_dir}/telos.db?timeout=30"

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.debug,
    future=True,
    pool_pre_ping=True,
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
    },
)


@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable WAL mode for better concurrent access"""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def init_db():
    """Initialize database tables"""
    from app.models.db_models import Block, Course, Chapter, Attachment
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Backward compatibility: normalize removed depth value.
        await conn.execute(
            text("UPDATE blocks SET target_depth = 'standard' WHERE target_depth = 'quick_overview'")
        )
        await _ensure_block_columns(conn)
        # Backward compatibility: add new attachment columns if upgrading an old DB.
        await _ensure_attachment_columns(conn)


async def _ensure_block_columns(conn):
    """Add block columns introduced after initial table creation."""
    result = await conn.execute(text("PRAGMA table_info(blocks)"))
    existing = {row[1] for row in result.fetchall()}
    if "generation_debug" not in existing:
        await conn.execute(
            text("ALTER TABLE blocks ADD COLUMN generation_debug JSON")
        )


async def _ensure_attachment_columns(conn):
    """Add columns introduced after the table was first created (SQLite-safe)."""
    result = await conn.execute(text("PRAGMA table_info(attachments)"))
    existing = {row[1] for row in result.fetchall()}
    if "kind" not in existing:
        await conn.execute(
            text("ALTER TABLE attachments ADD COLUMN kind VARCHAR(20) DEFAULT 'file'")
        )
    if "source_url" not in existing:
        await conn.execute(
            text("ALTER TABLE attachments ADD COLUMN source_url VARCHAR(2000)")
        )


async def get_db():
    """Dependency for getting database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
