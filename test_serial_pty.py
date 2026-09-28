"""Exercise Flask through pySerial against a firmware-like pseudo terminal."""
import json
import os
import select
import threading
import unittest
from unittest.mock import patch

import robot_control


@unittest.skipUnless(os.name == "posix", "pseudo terminals require POSIX")
class SerialPtyTests(unittest.TestCase):
    def test_status_handshake_and_motion_over_serial_port(self):
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
        robot = None
        try:
            with patch.dict(os.environ, {"SERC_SIMULATION": "0"}):
                robot = robot_control.Robot(port=port)
                robot.home(timeout=1)
                robot.move_joints(0, 10, 20, 30, timeout=1)
            self.assertTrue(robot.state.connected)
            self.assertEqual([c["cmd"] for c in commands], ["status", "home", "move"])
            self.assertEqual(commands[-1]["j"], [0, 10, 20, 30])
        finally:
            if robot is not None:
                robot.shutdown()
            stop.set()
            os.close(master)
            os.close(slave)
            thread.join(timeout=1)


if __name__ == "__main__":
    unittest.main()
