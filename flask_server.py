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

LAYLA_SYSTEM = """You are Layla, SERC's PCB assembly project assistant.
Keep a coherent conversation: use the provided message history, refer back to
the user's actual question, and ask one focused follow-up when a dimension or
part number is missing. Distinguish a proposed design, software simulation,
and tested physical hardware. The arm has not been assembled. The current
CadQuery SCARA reach mockup is hand-operated; motor mounts, bearings, Z guide,
nozzle, wiring and calibration are still under design. Flask's JSON serial
contract has only been tested with simulation and a pseudo terminal.
Never claim that a robot action ran based on this conversation. You cannot
send motion commands. If the user requests motion, explain that a reviewed
plan and a separately verified control path are required. Avoid inventing
board positions, feeder poses, motor specifications, or measured accuracy.
For general electronics questions, answer accurately and with concise steps.
"""


def _ask_layla(messages):
    import anthropic
    response = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"]).messages.create(
        model=os.environ.get("SERC_CHAT_MODEL", "claude-sonnet-4-6"),
        max_tokens=900,
        system=LAYLA_SYSTEM,
        messages=messages,
    )
    return "\n".join(block.text for block in response.content
                     if getattr(block, "type", None) == "text").strip()


@app.post("/chat")
def layla_chat():
    """Conversational Q&A only; never dispatches robot commands."""
    body = request.get_json(silent=True) or {}
    messages = body.get("messages")
    if (not isinstance(messages, list) or not messages or len(messages) > 32
            or any(not isinstance(m, dict) or m.get("role") not in ("user", "assistant")
                   or not isinstance(m.get("content"), str)
                   or not m["content"].strip() or len(m["content"]) > 4000
                   for m in messages)
            or messages[-1]["role"] != "user"):
        return jsonify({"error": "messages must end with a user turn and contain short user/assistant text turns"}), 400
    # Client-supplied history is context, never an authority for motion.
    history = [{"role": m["role"], "content": m["content"].strip()}
               for m in messages[-16:]]
    while history and history[0]["role"] != "user":
        history.pop(0)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return jsonify({"error": "Layla chat is unavailable: ANTHROPIC_API_KEY is not set on Flask"}), 503
    try:
        reply = _ask_layla(history)
        if not reply:
            raise ValueError("empty model response")
        return jsonify({"reply": reply})
    except Exception:
        app.logger.exception("Layla chat request failed")
        return jsonify({"error": "Layla chat is temporarily unavailable"}), 502

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

Board dimensions, feeder locations, safe heights, and calibration are not
provided unless the request explicitly includes them. The board_state list
is a preview of components, not proof of physical localization.

Respond ONLY with valid JSON — no markdown, no explanation, just raw JSON:
{
  "interpretation": "one-line description of what you will do",
  "actions": [
    {"action": "move", "x_mm": 20, "y_mm": 10, "z_mm": 5}
  ],
  "warnings": []
}

Valid action types:
  move    — requires x_mm, y_mm, z_mm in an explicitly stated frame
  rotate  — requires degrees
  home | pick | place | release | scan | detect | align | validate  — no extra fields

Rules:
- Never infer a feeder position, part location, board dimension, or safe Z height.
- If required coordinates or calibration are missing, return an empty actions array and explain in warnings.
- If the instruction is a question, return an empty actions array.
- Do not claim a plan is verified or executed."""


def _validate_vla_actions(actions):
    if not isinstance(actions, list) or len(actions) > 20:
        raise ValueError("actions must be a list of at most 20 steps")
    simple = {"home", "pick", "place", "release", "scan", "detect", "align", "validate"}
    validated = []
    for a in actions:
        if not isinstance(a, dict) or a.get("action") not in simple | {"move", "rotate"}:
            raise ValueError("unknown VLA action")
        kind = a["action"]
        if kind == "move":
            if any(not isinstance(a.get(k), (int, float)) or isinstance(a.get(k), bool)
                   or not -1000 <= a[k] <= 1000 for k in ("x_mm", "y_mm", "z_mm")):
                raise ValueError("move needs finite coordinates in millimetres")
        elif kind == "rotate":
            if not isinstance(a.get("degrees"), (int, float)) or not -360 <= a["degrees"] <= 360:
                raise ValueError("rotate needs an angle")
        validated.append(a)
    return validated

@app.route("/vla/plan", methods=["POST", "OPTIONS"])
def vla_plan():
    if request.method == "OPTIONS":
        return "", 200

    if request.is_json:
        payload = request.get_json(silent=True) or {}
        instruction = payload.get("instruction", "")
        board_state = payload.get("board_state", [])
    else:
        instruction = request.form.get("instruction", "")
        try:
            board_state = json.loads(request.form.get("board_state", "[]"))
        except (ValueError, TypeError):
            return jsonify({"ok": False, "error": "invalid board_state JSON"}), 400
    if not isinstance(instruction, str) or not instruction.strip() or len(instruction) > 2000:
        return jsonify({"ok": False, "error": "instruction required (max 2000 characters)"}), 400
    instruction = instruction.strip()
    if not isinstance(board_state, list):
        return jsonify({"ok": False, "error": "board_state must be an array"}), 400

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
        actions = _validate_vla_actions(result.get("actions", []))
        return jsonify({
            "ok":             True,
            "actions":        actions,
            "interpretation": result.get("interpretation", instruction),
            "warnings":       result.get("warnings", [])
        })

    except (json.JSONDecodeError, ValueError, AttributeError) as e:
        return jsonify({
            "ok": False,
            "error":        f"Invalid VLA plan: {e}",
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
