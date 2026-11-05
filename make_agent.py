"""Regenerate the local launcher for the shared JSON robot API."""
from pathlib import Path

Path("flask_server_local.py").write_text(
    '"""Run the same JSON robot API on the machine attached to the ESP32."""\n'
    'from flask_server import app\n\n'
    'if __name__ == "__main__":\n'
    '    app.run(host="127.0.0.1", port=5000, debug=False)\n',
    encoding="utf-8",
)
print("Wrote flask_server_local.py")
