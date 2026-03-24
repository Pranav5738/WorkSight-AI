"""Monitoring Orchestrator

Runs the employee work activity monitoring pipeline:
- Capture frames from camera
- Detect activity state (working/idle/away)
- Track entities and time in state
- Trigger alerts to manager when thresholds exceeded

This can be started as a background task from FastAPI.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Optional, Dict, Any

from .camera_feed import CameraFeed, simulate_from_images
from .activity_detector import ActivityDetector
from .tracker import CentroidTracker
from .alert_manager import AlertManager
from .aggregator import ProductivityAggregator
from .recognizer import Recognizer


DEFAULT_CONFIG = {
    "VIDEO_SOURCE": 0,  # 0 for default webcam
    "FRAME_WIDTH": 640,
    "FRAME_HEIGHT": 480,
    "CONFIDENCE_THRESHOLD": 0.5,
    "IDLE_THRESHOLD_SECONDS": 5 * 60,  # 5 minutes
    "AWAY_THRESHOLD_SECONDS": 30,      # 30 seconds
    "TRACK_EXPIRE_SECONDS": 60,
    "MANAGER_API_URL": None,           # e.g., http://localhost:8000
    "ALERT_COOLDOWN_SECONDS": 300,
    # Virtual background settings (optional)
    "VBG_ENABLED": True,
    "VBG_MODE": "color",              # "color" | "image"
    "VBG_COLOR": [200, 200, 200],      # BGR list
    "VBG_IMAGE_PATH": "background.jpg",
    "VBG_SHORT_SIDE": 256,
    "VBG_THRESHOLD": 0.1,
    # Demo options: when VIDEO_SOURCE starts with "demo:", the remainder is
    # treated as a glob or directory of images to loop over
    "DEMO_FPS": 6.0,
}


def load_config(config_path: Optional[str]) -> Dict[str, Any]:
    cfg = DEFAULT_CONFIG.copy()
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                user_cfg = json.load(f)
            cfg.update({k: v for k, v in user_cfg.items() if k in cfg})
        except Exception:
            pass
    return cfg


class MonitoringService:
    def __init__(self, config_path: Optional[str] = None):
        self.cfg = load_config(config_path)
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self.detector = ActivityDetector(confidence_threshold=float(self.cfg["CONFIDENCE_THRESHOLD"]))
        self.tracker = CentroidTracker(forget_after=int(self.cfg["TRACK_EXPIRE_SECONDS"]))
        self.alerts = AlertManager(manager_api_url=self.cfg.get("MANAGER_API_URL"), cooldown_sec=int(self.cfg["ALERT_COOLDOWN_SECONDS"]))
        # Attempt DB-backed aggregation when DB layer is available
        try:
            from ..db import SessionLocal  # type: ignore
            self.aggregator = ProductivityAggregator(use_db=True)
        except Exception:
            self.aggregator = ProductivityAggregator(use_db=False)
        # Camera and recognition helpers
        self.camera = None  # type: Optional[CameraFeed]
        self.recognizer = Recognizer(refresh_sec=60.0)
        self._track_emp = {}  # track_id -> employee_id (or None)
        self._demo_iter = None  # generator for demo images
        self._init_camera()

    def _init_camera(self):
        src = self.cfg["VIDEO_SOURCE"]
        if isinstance(src, str) and str(src).startswith("demo:"):
            # Demo mode using local images
            pattern = str(src)[5:] or "uploads/*.jpg"
            self._demo_iter = simulate_from_images(pattern, fps=float(self.cfg.get("DEMO_FPS", 6.0)), loop=True)
            self.camera = None
        else:
            self._demo_iter = None
            self.camera = CameraFeed(
                source=src,
                width=int(self.cfg["FRAME_WIDTH"]),
                height=int(self.cfg["FRAME_HEIGHT"]),
            )

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        if self.camera:
            self.camera.start()
        self._thread = threading.Thread(target=self._run, name="MonitoringService", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)
        if self.camera:
            self.camera.stop()

    def _run(self):
        idle_threshold = float(self.cfg["IDLE_THRESHOLD_SECONDS"])  # seconds
        away_threshold = float(self.cfg["AWAY_THRESHOLD_SECONDS"])  # seconds

        # Lazy import to avoid mandatory dependency in environments without mediapipe
        try:
            from ..utils import BgConfig, try_apply_virtual_background  # type: ignore
        except Exception:
            BgConfig = None  # type: ignore
            def try_apply_virtual_background(x, y):  # type: ignore
                return x

        # target identification cadence (seconds)
        ident_interval = float(os.getenv('MON_IDENT_INTERVAL', '2.0'))
        last_ident = 0.0

        def _frame_gen():
            if self.camera:
                yield from self.camera.frames()
            else:
                # Demo generator
                while not self._stop.is_set():
                    try:
                        yield next(self._demo_iter)
                    except StopIteration:
                        break

        # Cache face boxes per track id
        track_face_box: dict[int, tuple[int,int,int,int]] = {}

        for frame in _frame_gen():
            if self._stop.is_set():
                break
            try:
                # Optional virtual background pre-processing
                if bool(self.cfg.get("VBG_ENABLED", True)):
                    try:
                        bg_cfg = BgConfig(
                            mode=str(self.cfg.get("VBG_MODE", "color")),
                            color=tuple(int(x) for x in self.cfg.get("VBG_COLOR", [200, 200, 200])),
                            image_path=self.cfg.get("VBG_IMAGE_PATH") or None,
                            process_short_side=int(self.cfg.get("VBG_SHORT_SIDE", 256)),
                            threshold=float(self.cfg.get("VBG_THRESHOLD", 0.1)),
                        )
                        frame = try_apply_virtual_background(frame, bg_cfg)
                    except Exception:
                        pass
                result = self.detector.predict(frame)
                # Build detections; try real face boxes when available
                h, w = frame.shape[:2]
                detections = []
                face_items = []
                try:
                    from ..face_pipeline import faces_from_bgr  # type: ignore
                    face_items = faces_from_bgr(frame) or []
                except Exception:
                    face_items = []
                if face_items:
                    for f in face_items:
                        (fx1, fy1, fx2, fy2) = f['bbox']
                        detections.append(((float(fx1), float(fy1), float(fx2), float(fy2)), result.state))
                else:
                    # Fallback: single center box
                    centroid = (w // 2, h // 2)
                    box_w = max(20, int(min(w, h) * 0.08))
                    x1 = max(0, centroid[0] - box_w)
                    y1 = max(0, centroid[1] - box_w)
                    x2 = min(w - 1, centroid[0] + box_w)
                    y2 = min(h - 1, centroid[1] + box_w)
                    detections.append(((float(x1), float(y1), float(x2), float(y2)), result.state))
                tracks = self.tracker.update(detections, image_size=(w, h))

                # Only one track expected; send alerts on thresholds
                for tid, st in tracks.items():
                    duration = time.time() - st.state_since
                    # Identify employee per track at a controlled cadence
                    emp_id = self._track_emp.get(tid)
                    now = time.time()
                    if (emp_id is None) and (now - last_ident >= ident_interval):
                        # Try to bind using face embeddings when available; support multi-face by nearest box
                        try:
                            import math
                            bound = None
                            # rebuild face_items here in case earlier path failed
                            if not face_items:
                                try:
                                    from ..face_pipeline import faces_from_bgr  # type: ignore
                                    face_items = faces_from_bgr(frame) or []
                                except Exception:
                                    face_items = []
                            if face_items:
                                # choose face nearest to this track centroid
                                tcx, tcy = st.centroid
                                def center_of(b):
                                    x1,y1,x2,y2 = b
                                    return ((x1+x2)/2.0, (y1+y2)/2.0)
                                best = None
                                best_d = 1e9
                                for f in face_items:
                                    cx, cy = center_of(f['bbox'])
                                    d = math.hypot(tcx - cx, tcy - cy)
                                    if d < best_d:
                                        best_d = d
                                        best = f
                                if best is not None:
                                    track_face_box[tid] = tuple(int(v) for v in best['bbox'])  # cache box
                                    # Prefer identifying from embedding vector directly
                                    vec = best.get('embedding')
                                    if isinstance(vec, list) and vec:
                                        cand, conf = self.recognizer.identify_embedding(vec)
                                        bind = self.recognizer.sticky_update(tid, cand, conf)
                                        if bind and conf >= float(os.getenv('MON_IDENT_THRESHOLD', '0.85')):
                                            self._track_emp[tid] = bind
                                        else:
                                            self._track_emp[tid] = bind or None
                                        bound = True
                            if not bound:
                                # Fallback path: crop the last known face box or center box and identify via bytes
                                import cv2
                                if tid in track_face_box:
                                    x1,y1,x2,y2 = track_face_box[tid]
                                else:
                                    # compute center box
                                    box_w = max(20, int(min(w, h) * 0.08))
                                    cx, cy = int(st.centroid[0]), int(st.centroid[1])
                                    x1 = max(0, cx - box_w); y1 = max(0, cy - box_w)
                                    x2 = min(w - 1, cx + box_w); y2 = min(h - 1, cy + box_w)
                                crop = frame[y1:y2, x1:x2]
                                ok, buf = cv2.imencode('.jpg', crop)
                                if ok:
                                    cand, conf = self.recognizer.identify_bytes(buf.tobytes())
                                    bind = self.recognizer.sticky_update(tid, cand, conf)
                                    if bind and conf >= float(os.getenv('MON_IDENT_THRESHOLD', '0.85')):
                                        self._track_emp[tid] = bind
                                    else:
                                        self._track_emp[tid] = bind or None
                            last_ident = now
                        except Exception:
                            self._track_emp[tid] = None
                            last_ident = now
                    emp_id = self._track_emp.get(tid)
                    # Aggregate seconds against bound employee id (or None)
                    try:
                        self.aggregator.add_seconds(employee_id=emp_id, state=result.state, seconds=0.5)
                    except Exception:
                        pass
                    if result.state == "idle" and duration >= idle_threshold:
                        self.alerts.send("idle", duration, employee_id=emp_id, track_id=tid, extras=result.extras)
                    if result.state == "away" and duration >= away_threshold:
                        self.alerts.send("away", duration, employee_id=emp_id, track_id=tid, extras=result.extras)
            except Exception as ex:  # keep loop alive on any error
                try:
                    print(f"[monitoring] loop error: {ex}")
                except Exception:
                    pass
            finally:
                # Sleep lightly to avoid CPU spikes if running faster than needed
                time.sleep(0.005)


# Singleton used when run inside FastAPI
_service_singleton: Optional[MonitoringService] = None


def get_service(config_path: Optional[str] = None) -> MonitoringService:
    global _service_singleton
    if _service_singleton is None:
        _service_singleton = MonitoringService(config_path=config_path)
    return _service_singleton
