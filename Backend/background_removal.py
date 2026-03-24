"""background_removal.py

Standalone demo: real-time background removal on webcam feed.

Requirements:
- OpenCV for capture and display
- MediaPipe for person segmentation
- numpy for array math

Features:
- Toggle background: press 'b' to switch between solid color and image
- Quit: press 'q'
- Resizes frames to 640x480 for speed but preserves display scaling
- Tries to keep >=25 FPS on CPU; prints FPS in window title
"""
from __future__ import annotations

import time
import cv2
import numpy as np
import argparse
from typing import Optional

from utils import apply_virtual_background, BgConfig


def _open_cam(idx_or_url: int | str = 0, w: int = 640, h: int = 480) -> cv2.VideoCapture:
    cap = cv2.VideoCapture(idx_or_url)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
    # Prefer MJPG for USB cams (higher FPS) if available
    try:
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    except Exception:
        pass
    return cap


def run(background_path: Optional[str] = None, solid_color: tuple[int, int, int] = (200, 200, 200)):
    cap = _open_cam()
    if not cap or not cap.isOpened():
        raise SystemExit("Could not open default webcam (device 0)")

    cfg = BgConfig(mode="image" if background_path else "color", color=solid_color, image_path=background_path)
    use_image = background_path is not None

    last = time.time()
    frame_count = 0
    fps = 0.0

    while True:
        ok, frame = cap.read()
        if not ok:
            time.sleep(0.01)
            continue

        # Ensure processing at 640x480 for snappy inference
        proc = cv2.resize(frame, (640, 480), interpolation=cv2.INTER_AREA)
        cfg.mode = "image" if use_image else "color"
        out = apply_virtual_background(proc, mode=cfg.mode, bg_color=cfg.color, bg_image_path=cfg.image_path)

        # Optional: upscale back to original display size
        disp = out

        # FPS calc
        frame_count += 1
        now = time.time()
        if now - last >= 1.0:
            fps = frame_count / (now - last)
            frame_count = 0
            last = now

        title = f"Virtual Background - {'Image' if use_image else 'Solid'} - {fps:.1f} FPS (q: quit, b: toggle)"
        cv2.imshow(title, disp)
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        if key == ord('b'):
            use_image = not use_image

    cap.release()
    cv2.destroyAllWindows()


def main():
    ap = argparse.ArgumentParser(description="Real-time background removal using MediaPipe Selfie Segmentation")
    ap.add_argument("--bg", dest="bg", type=str, default=None, help="Path to background image (optional)")
    ap.add_argument("--color", dest="color", type=str, default="200,200,200", help="Solid BGR color, e.g., 255,255,255 for white")
    args = ap.parse_args()
    color = tuple(int(x) for x in args.color.split(','))  # type: ignore
    run(background_path=args.bg, solid_color=color)  # type: ignore[arg-type]


if __name__ == "__main__":
    main()
