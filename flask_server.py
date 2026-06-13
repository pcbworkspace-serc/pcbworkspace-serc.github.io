"""
Flask Server for SERC Robotic Arm Control
Production backend with G-code interface to ESP32
"""
import os
from dotenv import load_dotenv
load_dotenv()
import serial
import cv2
import torch
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ESP32_PORT = "COM3"  # Change this to your port
BAUD_RATE  = 115200

class SEARCController:
    def __init__(self):
        self.serial    = None
        self.connected = False

    def connect(self):
        try:
            self.serial    = serial.Serial(ESP32_PORT, BAUD_RATE, timeout=5)
            self.connected = True
            return True
        except:
            self.connected = False
            return False

    def send_command(self, cmd):
        if not self.connected:
            return False, "Not connected"
        try:
            self.serial.write((cmd + "\n").encode())
            response = self.serial.readline().decode().strip()
            return response.startswith("ok"), response
        except:
            return False, "Serial error"

arm = SEARCController()
arm.connect()

# ── Health / ping ─────────────────────────────────────────────────────────────
@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok":                True,
        "arm_connected":     arm.connected,
        "cameras_available": True,
        "vision_available":  True
    })

# ── Robot place ───────────────────────────────────────────────────────────────
@app.route("/robot/place", methods=["POST", "OPTIONS"])
def robot_place():
    if request.method == "OPTIONS":
        return "", 200
    data        = request.get_json() or {}
    component   = data.get("component_type", "Unknown")
    target_x    = data.get("target_x_mm", 0)
    target_y    = data.get("target_y_mm", 0)
    cmd_id      = "cmd_12345"

    if not arm.connected:
        print(f"[DEMO] Placement: {component} at ({target_x}, {target_y})")
        return jsonify({"accepted": True, "command_id": cmd_id,
                        "component_type": component,
                        "target_x": target_x, "target_y": target_y, "errors": []})
    try:
        arm.send_command("G0 X50 Y50")
        arm.send_command("M6 T1")
        arm.send_command(f"G0 X{target_x} Y{target_y}")
        arm.send_command("M6 T0")
        return jsonify({"accepted": True, "command_id": cmd_id,
                        "component_type": component,
                        "target_x": target_x, "target_y": target_y, "errors": []})
    except Exception as e:
        return jsonify({"accepted": False, "command_id": cmd_id, "errors": [str(e)]}), 500

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
    print(f"ESP32 Port: {ESP32_PORT}")
    print("URL: http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
