"""Exercise Flask through pySerial against a firmware-like pseudo terminal."""
import json
import os
import select
import threading
import unittest
from unittest.mock import patch

import auth_middleware
import flask_server
import robot_control


@unittest.skipUnless(os.name == "posix", "pseudo terminals require POSIX")
class SerialPtyTests(unittest.TestCase):
    def test_flask_status_home_and_move_over_serial_port(self):
        import pty

        master, slave = pty.openpty()
        port = os.ttyname(slave)
        stop = threading.Event()
        commands = []

        def firmware():
            buffer = b""
            while not stop.is_set():
                readable, _, _ = select.select([master], [], [], 0.1)
                if not readable:
                    continue
                try:
                    buffer += os.read(master, 4096)
                except OSError:
                    return
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    try:
                        command = json.loads(line)
                    except ValueError:
                        continue
                    commands.append(command)
                    if command.get("cmd") == "status":
                        reply = {"status": {"estop": False, "moving": False,
                                            "joints_deg": [0, 0, 0, 0]}}
                    else:
                        reply = {"event": "homed" if command["cmd"] == "home" else "done"}
                    os.write(master, (json.dumps(reply) + "\n").encode())

        thread = threading.Thread(target=firmware, daemon=True)
        thread.start()
        try:
            robot_control._robot = None
            with (patch.dict(os.environ, {"SERC_SIMULATION": "0"}),
                  patch.object(robot_control.config, "SERIAL_PORT", port),
                  patch.object(auth_middleware, "_DISABLED", True)):
                client = flask_server.app.test_client()
                health = client.get("/health").get_json()
                self.assertTrue(health["arm_connected"])
                self.assertFalse(health["simulation"])
                self.assertEqual(client.post("/robot/home").status_code, 200)
                move = client.post("/robot/command", json={"cmd": "move", "x": 180, "y": 0, "z": 20})
                self.assertEqual(move.status_code, 200, move.get_json())
            self.assertEqual([c["cmd"] for c in commands], ["status", "home", "move"])
            self.assertEqual(len(commands[-1]["j"]), 4)
        finally:
            if robot_control._robot is not None:
                robot_control._robot.shutdown()
                robot_control._robot = None
            stop.set()
            os.close(master)
            os.close(slave)
            thread.join(timeout=1)


if __name__ == "__main__":
    unittest.main()
