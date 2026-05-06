"""
Camera capture module.

Owns up to N USB cameras and exposes thread-safe access to the latest frame.
Each camera runs in its own grab thread that pulls frames continuously, so
HTTP handlers (MJPEG stream, single-frame fetch) and the vision pipeline
can read the latest frame without blocking each other or fighting for the
device handle.

Camera IDs:
  0 -> top camera   (PCB fiducial alignment, calibration source)
  1 -> bottom camera (nozzle correction, part rotation alignment)

Set via env vars or by editing config.py:
  SERC_CAM_TOP_INDEX     (default 0)
  SERC_CAM_BOTTOM_INDEX  (default 1)
  SERC_CAM_WIDTH         (default 1280)
  SERC_CAM_HEIGHT        (default 720)
"""
from __future__ import annotations

import os
import threading
import time
from typing import Dict, Optional

import numpy as np


# ── Configuration ───────────────────────────────────────────────────────────
CAM_INDICES = {
    "top":    int(os.environ.get("SERC_CAM_TOP_INDEX", 0)),
    "bottom": int(os.environ.get("SERC_CAM_BOTTOM_INDEX", 1)),
}
CAM_W = int(os.environ.get("SERC_CAM_WIDTH",  1280))
CAM_H = int(os.environ.get("SERC_CAM_HEIGHT", 720))
JPEG_QUALITY = int(os.environ.get("SERC_JPEG_QUALITY", 75))


class _CameraGrabber:
    """Continuously pulls frames from one OpenCV VideoCapture device.
    Latest frame is held under a lock for fast reads. If the device fails to
    open, the grabber serves a placeholder image so the rest of the app
    keeps working without hardware."""
    def __init__(self, name: str, device_index: int):
        self.name = name
        self.device_index = device_index
        self._lock = threading.Lock()
        self._latest: Optional[bytes] = None      # encoded JPEG
        self._latest_raw: Optional[np.ndarray] = None
        self._stop = threading.Event()
        self._available = False
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _placeholder(self, msg: str) -> np.ndarray:
        # Solid dark frame with a label so the UI shows SOMETHING.
        img = np.zeros((CAM_H, CAM_W, 3), dtype=np.uint8)
        img[:] = (24, 24, 32)
        try:
            import cv2
            cv2.putText(img, f"{self.name.upper()}: {msg}",
                        (40, CAM_H // 2), cv2.FONT_HERSHEY_SIMPLEX,
                        1.2, (200, 200, 220), 2, cv2.LINE_AA)
        except Exception:
            pass
        return img

    def _encode(self, frame: np.ndarray) -> Optional[bytes]:
        try:
            import cv2
            ok, buf = cv2.imencode(".jpg", frame,
                                   [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
            return buf.tobytes() if ok else None
        except Exception:
            return None

    def _loop(self):
        try:
            import cv2
        except ImportError:
            # No OpenCV; serve a static placeholder forever.
            ph = self._placeholder("OpenCV not installed")
            jpg = self._encode(ph)
            with self._lock:
                self._latest_raw = ph
                self._latest = jpg
            return

        cap = cv2.VideoCapture(self.device_index)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  CAM_W)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAM_H)

        if not cap.isOpened():
            # Device doesn't exist or permission denied; static placeholder.
            ph = self._placeholder(f"camera {self.device_index} not available")
            jpg = self._encode(ph)
            with self._lock:
                self._latest_raw = ph
                self._latest = jpg
            return

        self._available = True
        target_dt = 1.0 / 30.0
        while not self._stop.is_set():
            t0 = time.time()
            ok, frame = cap.read()
            if not ok or frame is None:
                # Device dropped; sleep briefly and retry.
                time.sleep(0.05)
                continue
            jpg = self._encode(frame)
            with self._lock:
                self._latest_raw = frame
                self._latest = jpg
            elapsed = time.time() - t0
            if elapsed < target_dt:
                time.sleep(target_dt - elapsed)
        cap.release()

    # ---- public read API ----
    def get_jpeg(self) -> Optional[bytes]:
        with self._lock:
            return self._latest

    def get_raw(self) -> Optional[np.ndarray]:
        """Returns a COPY of the latest BGR frame. Safe to mutate."""
        with self._lock:
            return None if self._latest_raw is None else self._latest_raw.copy()

    def is_available(self) -> bool:
        return self._available

    def stop(self):
        self._stop.set()


# ── Module-level registry of open cameras ───────────────────────────────────
_cameras: Dict[str, _CameraGrabber] = {}
_cameras_lock = threading.Lock()


def get_camera(name: str) -> _CameraGrabber:
    """Lazy-init each named camera on first use."""
    with _cameras_lock:
        if name not in _cameras:
            if name not in CAM_INDICES:
                raise ValueError(f"unknown camera '{name}'; "
                                 f"valid: {list(CAM_INDICES.keys())}")
            _cameras[name] = _CameraGrabber(name, CAM_INDICES[name])
        return _cameras[name]


def shutdown_all():
    with _cameras_lock:
        for c in _cameras.values():
            c.stop()
        _cameras.clear()
