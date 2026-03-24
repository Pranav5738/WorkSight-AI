"""recognizer.py

Lightweight face recognizer for monitoring pipeline.

It loads roster embeddings from the database (if available) or in-memory
fallback, caches them, and provides identify functions that accept image bytes
or BGR frames. It uses the existing face_pipeline to compute embeddings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
import time


try:
    # face embedding pipeline (lazy imports inside)
    from ..face_pipeline import compute_embedding_from_bytes  # type: ignore
except Exception:
    compute_embedding_from_bytes = None  # type: ignore


def _now() -> float:
    return time.time()


@dataclass
class RosterCache:
    # map external employee_id (human-readable) -> embedding vector
    vectors: Dict[str, List[float]] = field(default_factory=dict)
    model: Optional[str] = None
    last_refresh: float = 0.0


class Recognizer:
    def __init__(self, refresh_sec: float = 60.0):
        self.refresh_sec = refresh_sec
        self.cache = RosterCache()
        # sticky candidates per track
        self._last_by_track: Dict[int, Tuple[Optional[str], float, float]] = {}

    def _load_roster_from_db(self) -> bool:
        try:
            from sqlalchemy import select  # type: ignore
            from ..db import SessionLocal  # type: ignore
            from ..models import Employee as EmployeeModel, Embedding as EmbeddingModel  # type: ignore
            with SessionLocal() as db:
                rows = db.execute(select(EmployeeModel).where(EmployeeModel.embedding_status == 'ready')).scalars().all()
                if not rows:
                    return False
                emp_ids = [r.id for r in rows]
                emb_rows = db.execute(select(EmbeddingModel).where(EmbeddingModel.employee_id.in_(emp_ids))).scalars().all()
                emb_by_emp = {er.employee_id: er for er in emb_rows}
                vecs: Dict[str, List[float]] = {}
                for r in rows:
                    emb = emb_by_emp.get(r.id)
                    if not emb:
                        continue
                    raw_vec = emb.vector
                    try:
                        if raw_vec and raw_vec.startswith('['):
                            import json as _json
                            vec = _json.loads(raw_vec)
                        else:
                            vec = [float(x) for x in (raw_vec or '').split()]
                        if isinstance(vec, list) and vec:
                            vecs[r.employee_id] = vec
                    except Exception:
                        continue
                if vecs:
                    self.cache.vectors = vecs
                    self.cache.model = getattr(emb_rows[0], 'model', None) if emb_rows else None
                    self.cache.last_refresh = _now()
                    return True
                return False
        except Exception:
            return False

    def _load_roster_in_memory(self) -> bool:
        try:
            # Pull from Backend.main IN_MEMORY_EMPLOYEES if present
            from .. import main as backend_main  # type: ignore
            all_emp = {}
            # Seed
            if hasattr(backend_main, 'EMPLOYEE_SEED'):
                for e in getattr(backend_main, 'EMPLOYEE_SEED'):
                    all_emp[e['employee_id']] = e
            for e in getattr(backend_main, 'IN_MEMORY_EMPLOYEES', []):
                all_emp[e['employee_id']] = e
            vecs: Dict[str, List[float]] = {}
            for emp_id, e in all_emp.items():
                if e.get('encoding_status') == 'ready' and isinstance(e.get('embedding'), list):
                    vecs[emp_id] = e['embedding']
            if vecs:
                self.cache.vectors = vecs
                self.cache.model = 'hash-v1'
                self.cache.last_refresh = _now()
                return True
            return False
        except Exception:
            return False

    def refresh_if_needed(self, force: bool = False) -> None:
        if not force and (_now() - self.cache.last_refresh) < self.refresh_sec:
            return
        if self._load_roster_from_db():
            return
        self._load_roster_in_memory()

    def identify_bytes(self, image_bytes: bytes) -> Tuple[Optional[str], float]:
        """Return (employee_id, confidence) using cosine similarity; None if unknown."""
        if compute_embedding_from_bytes is None:
            return (None, 0.0)
        try:
            self.refresh_if_needed()
            if not self.cache.vectors:
                return (None, 0.0)
            emb_res = compute_embedding_from_bytes(image_bytes)
            live = getattr(emb_res, 'vector', None)
            if not isinstance(live, list) or not live:
                return (None, 0.0)
            best_emp = None
            best_score = -1.0
            for emp_id, vec in self.cache.vectors.items():
                if len(vec) != len(live):
                    continue
                score = sum(x*y for x, y in zip(vec, live))
                if score > best_score:
                    best_score = score
                    best_emp = emp_id
            if best_emp is None:
                return (None, 0.0)
            return (best_emp, float(best_score))
        except Exception:
            return (None, 0.0)

    def identify_embedding(self, vector: List[float]) -> Tuple[Optional[str], float]:
        try:
            self.refresh_if_needed()
            if not self.cache.vectors:
                return (None, 0.0)
            best_emp = None
            best_score = -1.0
            for emp_id, vec in self.cache.vectors.items():
                if len(vec) != len(vector):
                    continue
                score = sum(x*y for x, y in zip(vec, vector))
                if score > best_score:
                    best_score = score
                    best_emp = emp_id
            if best_emp is None:
                return (None, 0.0)
            return (best_emp, float(best_score))
        except Exception:
            return (None, 0.0)

    def sticky_update(self, track_id: int, emp_id: Optional[str], score: float) -> Optional[str]:
        """Keep last candidate per track to reduce flapping; return current bound id."""
        now = _now()
        last_emp, last_score, _ts = self._last_by_track.get(track_id, (None, 0.0, 0.0))
        # If same emp improves or stays close, keep it; small hysteresis
        if emp_id and (last_emp == emp_id or score >= last_score - 0.02):
            self._last_by_track[track_id] = (emp_id, score, now)
            return emp_id
        # If not confident, prefer previous sticky within 10s
        if last_emp and (now - _ts) < 10.0:
            return last_emp
        self._last_by_track[track_id] = (emp_id, score, now)
        return emp_id
