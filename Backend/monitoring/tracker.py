"""tracker.py

Simple centroid-based person tracker with per-identity timers for activity state.
This is intentionally lightweight; it associates detections by nearest centroid.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Tuple, Optional
import time
import math


@dataclass
class TrackState:
    id: int
    centroid: Tuple[float, float]
    last_seen: float = field(default_factory=time.time)
    state: str = "unknown"  # working|idle|away|sleeping
    state_since: float = field(default_factory=time.time)

    def update(self, centroid: Tuple[float, float], state: str):
        now = time.time()
        self.centroid = centroid
        self.last_seen = now
        if state != self.state:
            self.state = state
            self.state_since = now


class CentroidTracker:
    def __init__(self, max_distance: float = 80.0, forget_after: float = 30.0):
        self._next_id = 1
        self._tracks: Dict[int, TrackState] = {}
        self.max_distance = max_distance
        self.forget_after = forget_after

    def _distance(self, a: Tuple[float, float], b: Tuple[float, float]) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    def update(self, detections: Tuple[Tuple[float, float, float, float], str] | list, image_size: Tuple[int, int]) -> Dict[int, TrackState]:
        """Update tracker with detections.

        detections: list of ((x1,y1,x2,y2), state) in pixel coords
        image_size: (width, height)
        """
        now = time.time()
        if not isinstance(detections, list):
            detections = [detections]

        centroids = []
        for (x1, y1, x2, y2), state in detections:
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            centroids.append(((cx, cy), state))

        # Associate by nearest neighbor
        unmatched = set(self._tracks.keys())
        for (cx, cy), state in centroids:
            best_id: Optional[int] = None
            best_dist = self.max_distance
            for tid in list(unmatched):
                d = self._distance((cx, cy), self._tracks[tid].centroid)
                if d < best_dist:
                    best_dist = d
                    best_id = tid
            if best_id is None:
                # create new track
                tid = self._next_id
                self._next_id += 1
                self._tracks[tid] = TrackState(id=tid, centroid=(cx, cy), state=state)
            else:
                self._tracks[best_id].update((cx, cy), state)
                unmatched.discard(best_id)

        # Expire old tracks
        for tid in list(self._tracks.keys()):
            if now - self._tracks[tid].last_seen > self.forget_after:
                del self._tracks[tid]

        return dict(self._tracks)
