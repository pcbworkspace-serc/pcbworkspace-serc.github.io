"""
Robot control module.

Owns:
  - The serial connection to the ESP32 (line-delimited JSON @ 115200).
  - High-level pick / place primitives that combine motion + vacuum + vision.
  - Camera-to-PCB and PCB-to-robot coordinate transforms (see CALIBRATION.md).

This module is intentionally NOT thread-safe at the public API level. Wrap
calls in a single threading.Lock at the Flask layer if multiple HTTP workers
might hit the arm simultaneously.
"""
from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field
from queue import Queue, Empty
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

import config
import kinematics


# ── Serial transport ────────────────────────────────────────────────────────
class _SerialStub:
    """Stand-in for a real serial port when pyserial isn't installed or no
    hardware is attached. Lets the rest of the stack run for development."""
    def __init__(self):
        self._buf: List[str] = []
        # Pretend the firmware just booted.
        self._buf.append('{"event":"ready","fw":"stub"}\n')

    def write(self, b: bytes) -> int:
        try:
            msg = json.loads(b.decode().strip())
        except Exception:
            return len(b)
        cmd = msg.get("cmd")
        cid = msg.get("id", 0)
        # Echo a synthetic ack and a synthetic "done" for moves.
        self._buf.append(json.dumps({"ack": cid, "ok": True}) + "\n")
        if cmd in ("move", "home"):
            self._buf.append(json.dumps({"event": "done"}) + "\n")
        elif cmd == "status":
            self._buf.append(json.dumps({
                "status": {"estop": False, "moving": False,
                           "joints_deg": [0, 0, 0, 0],
                           "encoders": {"base": 0.0, "shoulder": 0.0},
                           "stallguard": {"base": 200, "shoulder": 200,
                                          "elbow": 200, "wrist": 200}}
            }) + "\n")
        return len(b)

    def readline(self) -> bytes:
        return self._buf.pop(0).encode() if self._buf else b""

    def close(self):
        pass


def _open_serial(port: str, baud: int):
    try:
        import serial
        return serial.Serial(port, baud, timeout=config.SERIAL_TIMEOUT)
    except Exception as e:
        print(f"[robot] serial open failed ({e}); using stub")
        return _SerialStub()


# ── Robot driver ────────────────────────────────────────────────────────────
@dataclass
class RobotState:
    connected: bool = False
    estopped: bool = False
    moving: bool = False
    joints_deg: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
    encoders_deg: Dict[str, float] = field(default_factory=dict)
    last_event: Optional[str] = None
    last_error: Optional[str] = None


class Robot:
    def __init__(self, port: Optional[str] = None, baud: int = config.SERIAL_BAUD):
        self.port = port or config.SERIAL_PORT
        self.baud = baud
        self._ser = _open_serial(self.port, self.baud)
        self.state = RobotState(connected=True)
        self._cmd_id = 0
        self._lock = threading.Lock()
        self._pending_done: Optional[threading.Event] = None
        self._listeners: List[Callable[[dict], None]] = []
        # Start a background thread that pulls lines off the serial port and
        # routes them to event handlers / the pending-done event.
        self._stop = threading.Event()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

    # ---- low-level send/recv ----
    def _send(self, msg: dict) -> int:
        with self._lock:
            self._cmd_id += 1
            msg["id"] = self._cmd_id
            line = (json.dumps(msg) + "\n").encode()
            self._ser.write(line)
            return self._cmd_id

    def _read_loop(self):
        while not self._stop.is_set():
            try:
                line = self._ser.readline()
            except Exception:
                time.sleep(0.05)
                continue
            if not line:
                time.sleep(0.005)
                continue
            try:
                msg = json.loads(line.decode().strip())
            except Exception:
                continue
            self._handle(msg)

    def _handle(self, msg: dict):
        ev = msg.get("event")
        if ev == "done":
            self.state.moving = False
            self.state.last_event = "done"
            if self._pending_done:
                self._pending_done.set()
        elif ev == "stall":
            self.state.estopped = True
            self.state.last_event = f"stall:{msg.get('axis')}"
        elif ev == "estop":
            self.state.estopped = True
            self.state.last_event = f"estop:{msg.get('reason')}"
        elif ev == "ready":
            self.state.last_event = "ready"
        elif "status" in msg:
            s = msg["status"]
            self.state.estopped = s.get("estop", False)
            self.state.moving = s.get("moving", False)
            self.state.joints_deg = tuple(s.get("joints_deg", (0, 0, 0, 0)))
            self.state.encoders_deg = s.get("encoders", {})
        elif "error" in msg:
            self.state.last_error = msg["error"]
        for fn in self._listeners:
            try: fn(msg)
            except Exception: pass

    def add_listener(self, fn: Callable[[dict], None]):
        self._listeners.append(fn)

    # ---- high-level commands ----
    def home(self, wait: bool = True, timeout: float = 30.0) -> None:
        self._pending_done = threading.Event()
        self._send({"cmd": "home"})
        self.state.moving = True
        if wait:
            if not self._pending_done.wait(timeout):
                raise TimeoutError("home timed out")
        self._pending_done = None

    def move_joints(self, theta_b: float, theta_s: float, theta_e: float,
                    theta_w: float = 0.0, wait: bool = True,
                    timeout: float = 15.0) -> None:
        if self.state.estopped:
            raise RuntimeError("robot is estopped; call reset() first")
        self._pending_done = threading.Event()
        self._send({"cmd": "move", "j": [theta_b, theta_s, theta_e, theta_w]})
        self.state.moving = True
        if wait:
            if not self._pending_done.wait(timeout):
                raise TimeoutError("move timed out")
            time.sleep(config.PICK_PLACE_SETTLE_MS / 1000.0)
        self._pending_done = None

    def move_to(self, x: float, y: float, z: float, wrist_deg: float = 0.0,
                wait: bool = True) -> Tuple[float, float, float, float]:
        """Move the nozzle tip to (x, y, z) in the robot base frame."""
        angles = kinematics.ik_xyz(x, y, z, wrist_deg=wrist_deg)
        self.move_joints(*angles, wait=wait)
        return angles

    def vacuum(self, on: bool) -> None:
        self._send({"cmd": "vacuum", "on": on})

    def estop(self) -> None:
        self._send({"cmd": "estop"})
        self.state.estopped = True

    def reset(self) -> None:
        self._send({"cmd": "reset"})
        self.state.estopped = False

    def request_status(self) -> RobotState:
        self._send({"cmd": "status"})
        time.sleep(0.05)   # give reader thread a moment to consume reply
        return self.state

    # ---- pick & place primitives ----
    def pick_at(self, x: float, y: float, board_z: float,
                approach_height: float = 30.0,
                pick_depth: float = config.DEFAULT_PICK_DEPTH_MM) -> None:
        """Lower onto (x,y,board_z), suck, retract."""
        self.move_to(x, y, board_z + approach_height)
        self.move_to(x, y, board_z - pick_depth)
        self.vacuum(True)
        time.sleep(0.15)
        self.move_to(x, y, board_z + approach_height)

    def place_at(self, x: float, y: float, board_z: float, wrist_deg: float = 0.0,
                 approach_height: float = 30.0,
                 place_depth: float = config.DEFAULT_PLACE_DEPTH_MM) -> None:
        """Carry the part to (x,y,board_z), wrist-rotate, lower, release, retract."""
        self.move_to(x, y, board_z + approach_height, wrist_deg=wrist_deg)
        self.move_to(x, y, board_z - place_depth, wrist_deg=wrist_deg)
        self.vacuum(False)
        time.sleep(0.15)
        self.move_to(x, y, board_z + approach_height, wrist_deg=wrist_deg)

    def shutdown(self):
        self._stop.set()
        try: self._ser.close()
        except Exception: pass


# ── Coordinate transforms ───────────────────────────────────────────────────
# We maintain TWO calibrations:
#
#   1. camera_to_pcb (3x3 homography): top-camera image pixels -> PCB-local mm.
#      The "PCB-local" frame is what the user sees in the 3D PCB view: its
#      origin is the bottom-left corner of the PCB, X+ to the right, Y+ up.
#      Built from 4 point correspondences (pcb corners or fiducials).
#
#   2. pcb_to_robot (4x4 affine): PCB-local mm + Z=0-board-surface -> robot base
#      frame mm. Built by manually jogging the nozzle to 3+ known PCB points
#      and recording (pcb_xy, robot_xyz) pairs. We solve for translation +
#      rotation in the XY plane plus a board-surface Z height.
#
# Together: pixel -> PCB-mm -> robot-mm. A drop on the 3D view goes through
# both transforms before reaching the arm.

class Calibration:
    def __init__(self):
        d = config.load_calibration()
        self.H_cam_to_pcb: Optional[np.ndarray] = (
            np.array(d["camera_to_pcb"]) if d.get("camera_to_pcb") is not None else None
        )
        self.T_pcb_to_robot: Optional[np.ndarray] = (
            np.array(d["pcb_to_robot"]) if d.get("pcb_to_robot") is not None else None
        )

    def save(self):
        config.save_calibration({
            "camera_to_pcb": self.H_cam_to_pcb.tolist() if self.H_cam_to_pcb is not None else None,
            "pcb_to_robot": self.T_pcb_to_robot.tolist() if self.T_pcb_to_robot is not None else None,
        })

    # ---- camera <-> PCB ----
    def calibrate_camera(self, pixel_pts: List[Tuple[float, float]],
                         pcb_pts: List[Tuple[float, float]]) -> None:
        """
        pixel_pts: 4+ points in camera image, pixel coords (u, v).
        pcb_pts:   the same 4+ points in PCB-local coords, mm (x_pcb, y_pcb).
                   E.g. the four corners of the PCB at (0,0), (W,0), (W,H), (0,H).
        """
        if len(pixel_pts) != len(pcb_pts) or len(pixel_pts) < 4:
            raise ValueError("need at least 4 matched point pairs")
        try:
            import cv2
        except ImportError:
            raise RuntimeError("OpenCV required for camera calibration")
        src = np.array(pixel_pts, dtype=np.float32)
        dst = np.array(pcb_pts, dtype=np.float32)
        H, _ = cv2.findHomography(src, dst, method=cv2.RANSAC, ransacReprojThreshold=2.0)
        if H is None:
            raise RuntimeError("homography fit failed")
        self.H_cam_to_pcb = H
        self.save()

    def camera_to_pcb(self, u: float, v: float) -> Tuple[float, float]:
        if self.H_cam_to_pcb is None:
            raise RuntimeError("camera not calibrated")
        p = self.H_cam_to_pcb @ np.array([u, v, 1.0])
        return (float(p[0] / p[2]), float(p[1] / p[2]))

    # ---- PCB <-> robot ----
    def calibrate_workspace(self,
                            pcb_pts: List[Tuple[float, float]],
                            robot_pts: List[Tuple[float, float, float]]) -> None:
        """
        pcb_pts:   3+ points in PCB-local mm.
        robot_pts: the SAME points expressed in robot base-frame mm, recorded
                   by jogging the nozzle to each PCB point.

        Solves for a 2D rigid transform (rotation + translation) in the XY
        plane plus an average Z = the board surface height. PCB Z is assumed
        flat. If you need per-point Z (e.g. a tilted board), expand this
        to a full 3D affine.
        """
        if len(pcb_pts) != len(robot_pts) or len(pcb_pts) < 3:
            raise ValueError("need at least 3 matched point pairs")
        src = np.array(pcb_pts, dtype=np.float64)
        dst_xy = np.array([(p[0], p[1]) for p in robot_pts], dtype=np.float64)
        z_board = float(np.mean([p[2] for p in robot_pts]))

        # Kabsch / Procrustes: rigid 2D transform.
        sc = src.mean(axis=0)
        dc = dst_xy.mean(axis=0)
        S = src - sc
        D = dst_xy - dc
        U, _, Vt = np.linalg.svd(S.T @ D)
        R = (U @ Vt).T
        # Ensure right-handed (no reflection).
        if np.linalg.det(R) < 0:
            Vt[-1, :] *= -1
            R = (U @ Vt).T
        t = dc - R @ sc

        # Pack into a 4x4 affine: [R 0 tx; 0 0 1 z_board; 0 0 0 1] style.
        T = np.eye(4)
        T[0, 0], T[0, 1] = R[0, 0], R[0, 1]
        T[1, 0], T[1, 1] = R[1, 0], R[1, 1]
        T[0, 3] = t[0]
        T[1, 3] = t[1]
        T[2, 3] = z_board
        self.T_pcb_to_robot = T
        self.save()

    def pcb_to_robot(self, x_pcb: float, y_pcb: float,
                     z_offset: float = 0.0) -> Tuple[float, float, float]:
        if self.T_pcb_to_robot is None:
            raise RuntimeError("workspace not calibrated")
        v = np.array([x_pcb, y_pcb, 0.0, 1.0])
        r = self.T_pcb_to_robot @ v
        return (float(r[0]), float(r[1]), float(r[2]) + z_offset)

    # ---- end-to-end ----
    def camera_pixel_to_robot(self, u: float, v: float, z_offset: float = 0.0) -> Tuple[float, float, float]:
        x_pcb, y_pcb = self.camera_to_pcb(u, v)
        return self.pcb_to_robot(x_pcb, y_pcb, z_offset)


# ── Module-level singletons ─────────────────────────────────────────────────
_robot: Optional[Robot] = None
_calib: Optional[Calibration] = None


def get_robot() -> Robot:
    global _robot
    if _robot is None:
        _robot = Robot()
    return _robot


def get_calibration() -> Calibration:
    global _calib
    if _calib is None:
        _calib = Calibration()
    return _calib
