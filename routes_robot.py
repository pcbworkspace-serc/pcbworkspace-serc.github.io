"""
Flask blueprints: HTTP routes for the robot and cameras.

Mount in flask_server.py with:

    from routes_robot import bp as robot_bp, camera_bp
    app.register_blueprint(robot_bp)
    app.register_blueprint(camera_bp)

All routes are protected by Supabase JWT auth (see auth_middleware.py).
Set SERC_AUTH_DISABLED=1 to disable for local development only.

Mutex `_arm_lock` serializes motion commands across concurrent HTTP workers.
"""
from __future__ import annotations

import re
import threading
from typing import Optional

from flask import Blueprint, Response, g, jsonify, request

import config
import kinematics
from auth_middleware import require_auth
from camera import get_camera
from robot_control import get_robot, get_calibration


bp = Blueprint("robot", __name__, url_prefix="/robot")
camera_bp = Blueprint("camera", __name__, url_prefix="/camera")
_arm_lock = threading.Lock()


# ── Camera routes ───────────────────────────────────────────────────────────
@camera_bp.get("/<name>/frame")
@require_auth
def camera_frame(name: str):
    """Single JPEG snapshot. Used by calibration to get a still that the
    backend will see byte-identically when running vision."""
    try:
        cam = get_camera(name)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404
    jpg = cam.get_jpeg()
    if jpg is None:
        return jsonify({"ok": False, "error": "no frame yet"}), 503
    return Response(jpg, mimetype="image/jpeg")


@camera_bp.get("/<name>/stream")
@require_auth
def camera_stream(name: str):
    """MJPEG stream. Drop into <img src=...> in the browser."""
    try:
        cam = get_camera(name)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 404

    def gen():
        import time as _t
        while True:
            jpg = cam.get_jpeg()
            if jpg is not None:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n"
                       b"Content-Length: " + str(len(jpg)).encode() + b"\r\n\r\n"
                       + jpg + b"\r\n")
            _t.sleep(1.0 / 30.0)

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")


# ── Status & control ────────────────────────────────────────────────────────
@bp.get("/status")
@require_auth
def status():
    arm = get_robot()
    cal = get_calibration()
    arm.request_status()
    # Compute current nozzle XYZ from joint angles via forward kinematics so
    # the calibration wizard can capture (pcb_mm, robot_xyz) pairs directly.
    try:
        cur_xyz = list(kinematics.fk(*arm.state.joints_deg))
    except Exception:
        cur_xyz = None
    return jsonify({
        "connected": arm.state.connected,
        "estopped": arm.state.estopped,
        "moving": arm.state.moving,
        "joints_deg": list(arm.state.joints_deg),
        "current_xyz": cur_xyz,
        "encoders": arm.state.encoders_deg,
        "last_event": arm.state.last_event,
        "calibrated": {
            "camera": cal.H_cam_to_pcb is not None,
            "workspace": cal.T_pcb_to_robot is not None,
        },
        "config": {
            "L1": config.L1_MM, "L2": config.L2_MM,
            "shoulder_h": config.SHOULDER_HEIGHT_MM,
            "nozzle_offset": config.NOZZLE_OFFSET_MM,
        },
    })


@bp.post("/estop")
@require_auth
def estop():
    get_robot().estop()
    return jsonify({"ok": True, "estopped": True})


@bp.post("/reset")
@require_auth
def reset():
    get_robot().reset()
    return jsonify({"ok": True, "estopped": False})


@bp.post("/home")
@require_auth
def home():
    arm = get_robot()
    with _arm_lock:
        try:
            arm.home()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 500


# ── Direct motion (structured commands) ─────────────────────────────────────
@bp.post("/command")
@require_auth
def command():
    """
    Accepts EITHER:
      {"cmd": "move",  "x": 200, "y": 0, "z": 30, "wrist": 0}
      {"cmd": "joints", "angles": [b, s, e, w]}
      {"cmd": "vacuum", "on": true}
      {"cmd": "pick",  "x": ..., "y": ..., "z": ...}
      {"cmd": "place", "x": ..., "y": ..., "z": ..., "wrist": 0}
      {"cmd": "home"}
      {"cmd": "estop"}  / {"cmd": "reset"}

    Returns {"ok": true, "result": ...} or {"ok": false, "error": ...}.
    """
    data = request.get_json(silent=True) or {}
    cmd = data.get("cmd", "")
    arm = get_robot()
    try:
        with _arm_lock:
            if cmd == "move":
                angles = arm.move_to(
                    float(data["x"]), float(data["y"]), float(data["z"]),
                    wrist_deg=float(data.get("wrist", 0.0)),
                )
                return jsonify({"ok": True, "result": {"joints_deg": list(angles)}})
            if cmd == "joints":
                arm.move_joints(*[float(a) for a in data["angles"]])
                return jsonify({"ok": True})
            if cmd == "vacuum":
                arm.vacuum(bool(data["on"]))
                return jsonify({"ok": True})
            if cmd == "pick":
                arm.pick_at(float(data["x"]), float(data["y"]), float(data["z"]))
                return jsonify({"ok": True})
            if cmd == "place":
                arm.place_at(
                    float(data["x"]), float(data["y"]), float(data["z"]),
                    wrist_deg=float(data.get("wrist", 0.0)),
                )
                return jsonify({"ok": True})
            if cmd == "home":  arm.home();  return jsonify({"ok": True})
            if cmd == "estop": arm.estop(); return jsonify({"ok": True})
            if cmd == "reset": arm.reset(); return jsonify({"ok": True})
        return jsonify({"ok": False, "error": f"unknown cmd '{cmd}'"}), 400
    except (kinematics.IKError, KeyError, ValueError) as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# ── Chat command parser (structured first, NL to be added later) ────────────
# Grammar:  one statement per line. Blank lines and `# comments` ignored.
#   home
#   estop / reset
#   move <x> <y> <z>             -- mm in robot base frame
#   move <x> <y> <z> w=<deg>     -- with wrist rotation
#   joints <b> <s> <e> <w>       -- absolute joint angles in degrees
#   vacuum on / vacuum off
#   pick  <x> <y> <z>            -- approach-down-suck-retract at robot xyz
#   place <x> <y> <z> [w=<deg>]
#   place_pcb <x_pcb> <y_pcb> [w=<deg>]   -- coords in PCB-local mm; needs calibration
#   wait <ms>
#
# Multiple statements can be separated by ';' or newlines. Returns a list of
# {"line": str, "ok": bool, "error": str|None} for each parsed instruction.

_NUM = r"-?\d+(?:\.\d+)?"
_TOKEN_RE = re.compile(rf"({_NUM})|w=({_NUM})|(\w+)|on|off|;|\n", re.I)


def _split_statements(text: str):
    for chunk in re.split(r"[;\n]+", text):
        s = chunk.split("#", 1)[0].strip()
        if s:
            yield s


def _parse_one(stmt: str) -> dict:
    """Returns a structured-command dict (same shape /robot/command takes), or
    raises ValueError."""
    parts = stmt.split()
    if not parts:
        raise ValueError("empty")
    op = parts[0].lower()
    rest = parts[1:]

    def _nums(n):
        try:
            return [float(x) for x in rest[:n]]
        except ValueError:
            raise ValueError(f"{op}: expected {n} numbers")

    def _wrist():
        for tok in rest:
            m = re.match(rf"w=({_NUM})$", tok)
            if m: return float(m.group(1))
        return 0.0

    if op == "home":   return {"cmd": "home"}
    if op == "estop":  return {"cmd": "estop"}
    if op == "reset":  return {"cmd": "reset"}
    if op == "vacuum":
        if not rest or rest[0].lower() not in ("on", "off"):
            raise ValueError("vacuum: expected on/off")
        return {"cmd": "vacuum", "on": rest[0].lower() == "on"}
    if op == "move":
        x, y, z = _nums(3)
        return {"cmd": "move", "x": x, "y": y, "z": z, "wrist": _wrist()}
    if op == "joints":
        b, s, e, w = _nums(4)
        return {"cmd": "joints", "angles": [b, s, e, w]}
    if op == "pick":
        x, y, z = _nums(3)
        return {"cmd": "pick", "x": x, "y": y, "z": z}
    if op == "place":
        x, y, z = _nums(3)
        return {"cmd": "place", "x": x, "y": y, "z": z, "wrist": _wrist()}
    if op == "place_pcb":
        x, y = _nums(2)
        return {"cmd": "_place_pcb", "x_pcb": x, "y_pcb": y, "wrist": _wrist()}
    if op == "wait":
        ms = _nums(1)[0]
        return {"cmd": "_wait", "ms": ms}
    raise ValueError(f"unknown op '{op}'")


@bp.post("/chat")
@require_auth
def chat():
    """
    Accepts {"text": "...arbitrary command script..."} and executes each line
    in order, stopping on first error.

    Each line is first tried as a structured command (the grammar above). If
    parsing fails AND nl=true (default), we ask an LLM to translate the line
    into structured commands and parse the result. The LLM may emit multiple
    commands for one NL utterance ("pick the resistor and put it at 25,15"
    -> "pick 50 -120 12.5 / place_pcb 25 15"). Set nl=false to disable.
    """
    import time as _time
    body = request.get_json(silent=True) or {}
    text = body.get("text", "")
    use_nl = body.get("nl", True)
    arm = get_robot()
    cal = get_calibration()
    out = []

    def _execute(parsed: dict, original_line: str) -> dict:
        entry = {"line": original_line, "ok": False, "error": None, "result": None}
        cmd = parsed["cmd"]
        try:
            with _arm_lock:
                if cmd == "_wait":
                    _time.sleep(parsed["ms"] / 1000.0)
                elif cmd == "_place_pcb":
                    x, y, z = cal.pcb_to_robot(parsed["x_pcb"], parsed["y_pcb"])
                    arm.place_at(x, y, z, wrist_deg=parsed["wrist"])
                    entry["result"] = {"robot_xyz": [x, y, z]}
                elif cmd == "move":
                    angles = arm.move_to(parsed["x"], parsed["y"], parsed["z"],
                                         wrist_deg=parsed["wrist"])
                    entry["result"] = {"joints_deg": list(angles)}
                elif cmd == "joints":   arm.move_joints(*parsed["angles"])
                elif cmd == "vacuum":   arm.vacuum(parsed["on"])
                elif cmd == "pick":     arm.pick_at(parsed["x"], parsed["y"], parsed["z"])
                elif cmd == "place":    arm.place_at(parsed["x"], parsed["y"], parsed["z"],
                                                    wrist_deg=parsed["wrist"])
                elif cmd == "home":     arm.home()
                elif cmd == "estop":    arm.estop()
                elif cmd == "reset":    arm.reset()
            entry["ok"] = True
        except Exception as e:
            entry["error"] = str(e)
        return entry

    for stmt in _split_statements(text):
        parse_err = None
        try:
            parsed = _parse_one(stmt)
            entry = _execute(parsed, stmt)
            out.append(entry)
            if not entry["ok"]:
                break
            continue
        except ValueError as e:
            parse_err = str(e)

        # Structured parse failed. Try NL translation if enabled.
        if not use_nl:
            out.append({"line": stmt, "ok": False, "error": parse_err, "result": None})
            break

        translated = _nl_to_structured(stmt)
        if not translated:
            out.append({"line": stmt, "ok": False,
                        "error": f"could not parse or translate: {parse_err}",
                        "result": None})
            break

        # The LLM may emit multiple structured lines; run them in order.
        nl_halt = False
        for sub in translated:
            try:
                parsed = _parse_one(sub)
            except ValueError as e:
                out.append({"line": f"{stmt}  -> {sub}", "ok": False,
                            "error": f"NL produced bad command: {e}", "result": None})
                nl_halt = True
                break
            entry = _execute(parsed, f"{stmt}  -> {sub}")
            out.append(entry)
            if not entry["ok"]:
                nl_halt = True
                break
        if nl_halt:
            break

    return jsonify({"executed": out, "halted_on_error": any(not e["ok"] for e in out)})


# ── NL → structured translation ─────────────────────────────────────────────
# We reuse whatever LLM the existing /chat stub will eventually be wired to.
# For now, _nl_to_structured() ships with two implementations: an
# OpenAI-compatible client (works for OpenAI, Anthropic via OpenAI shim, vLLM,
# Ollama, anything that speaks the chat-completions API) controlled by env
# vars, plus a tiny rule-based fallback for the most common phrasings so the
# system has SOMETHING to do without an API key.
#
# Wire your real LLM in by setting:
#     SERC_LLM_URL    = http://localhost:11434/v1/chat/completions   (Ollama)
#     SERC_LLM_KEY    = <your key, blank for local servers>
#     SERC_LLM_MODEL  = llama3.1:8b   (or gpt-4o-mini, etc.)
import os as _os

_NL_SYSTEM_PROMPT = """You translate natural-language pick-and-place robot \
commands into a strict, structured command language. Output ONLY commands, \
one per line, no prose, no code fences, no explanation.

Available commands:
  home
  estop
  reset
  move X Y Z [w=DEG]            -- mm in robot base frame, optional wrist deg
  joints B S E W                -- absolute joint angles in degrees
  vacuum on | vacuum off
  pick X Y Z                    -- approach + suck + retract at robot xyz
  place X Y Z [w=DEG]           -- approach + release at robot xyz
  place_pcb X_PCB Y_PCB [w=DEG] -- coords in PCB-local mm; uses calibration
  wait MS

Rules:
- If the user references a feeder, pick at the feeder coordinates they give \
you, otherwise refuse with a single line: # need feeder coordinates
- If the user references a PCB position by feature ("top-left pad", \
"resistor R3"), refuse with a single line: # need PCB coordinates
- Coordinates the user says like "the part" or "there" without numbers are \
ambiguous; refuse the same way.
- Keep output minimal. One semantic action = one structured line, except \
pick-and-place which is two lines."""


def _nl_to_structured(line: str):
    """Returns a list of structured-command strings, or None on failure."""
    url = _os.environ.get("SERC_LLM_URL")
    key = _os.environ.get("SERC_LLM_KEY", "")
    model = _os.environ.get("SERC_LLM_MODEL", "gpt-4o-mini")

    if url:
        try:
            import urllib.request, json as _json
            req = urllib.request.Request(
                url,
                data=_json.dumps({
                    "model": model,
                    "temperature": 0,
                    "messages": [
                        {"role": "system", "content": _NL_SYSTEM_PROMPT},
                        {"role": "user", "content": line},
                    ],
                }).encode(),
                headers={"Content-Type": "application/json",
                         **({"Authorization": f"Bearer {key}"} if key else {})},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                data = _json.loads(r.read())
            content = data["choices"][0]["message"]["content"].strip()
            # Strip code fences if the model added them anyway.
            content = re.sub(r"^```[a-z]*\n|\n```$", "", content, flags=re.M)
            cmds = [c.strip() for c in content.splitlines()
                    if c.strip() and not c.strip().startswith("#")]
            return cmds or None
        except Exception:
            pass  # fall through to rule-based

    # Rule-based fallback for the simplest cases. Catches enough common
    # phrasings to be useful without a real LLM in the loop.
    s = line.lower().strip()
    if re.search(r"\b(home|go home|return home)\b", s):
        return ["home"]
    if re.search(r"\b(stop|halt|emergency|e[- ]?stop)\b", s):
        return ["estop"]
    if re.search(r"\b(reset|clear estop|resume)\b", s):
        return ["reset"]
    if re.search(r"\b(suck|grab|grip|vacuum on|pump on|turn on vacuum)\b", s):
        return ["vacuum on"]
    if re.search(r"\b(release|drop|let go|vacuum off|pump off|turn off vacuum)\b", s):
        return ["vacuum off"]

    # Patterns like "move to 200 0 30" or "go to (150, -50, 80)".
    m = re.search(r"(?:move|go)(?:\s+to)?\s*\(?\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)\s*,?\s*(-?\d+\.?\d*)", s)
    if m: return [f"move {m.group(1)} {m.group(2)} {m.group(3)}"]

    # Patterns like "place at pcb 25 15" or "drop at 25, 15".
    m = re.search(r"(?:place|drop|put)(?:\s+(?:at|on))?(?:\s+pcb)?\s*\(?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)", s)
    if m: return [f"place_pcb {m.group(1)} {m.group(2)}"]

    return None


# ── Calibration ─────────────────────────────────────────────────────────────
@bp.post("/calibrate/camera")
@require_auth
def calibrate_camera():
    """
    Body: {"pixel_pts": [[u1,v1],...], "pcb_pts": [[x1,y1],...]}
    """
    data = request.get_json(silent=True) or {}
    try:
        get_calibration().calibrate_camera(data["pixel_pts"], data["pcb_pts"])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


@bp.post("/calibrate/workspace")
@require_auth
def calibrate_workspace():
    """
    Body: {"pcb_pts": [[x_pcb,y_pcb],...], "robot_pts": [[xr,yr,zr],...]}
    The user typically jogs the nozzle to each PCB point and the frontend
    captures the current robot xyz from /robot/status.
    """
    data = request.get_json(silent=True) or {}
    try:
        get_calibration().calibrate_workspace(data["pcb_pts"], data["robot_pts"])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


# ── The drag-drop endpoint: place at a 3D PCB coordinate ────────────────────
@bp.post("/place_at")
@require_auth
def place_at():
    """
    Frontend drags a component onto the 3D PCB view at PCB-local (x_pcb, y_pcb)
    in millimeters. We resolve the full pipeline:
        PCB-mm -> robot-mm (via workspace calibration)
        -> IK -> joint move with vacuum release sequence.

    Body: {"x_pcb": 25.0, "y_pcb": 15.0, "wrist": 0.0,
           "pick_from": {"x": ..., "y": ..., "z": ...}}   # optional source
    """
    data = request.get_json(silent=True) or {}
    arm = get_robot()
    cal = get_calibration()
    try:
        with _arm_lock:
            x_r, y_r, z_r = cal.pcb_to_robot(float(data["x_pcb"]), float(data["y_pcb"]))
            if "pick_from" in data:
                src = data["pick_from"]
                arm.pick_at(float(src["x"]), float(src["y"]), float(src["z"]))
            arm.place_at(x_r, y_r, z_r, wrist_deg=float(data.get("wrist", 0.0)))
        return jsonify({"ok": True, "robot_xyz": [x_r, y_r, z_r]})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400
