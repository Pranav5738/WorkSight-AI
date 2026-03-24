"""Face recognition pipeline abstraction.

This module encapsulates detection, alignment, embedding extraction, and similarity.
Concrete model (InsightFace / FaceNet) can be plugged in later. For now keeps a
pluggable interface so we can migrate from the current hash placeholder.
"""
from __future__ import annotations


from dataclasses import dataclass
from typing import List, Optional, Tuple, TYPE_CHECKING
import hashlib, math, os, importlib.util, logging, traceback
from pathlib import Path

# Load environment variables from a local .env if present (non-fatal if missing)
try:
    from dotenv import load_dotenv  # type: ignore
    # Prefer Backend/.env alongside this file
    _ENV_PATH = Path(__file__).parent / '.env'
    if _ENV_PATH.exists():
        load_dotenv(dotenv_path=_ENV_PATH)
    else:
        load_dotenv()  # fallback to cwd
except Exception:
    pass

"""
NOTE: Optional heavy dependencies (insightface, cv2, numpy) are imported lazily inside functions.
Linters may show unresolved import errors, but these are handled at runtime and are not fatal.
If REAL_FACE=1, ensure 'insightface' and its dependencies are installed in your environment.
"""

logger = logging.getLogger("face_pipeline")

try:  # Optional heavy deps imported lazily; type stubs via TYPE_CHECKING
    import numpy as _np  # noqa: F401
except Exception:  # pragma: no cover
    _np = None  # type: ignore

if TYPE_CHECKING:  # only for type hints to avoid runtime dependency
    import numpy as np  # type: ignore

REAL_FACE_ENABLED = os.getenv('REAL_FACE', '0') == '1'
FACE_CTX_ID = int(os.getenv('FACE_CTX_ID', '0'))  # 0 GPU, -1 CPU
FACE_DET_SIZE = os.getenv('FACE_DET_SIZE', '640x640')
try:
    _det_w, _det_h = [int(x) for x in FACE_DET_SIZE.lower().split('x')]
    FACE_DET_SHAPE = (_det_w, _det_h)
except Exception:
    FACE_DET_SHAPE = (640, 640)

_INSIGHT_APP = None
_MODEL_NAME = 'hash-v1'
_IMPORT_ERROR = None  # store last import error details

def _lazy_load():
    """Attempt to load insightface once, capturing rich diagnostics on failure."""
    global _INSIGHT_APP, _MODEL_NAME, _IMPORT_ERROR
    if not REAL_FACE_ENABLED or _INSIGHT_APP is not None:
        return
    # Quick spec check before heavy import
    if importlib.util.find_spec('insightface') is None:
        _IMPORT_ERROR = 'Package insightface not found in current interpreter'
        logger.warning("[face_pipeline] insightface spec missing – using hash fallback")
        return
    try:
        # Dynamic import so linters don't flag unresolved import when optional dep missing
        insightface = importlib.import_module('insightface')  # type: ignore
        ctx_id = FACE_CTX_ID if FACE_CTX_ID >= -1 else 0
        _INSIGHT_APP = insightface.app.FaceAnalysis(name='buffalo_l')
        _INSIGHT_APP.prepare(ctx_id=ctx_id, det_size=FACE_DET_SHAPE)
        _MODEL_NAME = f'insightface-buffalo_l-ctx{ctx_id}'
        logger.info("[face_pipeline] insightface model loaded", extra={'model': _MODEL_NAME, 'det_size': FACE_DET_SHAPE, 'ctx_id': ctx_id})
    except Exception as ex:  # pragma: no cover
        _IMPORT_ERROR = f"{type(ex).__name__}: {ex}"
        logger.error('[face_pipeline] insightface load failed – hash fallback', exc_info=True)
        _INSIGHT_APP = None
        _MODEL_NAME = 'hash-v1'

def _detect_align(image_bytes: bytes) -> List[Tuple['np.ndarray', float]]:
    """Return list of (aligned_rgb_array, det_score)."""
    if not REAL_FACE_ENABLED:
        return []
    _lazy_load()
    if _INSIGHT_APP is None:
        return []
    try:
        import cv2, numpy as np  # noqa
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return []
        faces = _INSIGHT_APP.get(img)
        crops: List[Tuple['np.ndarray',float]] = []
        for f in faces:
            box = getattr(f, 'bbox', None)
            if box is None:
                continue
            box = box.astype(int)
            x1, y1, x2, y2 = box
            x1 = max(x1, 0); y1 = max(y1, 0)
            crop = img[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            crops.append((crop[:, :, ::-1], float(getattr(f, 'det_score', 1.0))))  # RGB
        return crops
    except Exception as ex:  # pragma: no cover
        logger.error('[face_pipeline] detection failure', exc_info=True)
        return []


@dataclass
class EmbeddingResult:
    vector: List[float]
    model: str
    dim: int
    quality: Optional[float] = None  # placeholder for detection quality / sharpness


class FacePipeline:
    def __init__(self, dim: int = 64):
        self.dim = dim

    def detect_and_align(self, image_bytes: bytes) -> List[bytes]:
        if REAL_FACE_ENABLED:
            outs = _detect_align(image_bytes)
            if outs:
                # convert np arrays to JPEG bytes (lossy but smaller)
                converted: List[bytes] = []
                try:
                    import cv2, numpy as np  # noqa
                    for arr, _score in outs:
                        ok, buf = cv2.imencode('.jpg', arr[:, :, ::-1])  # back to BGR for encode
                        if ok:
                            converted.append(buf.tobytes())
                    if converted:
                        return converted
                except Exception:
                    logger.debug('[face_pipeline] jpeg encode failure', exc_info=True)
        return [image_bytes]

    def _hash_embed(self, raw: bytes) -> List[float]:
        h = hashlib.sha256(raw).digest()
        buf = (h * ((self.dim // len(h)) + 1))[: self.dim]
        vec = [b / 255.0 for b in buf]
        norm = math.sqrt(sum(v*v for v in vec)) or 1.0
        return [round(v / norm, 6) for v in vec]

    def embed(self, face_bytes: bytes) -> EmbeddingResult:
        if REAL_FACE_ENABLED:
            _lazy_load()
            if _INSIGHT_APP is not None:
                # Run embedding via embedded insightface model (extract feature)
                try:
                    import cv2, numpy as np  # noqa
                    arr = np.frombuffer(face_bytes, dtype=np.uint8)
                    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if img is not None:
                        faces = _INSIGHT_APP.get(img)
                        if faces:
                            f = faces[0]
                            emb = getattr(f, 'normed_embedding', None)
                            if emb is not None:
                                vec = [float(round(x, 6)) for x in emb.tolist()]
                                return EmbeddingResult(vector=vec, model=_MODEL_NAME, dim=len(vec), quality=float(getattr(f, 'det_score', 1.0)))
                except Exception:  # pragma: no cover
                    logger.error('[face_pipeline] embed failure, fallback hash', exc_info=True)
        # fallback hash
        return EmbeddingResult(vector=self._hash_embed(face_bytes), model=_MODEL_NAME, dim=self.dim)

    def embed_image(self, image_bytes: bytes) -> List[EmbeddingResult]:
        return [self.embed(c) for c in self.detect_and_align(image_bytes)]

    def similarity(self, a: List[float], b: List[float]) -> float:
        return sum(x*y for x,y in zip(a,b))


PIPELINE = FacePipeline()

def insightface_status() -> dict:
    """Expose diagnostic information for readiness / debugging."""
    return {
        'enabled': REAL_FACE_ENABLED,
        'model_name': _MODEL_NAME,
        'loaded': _INSIGHT_APP is not None,
        'ctx_id': FACE_CTX_ID,
        'det_size': FACE_DET_SHAPE,
        'import_error': _IMPORT_ERROR
    }

def compute_embedding_from_bytes(raw: bytes) -> EmbeddingResult:
    return PIPELINE.embed(raw)

# New helpers for monitoring pipeline (optional; no hard dependency when REAL_FACE disabled)
def faces_from_bgr(bgr_image) -> list[dict]:
    """Return list of faces with bbox and embedding from a BGR numpy image.
    Each item: { 'bbox': (x1,y1,x2,y2), 'score': float, 'embedding': [floats] }
    Returns [] if REAL_FACE is disabled or model unavailable.
    """
    if not REAL_FACE_ENABLED:
        return []
    _lazy_load()
    if _INSIGHT_APP is None:
        return []
    try:
        import numpy as np  # type: ignore
        img = bgr_image
        if img is None:
            return []
        faces = _INSIGHT_APP.get(img)
        out = []
        for f in faces:
            box = getattr(f, 'bbox', None)
            emb = getattr(f, 'normed_embedding', None)
            if box is None or emb is None:
                continue
            box = box.astype(int)
            x1, y1, x2, y2 = [int(x) for x in box]
            out.append({
                'bbox': (x1, y1, x2, y2),
                'score': float(getattr(f, 'det_score', 1.0)),
                'embedding': [float(round(x, 6)) for x in emb.tolist()],
            })
        return out
    except Exception:  # pragma: no cover
        logger.error('[face_pipeline] faces_from_bgr failure', exc_info=True)
        return []
