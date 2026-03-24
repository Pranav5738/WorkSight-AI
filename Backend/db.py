import os, pathlib
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./data.db')
ECHO = os.getenv('SQL_ECHO', '0') == '1'

# For SQLite ensure directory exists and configure thread check
if DATABASE_URL.startswith('sqlite:///'):
    # Extract filesystem path after scheme
    db_path = DATABASE_URL.replace('sqlite:///', '')
    parent = pathlib.Path(db_path).resolve().parent
    parent.mkdir(parents=True, exist_ok=True)
    connect_args = {'check_same_thread': False}
else:
    connect_args = {}

engine = create_engine(
    DATABASE_URL,
    echo=ECHO,
    future=True,
    pool_pre_ping=True,
    connect_args=connect_args
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True, expire_on_commit=False)
Base = declarative_base()

def get_db():
    """FastAPI dependency generator for a SQLAlchemy session."""
    from sqlalchemy.orm import Session
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def session_scope():
    """Provide a transactional scope around a series of operations."""
    from sqlalchemy.orm import Session
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

def init_db(create: bool = True):
    """Optionally create all tables (for dev / tests) and run a simple connectivity check."""
    if create:
        try:
            Base.metadata.create_all(bind=engine)
        except Exception as ex:  # pragma: no cover - environmental
            print('[db] create_all failed:', ex)
    try:
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
    except Exception as ex:  # pragma: no cover
        print('[db] health check failed:', ex)

def db_health() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text('SELECT 1'))
        return True
    except Exception:
        return False

__all__ = [
    'DATABASE_URL', 'engine', 'SessionLocal', 'Base', 'get_db', 'session_scope', 'init_db', 'db_health'
]
