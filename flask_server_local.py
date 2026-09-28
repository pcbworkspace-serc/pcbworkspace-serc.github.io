"""Run the same JSON robot API on the machine attached to the ESP32."""
from flask_server import app

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
