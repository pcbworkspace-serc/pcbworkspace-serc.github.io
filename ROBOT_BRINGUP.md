# MiniMEE Flask ↔ ESP32 bring-up

The launched `flask_server.py` registers `routes_robot.py` and speaks the
newline-delimited JSON protocol in `firmware/serc_arm.ino`. The older
`esp32_firmware_serc.ino` and old G-code agent do not implement motion; do not
use them for the robot. `flask_server_local.py` now launches the same API.

## Software-only verification

```sh
python -m pip install -r requirements-robot.txt
SERC_SIMULATION=1 SERC_AUTH_DISABLED=1 python flask_server.py
```

With the server running, GET `/health` should show `arm_connected: true` and
`simulation: true`. GET `/robot/status` should show a JSON status. The tests
exercise `/robot/home` and `/robot/command` against this explicit simulation:

```sh
python -m unittest -v test_robot_transport test_flask_robot_api test_serial_pty
```

## Physical bring-up prerequisites

1. Confirm the ESP32 and driver wiring against the board schematic. The
   current firmware assigns GPIO 16 and 17 to axis signals **and** TMC UART;
   resolve those collisions before flashing or powering motors.
2. Confirm end stops or encoder references, driver current, power wiring,
   enable polarity, and a physical emergency stop. The current sensorless
   homing routine is not qualified for unattended use.
3. Flash a corrected build of `firmware/serc_arm.ino`, attach the ESP32, and
   set `SERC_SERIAL` to the actual port (`COM3`, `/dev/ttyUSB0`, etc.). Leave
   `SERC_SIMULATION` unset. Set matching `SERC_ROBOT_TOKEN` on Flask and
   `VITE_ROBOT_TOKEN` in the frontend build.
4. Start `python flask_server.py`. GET `/health` must show
   `arm_connected: true` and `simulation: false`; it only does so after a
   valid JSON status reply from the ESP32. GET `/robot/status` must return
   current joints and encoder readings. Disconnect the cable and confirm
   status no longer reports a connected robot.
5. Verify each axis direction and travel at low current and speed with the
   nozzle clear of the work area before any homing or pick/place command.

`/robot/place` rejects the old ambiguous placement request. Use calibrated
`/robot/place_at` only after the PCB-to-robot frame and feeder pickup pose are
measured. The browser's direct WebSerial text commands are a separate legacy
path and do not speak this JSON firmware protocol.
