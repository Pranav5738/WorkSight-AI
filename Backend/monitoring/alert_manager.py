"""alert_manager.py

Sends notifications to a manager when an employee is idle or away beyond thresholds.
Uses a REST endpoint configured by MANAGER_API_URL or provides a local FastAPI route.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Dict, Any, List
import time
import requests


@dataclass
class Alert:
    timestamp: float
    employee_id: Optional[str]
    track_id: Optional[int]
    state: str  # 'idle' | 'away'
    duration_sec: float
    message: str


class AlertManager:
    def __init__(self, manager_api_url: Optional[str] = None, cooldown_sec: int = 300):
        self.manager_api_url = manager_api_url
        self.cooldown_sec = cooldown_sec
        self._last_sent: Dict[str, float] = {}
        self._log: List[Alert] = []

    @property
    def log(self) -> List[Alert]:
        return list(self._log)

    def _can_send(self, key: str) -> bool:
        now = time.time()
        last = self._last_sent.get(key, 0.0)
        if now - last >= self.cooldown_sec:
            self._last_sent[key] = now
            return True
        return False

    def send(self, state: str, duration_sec: float, employee_id: Optional[str] = None, track_id: Optional[int] = None, extras: Optional[Dict[str, Any]] = None) -> bool:
        key = f"{employee_id or 'unknown'}:{state}"
        if not self._can_send(key):
            return False
        msg = f"Employee {employee_id or track_id or 'unknown'} is {state} for {int(duration_sec)}s"
        alert = Alert(timestamp=time.time(), employee_id=employee_id, track_id=track_id, state=state, duration_sec=duration_sec, message=msg)
        self._log.append(alert)
        if self.manager_api_url:
            try:
                payload = {"employee_id": employee_id, "track_id": track_id, "state": state, "duration_sec": duration_sec, "message": msg, "extras": extras or {}}
                r = requests.post(self.manager_api_url.rstrip("/") + "/notify_manager", json=payload, timeout=5)
                return r.status_code < 300
            except Exception:
                return False
        # If no external URL, consider it locally handled
        return True
