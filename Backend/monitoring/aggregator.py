"""aggregator.py

Accumulates per-day productivity durations by state per employee and persists
to the database when available, with an in-memory fallback.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional
from datetime import datetime, timezone


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@dataclass
class DailyCounters:
    working_sec: float = 0.0
    idle_sec: float = 0.0
    away_sec: float = 0.0
    sleeping_sec: float = 0.0

    def add(self, state: str, seconds: float) -> None:
        if state == "working":
            self.working_sec += seconds
        elif state == "idle":
            self.idle_sec += seconds
        elif state == "away":
            self.away_sec += seconds
        elif state == "sleeping":
            self.sleeping_sec += seconds


class ProductivityAggregator:
    def __init__(self, use_db: bool = False):
        self.use_db = use_db
        self._mem: Dict[tuple[str | None, str], DailyCounters] = {}

    def add_seconds(self, employee_id: Optional[str], state: str, seconds: float, date_iso: Optional[str] = None) -> None:
        if seconds <= 0:
            return
        date_iso = date_iso or _today_iso()
        key = (employee_id, date_iso)
        if self.use_db:
            try:
                from sqlalchemy import select
                from ..db import SessionLocal  # type: ignore
                from ..models import ProductivityDaily as PD  # type: ignore
                with SessionLocal() as db:
                    row = db.execute(select(PD).where(PD.employee_id == employee_id, PD.date == date_iso)).scalars().first()
                    if not row:
                        row = PD(employee_id=employee_id, date=date_iso, working_sec=0.0, idle_sec=0.0, away_sec=0.0, sleeping_sec=0.0)
                        db.add(row)
                    if state == "working":
                        row.working_sec = float(row.working_sec or 0.0) + seconds
                    elif state == "idle":
                        row.idle_sec = float(row.idle_sec or 0.0) + seconds
                    elif state == "away":
                        row.away_sec = float(row.away_sec or 0.0) + seconds
                    elif state == "sleeping":
                        row.sleeping_sec = float(row.sleeping_sec or 0.0) + seconds
                    db.commit()
                    return
            except Exception:
                # Fall back to memory on any DB issue
                pass
        dc = self._mem.get(key)
        if dc is None:
            dc = DailyCounters()
            self._mem[key] = dc
        dc.add(state, seconds)

    def get_summary(self, date_iso: Optional[str] = None) -> Dict[str | None, Dict[str, float]]:
        date_iso = date_iso or _today_iso()
        out: Dict[str | None, Dict[str, float]] = {}
        if self.use_db:
            try:
                from sqlalchemy import select
                from ..db import SessionLocal  # type: ignore
                from ..models import ProductivityDaily as PD  # type: ignore
                with SessionLocal() as db:
                    rows = db.execute(select(PD).where(PD.date == date_iso)).scalars().all()
                    for r in rows:
                        out[r.employee_id] = {
                            "working_sec": float(r.working_sec or 0.0),
                            "idle_sec": float(r.idle_sec or 0.0),
                            "away_sec": float(r.away_sec or 0.0),
                            "sleeping_sec": float(r.sleeping_sec or 0.0),
                        }
                    return out
            except Exception:
                pass
        for (emp, d), c in self._mem.items():
            if d != date_iso:
                continue
            out[emp] = {
                "working_sec": c.working_sec,
                "idle_sec": c.idle_sec,
                "away_sec": c.away_sec,
                "sleeping_sec": c.sleeping_sec,
            }
        return out
