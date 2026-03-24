"""camera_feed.py

Handles video capture using OpenCV and yields frames for downstream processing.
Supports webcam (default device 0) or a file/RTSP/HTTP stream URL.
"""
from __future__ import annotations

import cv2
import threading
import time
from typing import Generator, Optional, List
import glob
import os


class CameraFeed:
    """Threaded camera reader providing the latest frame.

    Usage:
        feed = CameraFeed(0)  # or path/URL
        feed.start()
        for frame in feed.frames():
            ... # process
        feed.stop()
    """

    def __init__(self, source: Optional[str | int] = 0, width: int = 1280, height: int = 720):
        self.source = source
        self.width = width
        self.height = height
        self._cap: Optional[cv2.VideoCapture] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._last_frame = None

    def start(self) -> None:
        if self._running:
            return
        self._cap = cv2.VideoCapture(self.source)
        if self.width and self.height:
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self._running = True
        self._thread = threading.Thread(target=self._reader, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:
                pass
        self._cap = None

    def _reader(self) -> None:
        assert self._cap is not None
        while self._running:
            ok, frame = self._cap.read()
            if not ok:
                time.sleep(0.05)
                continue
            with self._lock:
                self._last_frame = frame

    def frames(self) -> Generator:
        """Yield the most recent frame at ~30fps (if available)."""
        try:
            while self._running:
                with self._lock:
                    frame = self._last_frame
                if frame is not None:
                    yield frame
                time.sleep(1.0 / 30.0)
        finally:
            self.stop()


def simulate_from_file(path: str, loop: bool = True) -> Generator:
    """Simple generator for testing from a video file without threading."""
    cap = cv2.VideoCapture(path)
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                if loop:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                break
            yield frame
    finally:
        cap.release()


def simulate_from_images(path_or_glob: str, fps: float = 10.0, loop: bool = True) -> Generator:
    """Yield frames by cycling through images matching a glob.

    Useful for demo environments where a webcam is unavailable. The function
    accepts either a directory (all .jpg/.png files will be used) or an
    explicit glob pattern like "uploads/*.jpg".
    """
    # Resolve list of files
    if os.path.isdir(path_or_glob):
        patterns = [os.path.join(path_or_glob, '*.jpg'), os.path.join(path_or_glob, '*.png')]
        files: List[str] = []
        for p in patterns:
            files.extend(sorted(glob.glob(p)))
    else:
        files = sorted(glob.glob(path_or_glob))

    if not files:
        # Fallback: generate blank frames using numpy if no files found
        import numpy as np
        import cv2
        while True:
            img = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(img, 'Demo - No Images Found', (30, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255,255,255), 2)
            yield img
            time.sleep(1.0 / max(fps, 1.0))

    delay = 1.0 / max(fps, 1.0)
    idx = 0
    import cv2
    while True:
        img = cv2.imread(files[idx % len(files)])
        if img is None:
            # Skip unreadable files
            idx += 1
            if idx >= len(files) and not loop:
                break
            time.sleep(delay)
            continue
        yield img
        time.sleep(delay)
        idx += 1
        if idx >= len(files) and not loop:
            break
