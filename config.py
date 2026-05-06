"""
SERC arm configuration.
All physical dimensions in millimeters, angles in degrees.
Override these by editing this file or setting env vars.
"""
import os, json
from pathlib import Path

# ── Arm geometry (from REVISED_HARDWARE_SERC_UPDATED.docx) ───────────────────
# Lengths refer to the carbon-fiber tube segments between joint centers.
L1_MM = float(os.environ.get("SERC_L1", 150.0))   # shoulder -> elbow (inner arm)
L2_MM = float(os.environ.get("SERC_L2", 180.0))   # elbow    -> wrist (outer arm)

# Vertical offset from base mount surface to the shoulder joint axis.
# Includes the base bearing + shoulder bracket. Measure on your real arm.
SHOULDER_HEIGHT_MM = float(os.environ.get("SERC_SH_H", 60.0))

# Vertical offset from wrist joint to nozzle tip (vacuum head + Juki nozzle).
NOZZLE_OFFSET_MM = float(os.environ.get("SERC_NOZZLE", 35.0))

# ── Joint limits (degrees) ───────────────────────────────────────────────────
# Order: base, shoulder, elbow, wrist
JOINT_LIMITS_DEG = (
    (-180.0, 180.0),   # base: full rotation
    ( -10.0, 110.0),   # shoulder: just above horizontal to nearly vertical
    ( -10.0, 150.0),   # elbow: small overshoot to fully folded
    (-180.0, 180.0),   # wrist: free rotation for part alignment
)

# ── Workspace bounds (mm, in robot base frame) ───────────────────────────────
# Used to reject IK targets that are outside the safe envelope.
# X+ is forward of the base, Y+ is to the left, Z+ is up from baseplate.
WORKSPACE_BOUNDS = {
    "x": (50.0, L1_MM + L2_MM - 10.0),     # don't allow targets at full extension
    "y": (-(L1_MM + L2_MM - 10.0), L1_MM + L2_MM - 10.0),
    "z": (5.0, SHOULDER_HEIGHT_MM + L1_MM + L2_MM - 20.0),
}

# ── Motion settings ──────────────────────────────────────────────────────────
DEFAULT_SPEED_DEG_S = 60.0
PICK_PLACE_SETTLE_MS = 150         # per hardware doc
DEFAULT_PICK_DEPTH_MM = 2.0        # how far below the board surface to descend
DEFAULT_PLACE_DEPTH_MM = 1.0

# ── Serial settings ──────────────────────────────────────────────────────────
SERIAL_PORT = os.environ.get("SERC_SERIAL", "/dev/ttyUSB0")  # or COM3 on Windows
SERIAL_BAUD = 115200
SERIAL_TIMEOUT = 0.1                # seconds; non-blocking-ish reads

# ── Calibration storage ──────────────────────────────────────────────────────
# Two separate calibrations are persisted between runs:
#   1. camera_to_pcb:  3x3 homography mapping top-camera pixels -> PCB-local mm
#                      (the user's 3D PCB view uses PCB-local mm coordinates)
#   2. pcb_to_robot:   4x4 affine mapping PCB-local mm -> robot base frame mm
#                      (built by jogging the nozzle to 3+ known PCB points)
CALIB_PATH = Path(__file__).parent / "calibration.json"

def load_calibration() -> dict:
    if CALIB_PATH.exists():
        with open(CALIB_PATH) as f:
            return json.load(f)
    return {"camera_to_pcb": None, "pcb_to_robot": None}

def save_calibration(cal: dict) -> None:
    with open(CALIB_PATH, "w") as f:
        json.dump(cal, f, indent=2)
