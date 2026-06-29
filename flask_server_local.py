"""
SERC Local Agent — serial/robot control only.
Runs on the customer's machine next to the USB-connected robot.
Contains NO Anthropic key and NO Claude routes (those stay on the hosted server).
"""
import serial
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ESP32_PORT = "COM3"   # TODO: auto-detect later
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
        except Exception:
            self.connected = False
            return False

    def send_command(self, cmd):
        if not self.connected:
            return False, "Not connected"
        try:
            self.serial.write((cmd + "\n").encode())
            response = self.serial.readline().decode().strip()
            return response.startswith("ok"), response
        except Exception:
            return False, "Serial error"

arm = SEARCController()
arm.connect()

@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"ok": True})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok":            True,
        "arm_connected": arm.connected,
    })

@app.route("/robot/place", methods=["POST", "OPTIONS"])
def robot_place():
    if request.method == "OPTIONS":
        return "", 200
    data      = request.get_json() or {}
    component = data.get("component_type", "Unknown")
    target_x  = data.get("target_x_mm", 0)
    target_y  = data.get("target_y_mm", 0)
    cmd_id    = "cmd_12345"

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

if __name__ == "__main__":
    print("SERC Local Agent  —  http://127.0.0.1:5000")
    print(f"ESP32 Port: {ESP32_PORT}")
    app.run(host="127.0.0.1", port=5000, debug=False)
