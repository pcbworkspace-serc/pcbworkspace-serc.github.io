"""SERC local Flask API: JSON ESP32 driver and optional VLA planning."""
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from routes_robot import bp as robot_bp, camera_bp
from robot_control import get_robot

app = Flask(__name__)
CORS(app)
app.register_blueprint(robot_bp)
app.register_blueprint(camera_bp)

# ── Health / ping ─────────────────────────────────────────────────────────────
@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True})

@app.route("/health", methods=["GET"])
def health():
    try:
        arm_connected = get_robot().state.connected
        robot_error = None
    except Exception as e:
        arm_connected = False
        robot_error = str(e)
    return jsonify({
        "ok": True,
        "arm_connected": arm_connected,
        "simulation": os.environ.get("SERC_SIMULATION") == "1",
        "robot_error": robot_error,
    })

# ── Legacy placement endpoint ───────────────────────────────────────────────
@app.route("/robot/place", methods=["POST"])
def robot_place():
    return jsonify({
        "accepted": False,
        "errors": ["Legacy /robot/place has ambiguous source and target coordinates; calibrate and use /robot/place_at"],
    }), 409

# ── VLA plan ──────────────────────────────────────────────────────────────────
VLA_SYSTEM = """You are Layla, a robot arm controller for a PCB assembly robot (MiniMEE by SERC).
Convert natural language instructions into a sequence of robot actions.

Board: 62 x 42 mm. Origin (0,0) is bottom-left. Center is (31, 21) mm.
Upper-left  = (5,  37)   Upper-right = (57, 37)
Lower-left  = (5,   5)   Lower-right = (57,  5)

Respond ONLY with valid JSON — no markdown, no explanation, just raw JSON:
{
  "interpretation": "one-line description of what you will do",
  "actions": [
    {"action": "home"},
    {"action": "move", "x_mm": 31, "y_mm": 21, "z_mm": 5},
    {"action": "pick"},
    {"action": "move", "x_mm": 31, "y_mm": 21, "z_mm": 0},
    {"action": "place"}
  ],
  "warnings": []
}

Valid action types:
  move    — requires x_mm (0-62), y_mm (0-42), z_mm (0-20)
  rotate  — requires degrees
  home | pick | place | release | scan | detect | align | validate  — no extra fields

Rules:
- z_mm = 5 for transit moves, z_mm = 0 for pick/place
- Always HOME first unless told not to
- If the instruction has no robot motion intent, return an empty actions array
- Keep x_mm within 0-62, y_mm within 0-42"""

@app.route("/vla/plan", methods=["POST", "OPTIONS"])
def vla_plan():
    if request.method == "OPTIONS":
        return "", 200

    instruction      = request.form.get("instruction", "").strip()
    board_state_raw  = request.form.get("board_state", "[]")

    try:
        board_state = json.loads(board_state_raw)
    except Exception:
        board_state = []

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "ANTHROPIC_API_KEY not set on server",
                        "actions": [], "interpretation": ""}), 500

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        board_summary = json.dumps(board_state[:10])  # cap to avoid huge prompts
        user_msg = f"Current board state (up to 10 components):\n{board_summary}\n\nInstruction: {instruction}"

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=VLA_SYSTEM,
            messages=[{"role": "user", "content": user_msg}]
        )

        raw = message.content[0].text.strip()

        # Strip markdown code fences if Claude wraps the JSON
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        result = json.loads(raw)
        return jsonify({
            "ok":             True,
            "actions":        result.get("actions", []),
            "interpretation": result.get("interpretation", instruction),
            "warnings":       result.get("warnings", [])
        })

    except json.JSONDecodeError as e:
        return jsonify({
            "ok": False,
            "error":        f"Could not parse Claude response as JSON: {e}",
            "raw_response": raw if "raw" in dir() else "",
            "actions":      [],
            "interpretation": ""
        }), 500
    except Exception as e:
        return jsonify({
            "ok": False, "error": str(e),
            "actions": [], "interpretation": ""
        }), 500

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("SERC Robotic Arm Flask Server")
    print(f"ESP32 Port: {os.environ.get('SERC_SERIAL', '/dev/ttyUSB0')}")
    print("URL: http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
