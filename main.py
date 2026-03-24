"""Root-level ASGI shim so you can run:
    python -m uvicorn main:app --reload --port 8000
while keeping real code inside Backend/.
"""
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).parent / 'Backend'
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Import the actual FastAPI app from Backend/main.py (module name: backend_main to avoid confusion)
try:
    import importlib
    backend_module = importlib.import_module('main')  # Backend/main.py
    app = getattr(backend_module, 'app')
except Exception as exc:
    raise RuntimeError(f"Failed to import backend FastAPI app: {exc}") from exc
