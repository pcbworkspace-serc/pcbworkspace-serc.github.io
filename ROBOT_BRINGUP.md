# MiniMEE Flask ↔ ESP32 bring-up

## Layla conversation and planning

The main `PCBRobot` panel sends user/assistant Q&A turns to Flask `POST /chat`.
Flask keeps no secret server-side session; the browser sends the last several
conversational turns on each request. Simulated telemetry and plan logs are
excluded. Set `ANTHROPIC_API_KEY` on the Flask process for model replies.
If the key or server is missing, the UI reports that chat is unavailable
instead of falling back to stale keyword answers. This endpoint **never**
sends robot commands.

VLA Mode calls `POST /vla/plan` with either JSON or multipart form input and
shows the proposed actions for review. Saved plans also reopen for review.
The chat panel can run the legacy text-action sequence only in explicit Demo
Mode; the physical ESP32 JSON protocol is not exposed through that path.
Actual hardware motion remains gated on assembly, kinematics, wiring,
calibration, and a reviewed control path. Test the conversation contract with
`python -m unittest -v test_layla_chat` (the model call is mocked).

## Proposed wiring from the attached guide (2026-09-28)

The arm has **not been assembled**. Krishna's attached *ESP32 + TMC2209
Standalone Wiring Guide* ends with a "Current Wiring" note describing an
ESP-WROOM-32 NodeMCU, three BIGTREETECH TMC2209 V1.3 modules, and a 24 V
supply. The note mentions a torque issue and unsuccessful UART RX/TX tests,
but we do not know which parts, if any, were connected in those tests. Treat
its pin list as a proposed starting point, not an as-built schematic.

| Driver in guide | STEP GPIO | DIR GPIO | MS1 | MS2 |
| --- | ---: | ---: | --- | --- |
| TMC1 | 26 | 25 | GND | GND |
| TMC2 | 33 | 32 | 3.3 V | GND |
| TMC3 | 14 | 27 | GND | 3.3 V |

The proposed list puts all three EN pins on GPIO 13, all driver VDD pins on
ESP32 3.3 V, and motor supply negatives and ESP32 grounds on common ground.
It lists GPIO 16 to all TMC TX and GPIO 17 to all TMC RX. The exact V1.3
module UART solder bridge, line resistors, and readback have not been
verified. The three motors are not mapped to robot axes in the guide.

**Do not flash `firmware/serc_arm.ino` for the proposed three-driver wiring or
run `/robot/home`, `/robot/command`, or placement against it.** That sketch's
STEP/DIR/EN assignments describe a different four-axis CNC-shield arrangement
(including GPIO 12 enable and GPIO 16/17 axis signals). It initializes four
UART-addressed drivers, assumes 1/16 microsteps, and uses stallGuard for homing
despite the guide reporting unsuccessful UART tests. The physical axes and the
robot's current base/shoulder/elbow/wrist kinematics also remain unresolved.

The MS connections above correspond to different standalone step resolutions:
TMC1 1/8, TMC2 1/32, TMC3 1/64, **if** the driver is actually in standalone
mode. The firmware's global `MICROSTEPS = 16` cannot describe that wiring.
When UART is enabled, the same pins select addresses 0, 1, and 2 instead.
Check the actual mode and module jumpers when investigating the reported torque issue.
The guide's `Vref = Irms × 1.44` and fixed clockwise-increases-current advice
should not be used as universal calibration instructions: BTT's published
110 mΩ board formula is `I_RMS ≈ VREF / sqrt(2)` and its documented pot
direction is clockwise **to decrease** Vref. Confirm the module revision,
sense resistor, motor nameplate current, actual Vref, supply voltage, and
driver/motor temperatures before choosing a current setting. A breadboard and
loose jumpers are unsuitable for sustained motor current; mount the drivers
and the local VMOT decoupling securely before loaded tests.

The earlier one-motor example in the attachment uses GPIO 14/12/13 and is
not the later three-driver proposal. GPIO 12 is also an ESP32 boot strapping
pin, so avoid using that example as the arm wiring diagram.

Sources: [TMC2209 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/tmc2209_datasheet_rev1.09.pdf),
[BIGTREETECH TMC2209 guide](https://global.bttwiki.com/TMC2209.html),
[Espressif boot pins](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html).

### Before assembly and bench testing

Use the three CAD archives to settle the axis layout and choose a fourth
driver, then draw a four-axis schematic with an explicit motor/driver mapping,
EN, STEP, DIR, MS1, MS2, PDN/UART, VMOT, VDD, common ground, end stops or
encoder references, and a physical emergency stop. Record each motor's exact
part number and rated phase current. The bench phase can then measure Vref,
check UART readback per driver, and use a bounded one-axis test before any
assembled-arm motion. Until then, the software tests below verify only the
HTTP/serial protocol.

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
