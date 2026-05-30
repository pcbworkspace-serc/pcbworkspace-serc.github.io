# ── Calibration ───────────────────────────────────────────────────────────────
# Drop this into flask_server.py after the existing /nn/items/state route.
# Stores a 3x3 homography mapping camera pixels -> PCB millimeters.
# Frontend CalibrationModal posts 4 pixel<->world point pairs; we compute
# the homography with OpenCV and persist it to disk so it survives restarts.

import json
import os
import numpy as np

CALIBRATION_PATH = "calibration.json"
_calibration_lock = threading.Lock()

def _load_saved_calibration():
    """Load homography from disk on import (so restart preserves it)."""
    try:
        with open(CALIBRATION_PATH, "r") as f:
            return json.load(f).get("homography")
    except (FileNotFoundError, json.JSONDecodeError):
        return None

_saved_homography = _load_saved_calibration()


@app.route("/calibration/save", methods=["POST"])
def calibration_save():
    """
    Compute a 3x3 homography from 4 corresponding point pairs.
    Body: { "pixel_points": [[x,y], ...4 pts...], "world_points": [[mm,mm], ...4 pts...] }
    """
    global _saved_homography
    if not CV2_AVAILABLE:
        return jsonify({"error": "OpenCV not installed"}), 503

    data = request.get_json() or {}
    pixel_pts = data.get("pixel_points")
    world_pts = data.get("world_points")

    if not pixel_pts or not world_pts or len(pixel_pts) != len(world_pts):
        return jsonify({"error": "Need matching pixel_points and world_points"}), 400
    if len(pixel_pts) < 4:
        return jsonify({"error": "Need at least 4 point pairs"}), 400

    try:
        src = np.array(pixel_pts, dtype=np.float32)
        dst = np.array(world_pts, dtype=np.float32)
        H, _mask = cv2.findHomography(src, dst, method=0)  # exact for 4 pts
        if H is None:
            return jsonify({"error": "Homography computation failed (collinear points?)"}), 400

        H_list = H.tolist()
        with _calibration_lock:
            _saved_homography = H_list
            with open(CALIBRATION_PATH, "w") as f:
                json.dump({"homography": H_list, "point_count": len(pixel_pts)}, f)

        return jsonify({"ok": True, "homography": H_list})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/calibration/get")
def calibration_get():
    """Return the currently saved homography, or 404 if none."""
    with _calibration_lock:
        H = _saved_homography
    if H is None:
        return jsonify({"error": "No calibration saved"}), 404
    return jsonify({"homography": H})


@app.route("/calibration/clear", methods=["POST"])
def calibration_clear():
    """Forget the saved calibration (force re-calibration)."""
    global _saved_homography
    with _calibration_lock:
        _saved_homography = None
        try:
            os.remove(CALIBRATION_PATH)
        except (FileNotFoundError, OSError):
            pass
    return jsonify({"ok": True})


# ── Test from terminal ────────────────────────────────────────────────────────
# curl -X POST http://localhost:5000/calibration/save \
#   -H "Content-Type: application/json" \
#   -d '{"pixel_points":[[0,0],[640,0],[640,480],[0,480]],
#        "world_points":[[0,0],[62,0],[62,42],[0,42]]}'
#
# Should return {"ok": true, "homography": [[...], [...], [...]]}
# Then: curl http://localhost:5000/calibration/get
# Should return the same matrix.