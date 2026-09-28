"""Transport regressions that run without a connected robot or pytest."""
import os
import sys
import threading
import types
import unittest
from unittest.mock import patch

from robot_control import Robot, _open_serial, _SerialStub, _verify_serial_protocol


class RobotTransportTests(unittest.TestCase):
    def test_missing_hardware_does_not_silently_start_simulation(self):
        serial = types.SimpleNamespace(Serial=lambda *args, **kwargs: (_ for _ in ()).throw(OSError("unplugged")))
        with patch.dict(os.environ, {"SERC_SIMULATION": "0"}), patch.dict(sys.modules, {"serial": serial}):
            with self.assertRaisesRegex(OSError, "unplugged"):
                _open_serial("/missing", 115200)

    def test_simulation_is_explicit_and_home_uses_firmware_event(self):
        with patch.dict(os.environ, {"SERC_SIMULATION": "1"}):
            self.assertIsInstance(_open_serial("/missing", 115200), _SerialStub)
            robot = Robot()
            try:
                robot.home(timeout=1)
                self.assertEqual(robot.state.last_event, "homed")
                robot.move_joints(0, 0, 0, timeout=1)
                self.assertEqual(robot.state.last_event, "done")
            finally:
                robot.shutdown()

    def test_error_unblocks_pending_motion(self):
        with patch.dict(os.environ, {"SERC_SIMULATION": "1"}):
            robot = Robot()
            try:
                robot._pending_done = threading.Event()
                robot._pending_event = "done"
                robot._handle({"error": "bad joint"})
                self.assertTrue(robot._pending_done.is_set())
                self.assertEqual(robot._pending_error, "bad joint")
            finally:
                robot.shutdown()

    def test_write_failure_marks_robot_disconnected(self):
        with patch.dict(os.environ, {"SERC_SIMULATION": "1"}):
            robot = Robot()
            try:
                robot._ser.write = lambda _: (_ for _ in ()).throw(OSError("cable removed"))
                with self.assertRaisesRegex(OSError, "cable removed"):
                    robot._send({"cmd": "status"})
                self.assertFalse(robot.state.connected)
                with self.assertRaises(ConnectionError):
                    robot._send({"cmd": "move"})
            finally:
                robot.shutdown()

    def test_handshake_rejects_gcode_only_device(self):
        class GcodePort:
            def write(self, data):
                self.last_command = data

            def readline(self):
                return b"ok G0\n"

        port = GcodePort()
        with patch("robot_control.config.SERIAL_HANDSHAKE_TIMEOUT", 0.02):
            with self.assertRaisesRegex(ConnectionError, "JSON status"):
                _verify_serial_protocol(port)
        self.assertEqual(port.last_command, b'{"cmd":"status","id":0}\n')


if __name__ == "__main__":
    unittest.main()
