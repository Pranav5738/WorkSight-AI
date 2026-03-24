"""utils.py

Background removal utilities using MediaPipe Selfie Segmentation.

This module exposes a lightweight API to:
- lazily initialize a segmentation model (singleton per-process)
- apply person segmentation to a BGR frame (np.ndarray)
- composite with a background color or image

Dependencies: opencv-python(-headless), mediapipe, numpy

Usage:
    from utils import apply_virtual_background
    out = apply_virtual_background(frame, bg_image_path="background.jpg", bg_color=(255,255,255))

Notes:
- Frames are expected in BGR color space (as returned by cv2.VideoCapture)
- For performance, segmentation runs on a resized copy (default 256p short-side)
  and the mask is resized back to original size.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional, Tuple, Literal

import cv2
import numpy as np

_MP_AVAILABLE = True
try:  # Lazy import guard in case mediapipe isn't installed in some envs
    import mediapipe as mp  # type: ignore
except Exception:
    _MP_AVAILABLE = False
    mp = None  # type: ignore


@dataclass
class BgConfig:
    mode: Literal["color", "image"] = "color"
    color: Tuple[int, int, int] = (255, 255, 255)  # BGR white
    image_path: Optional[str] = None
    # Processing settings
    process_short_side: int = 256  # resize shorter side to this for segmentation
    threshold: float = 0.1  # foreground probability threshold


_segmenter = None  # type: ignore


def _get_segmenter():
    """Create or return a cached MediaPipe SelfieSegmentation instance."""
    global _segmenter
    if _segmenter is None:
        if not _MP_AVAILABLE:
            raise RuntimeError("mediapipe is not available; install mediapipe to use background removal")
        # model_selection=1 is landscape, 0 is general. 1 is usually better for people at desk.
        _segmenter = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)  # type: ignore[attr-defined]
    return _segmenter


def _load_bg_image(path: str, size_wh: Tuple[int, int]) -> Optional[np.ndarray]:
    if not path:
        return None
    # Resolve relative to project root if needed
    if not os.path.isabs(path):
        # Try current file dir and project root
        here = os.path.dirname(__file__)
        candidates = [
            os.path.join(here, path),
            os.path.join(os.path.dirname(here), path),
            path,
        ]
        for p in candidates:
            if os.path.exists(p):
                path = p
                break
    if not os.path.exists(path):
        return None
    img = cv2.imread(path)
    if img is None:
        return None
    w, h = size_wh
    return cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)


def _compute_mask(frame_bgr: np.ndarray, short_side: int, threshold: float) -> np.ndarray:
    """Return a float32 mask in [0,1] with shape (H, W) where 1=foreground/person.

    The segmentation is run on a resized RGB copy for speed; the result is
    resized back to original frame size using bilinear interpolation.
    """
    h, w = frame_bgr.shape[:2]
    # Compute resize that preserves aspect ratio
    scale = short_side / float(min(h, w)) if short_side and min(h, w) > 0 else 1.0
    if scale < 1.0:
        target_w, target_h = int(round(w * scale)), int(round(h * scale))
        small = cv2.resize(frame_bgr, (target_w, target_h), interpolation=cv2.INTER_AREA)
    else:
        small = frame_bgr

    # MediaPipe expects RGB
    rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
    seg = _get_segmenter()
    res = seg.process(rgb)
    mask_small: np.ndarray = getattr(res, "segmentation_mask", None)
    if mask_small is None:
        return np.zeros((h, w), dtype=np.float32)
    # Resize mask back to original size
    mask = cv2.resize(mask_small, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    # Threshold to get a clean binary-ish matte; keep soft edges with sigmoid-like ramp
    # Use clipped linear ramp around threshold
    m = np.clip((mask - threshold) / max(1e-6, (1.0 - threshold)), 0.0, 1.0)
    return m


def apply_virtual_background(
    frame_bgr: np.ndarray,
    *,
    mode: Literal["color", "image"] = "color",
    bg_color: Tuple[int, int, int] = (255, 255, 255),
    bg_image_path: Optional[str] = None,
    process_short_side: int = 256,
    threshold: float = 0.1,
) -> np.ndarray:
    """Apply person segmentation and composite the frame onto a background.

    Args:
        frame_bgr: Input frame (H,W,3) in BGR format.
        mode: "color" to use a solid color background, or "image".
        bg_color: BGR tuple for solid background when mode=="color".
        bg_image_path: Path to background image when mode=="image".
        process_short_side: Resize shorter side to this size for segmentation.
        threshold: Foreground probability threshold.

    Returns:
        Composited frame in BGR.
    """
    h, w = frame_bgr.shape[:2]
    mask = _compute_mask(frame_bgr, process_short_side, threshold)
    mask3 = np.dstack([mask, mask, mask])  # (H,W,3)

    if mode == "image":
        bg = _load_bg_image(bg_image_path or "", (w, h))
        if bg is None:
            bg = np.full((h, w, 3), bg_color, dtype=np.uint8)
    else:
        bg = np.full((h, w, 3), bg_color, dtype=np.uint8)

    # Composite: out = fg*mask + bg*(1-mask)
    fg = frame_bgr.astype(np.float32) / 255.0
    bgf = bg.astype(np.float32) / 255.0
    out = fg * mask3 + bgf * (1.0 - mask3)
    return (np.clip(out, 0.0, 1.0) * 255.0).astype(np.uint8)


def try_apply_virtual_background(
    frame_bgr: np.ndarray, config: Optional[BgConfig]
) -> np.ndarray:
    """Best-effort background removal.

    If mediapipe is unavailable or any error occurs, returns the original frame.
    """
    if not config:
        return frame_bgr
    try:
        return apply_virtual_background(
            frame_bgr,
            mode=config.mode,
            bg_color=config.color,
            bg_image_path=config.image_path,
            process_short_side=config.process_short_side,
            threshold=config.threshold,
        )
    except Exception:
        return frame_bgr
