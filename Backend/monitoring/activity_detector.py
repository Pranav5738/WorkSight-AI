"""activity_detector.py

Lightweight activity detector combining:
- Presence/pose landmarks via MediaPipe (if available)
- Optional ONNX classifier over landmark features to estimate activity state

States: 'working', 'idle', 'away', 'sleeping'.

If MediaPipe or ONNX runtime is unavailable, falls back to simple motion
heuristics (frame differencing) to distinguish working vs idle.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple, Dict
import numpy as np

try:
    import mediapipe as mp  # type: ignore
    _MP_OK = True
except Exception:
    _MP_OK = False

try:
    import onnxruntime as ort  # type: ignore
    _ORT_OK = True
except Exception:
    _ORT_OK = False


@dataclass
class ActivityResult:
    state: str  # 'working' | 'idle' | 'away' | 'sleeping'
    confidence: float
    presence: bool
    extras: Dict[str, float]


class ActivityDetector:
    """Activity detector using MediaPipe landmarks and optional ONNX classifier."""
    def __init__(self, onnx_model_path: Optional[str] = None, confidence_threshold: float = 0.6):
        self.confidence_threshold = confidence_threshold
        self._prev_gray: Optional[np.ndarray] = None
        self._mp_pose = None
        self._pose = None
        if _MP_OK:
            self._mp_pose = mp.solutions.pose
            self._pose = self._mp_pose.Pose(static_image_mode=False, model_complexity=1, enable_segmentation=False)
        self._sess = None
        if onnx_model_path and _ORT_OK:
            try:
                self._sess = ort.InferenceSession(onnx_model_path, providers=["CPUExecutionProvider"])  # simple CPU
            except Exception:
                self._sess = None

    def _extract_features(self, frame_bgr: np.ndarray) -> Tuple[bool, np.ndarray, Dict[str, float]]:
        """Return (presence, features, extras). features is a 1D vector suitable for ONNX or heuristics."""
        h, w = frame_bgr.shape[:2]
        extras: Dict[str, float] = {}
        if self._pose is not None:
            frame_rgb = frame_bgr[:, :, ::-1]
            res = self._pose.process(frame_rgb)
            if res.pose_landmarks is None:
                return False, np.zeros(34, dtype=np.float32), extras
            lm = res.pose_landmarks.landmark
            # Select a small subset (e.g., shoulders, elbows, wrists) for hand/upper-body motion
            idx = [11, 12, 13, 14, 15, 16]  # L/R shoulders, elbows, wrists
            coords = []
            for i in idx:
                p = lm[i]
                coords.extend([p.x, p.y])
            feats = np.asarray(coords, dtype=np.float32)
            # Add simple posture heuristic: shoulder to wrist distances
            lsx, lsy, lex, ley, lwx, lwy, rsx, rsy, rex, rey, rwx, rwy = feats
            left_arm_len = np.hypot(lwx - lsx, lwy - lsy)
            right_arm_len = np.hypot(rwx - rsx, rwy - rsy)
            extras.update({"left_arm": float(left_arm_len), "right_arm": float(right_arm_len)})
            return True, feats, extras

        # Fallback: simple motion features via frame differencing
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)  # type: ignore
        motion = 0.0
        if self._prev_gray is not None:
            diff = cv2.absdiff(gray, self._prev_gray)  # type: ignore
            motion = float(np.mean(diff)) / 255.0
        self._prev_gray = gray
        extras.update({"motion": motion})
        return motion > 0.02, np.array([motion], dtype=np.float32), extras

    def predict(self, frame_bgr: np.ndarray) -> ActivityResult:
        present, feats, extras = self._extract_features(frame_bgr)
        if not present:
            return ActivityResult(state="away", confidence=1.0, presence=False, extras=extras)

        # ONNX classifier path
        if self._sess is not None:
            try:
                inp_name = self._sess.get_inputs()[0].name
                x = feats.reshape(1, -1).astype(np.float32)
                out = self._sess.run(None, {inp_name: x})
                probs = out[0].reshape(-1)
                classes = ["working", "idle", "away", "sleeping"]
                idx = int(np.argmax(probs))
                return ActivityResult(state=classes[idx], confidence=float(probs[idx]), presence=True, extras=extras)
            except Exception:
                pass

        # Heuristic classification using arm movement and posture
        motion = extras.get("motion")
        if motion is not None:
            # motion-based heuristic
            if motion > 0.08:
                return ActivityResult(state="working", confidence=min(1.0, motion), presence=True, extras=extras)
            elif motion > 0.02:
                return ActivityResult(state="idle", confidence=0.6, presence=True, extras=extras)
            else:
                return ActivityResult(state="idle", confidence=0.55, presence=True, extras=extras)

        # landmark-based: arm lengths change -> motion
        la = extras.get("left_arm", 0.0)
        ra = extras.get("right_arm", 0.0)
        activity_score = (la + ra) / 2.0
        if activity_score > 0.1:
            return ActivityResult(state="working", confidence=0.7, presence=True, extras=extras)
        return ActivityResult(state="idle", confidence=0.6, presence=True, extras=extras)


# Local import for fallback path
import cv2  # noqa: E402
