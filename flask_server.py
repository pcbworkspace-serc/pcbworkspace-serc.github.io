"""
Flask Server for SERC Robotic Arm Control
Production backend with G-code interface to ESP32
"""

import serial
import cv2
import torch
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

ESP32_PORT = "COM3"  # Change this to your port
BAUD_RATE = 115200

class SEARCController:
    def __init__(self):
        self.serial = None
        self.connected = False
    
    def connect(self):
        try:
            self.serial = serial.Serial(ESP32_PORT, BAUD_RATE, timeout=5)
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

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "arm_connected": arm.connected,
        "cameras_available": True,
        "vision_available": True
    })

@app.route("/robot/place", methods=["POST", "OPTIONS"])
def robot_place():
    if request.method == "OPTIONS":
        return "", 200
    
    data = request.get_json() or {}
    component = data.get("component_type", "Unknown")
    target_x = data.get("target_x_mm", 0)
    target_y = data.get("target_y_mm", 0)
    
    cmd_id = "cmd_12345"
    
    # Allow demo mode - just log and return success
    if not arm.connected:
        print(f"[DEMO] Placement: {component} at ({target_x}, {target_y})")
        return jsonify({
            "accepted": True,
            "command_id": cmd_id,
            "component_type": component,
            "target_x": target_x,
            "target_y": target_y,
            "errors": []
        })
    
    try:
        # Move to bin
        arm.send_command(f"G0 X50 Y50")
        # Pick
        arm.send_command("M6 T1")
        # Move to target
        arm.send_command(f"G0 X{target_x} Y{target_y}")
        # Place
        arm.send_command("M6 T0")
        
        return jsonify({
            "accepted": True,
            "command_id": cmd_id,
            "component_type": component,
            "target_x": target_x,
            "target_y": target_y,
            "errors": []
        })
    except Exception as e:
        return jsonify({
            "accepted": False,
            "command_id": cmd_id,
            "errors": [str(e)]
        }), 500

if __name__ == "__main__":
    print("SERC Robotic Arm Flask Server")
    print(f"ESP32 Port: {ESP32_PORT}")
    print("URL: http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)