"""HTTP-to-JSON-serial contract on the active Flask entry point."""
import os
import unittest
from unittest.mock import patch

os.environ["SERC_AUTH_DISABLED"] = "1"

import flask_server
import robot_control
import auth_middleware


class FlaskRobotApiTests(unittest.TestCase):
    def setUp(self):
        robot_control._robot = None
        self.env = patch.dict(os.environ, {"SERC_SIMULATION": "1"})
        self.env.start()
        self.auth = patch.object(auth_middleware, "_DISABLED", True)
        self.auth.start()
        self.client = flask_server.app.test_client()

    def tearDown(self):
        if robot_control._robot is not None:
            robot_control._robot.shutdown()
            robot_control._robot = None
        self.env.stop()
        self.auth.stop()

    def test_health_home_and_joint_move_reach_json_transport(self):
        health = self.client.get("/health").get_json()
        self.assertTrue(health["arm_connected"])
        self.assertTrue(health["simulation"])

        sent = []
        original_write = robot_control.get_robot()._ser.write

        def record(line):
            sent.append(line.decode())
            return original_write(line)

        robot_control.get_robot()._ser.write = record
        self.assertEqual(self.client.post("/robot/home").status_code, 200)
        response = self.client.post("/robot/command", json={"cmd": "move", "x": 180, "y": 0, "z": 20})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertTrue(response.get_json()["ok"])
        self.assertTrue(any('"cmd": "home"' in line for line in sent))
        self.assertTrue(any('"cmd": "move"' in line and '"j"' in line for line in sent))

    def test_legacy_place_does_not_claim_success(self):
        response = self.client.post("/robot/place", json={"target_x_mm": 10, "target_y_mm": 5})
        self.assertEqual(response.status_code, 409)
        self.assertFalse(response.get_json()["accepted"])

    def test_health_reports_incompatible_or_missing_device(self):
        with patch("robot_control._open_serial", side_effect=OSError("no ESP32")):
            response = self.client.get("/health")
        self.assertFalse(response.get_json()["arm_connected"])
        self.assertIn("no ESP32", response.get_json()["robot_error"])


if __name__ == "__main__":
    unittest.main()
