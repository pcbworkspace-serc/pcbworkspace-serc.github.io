# MiniMEE Flask ↔ ESP32 bring-up

## Wiring received 2026-09-28

Krishna's attached *ESP32 + TMC2209 Standalone Wiring Guide* ends with a
"Current Wiring" field note. It describes an ESP-WROOM-32 NodeMCU, three
BIGTREETECH TMC2209 V1.3 modules, a 24 V supply, and a torque problem. The
note explicitly says TMC UART RX/TX has not worked. This is a report of wiring,
not a verified schematic or a tested fourth axis.

| Driver in field note | STEP GPIO | DIR GPIO | MS1 | MS2 |
| --- | ---: | ---: | --- | --- |
| TMC1 | 26 | 25 | GND | GND |
| TMC2 | 33 | 32 | 3.3 V | GND |
| TMC3 | 14 | 27 | GND | 3.3 V |

The note puts all three EN pins on GPIO 13, all driver VDD pins on ESP32
3.3 V, and motor supply negatives and ESP32 grounds on common ground. It lists
GPIO 16 connected to all TMC TX and GPIO 17 to all TMC RX, but the exact
V1.3 module UART solder bridge, line resistors, and readback have not been
verified. The three physical motors are not mapped to robot axes in the note.

**Do not flash `firmware/serc_arm.ino` onto this three-driver wiring or run
`/robot/home`, `/robot/command`, or placement against it.** That sketch's
STEP/DIR/EN assignments describe a different four-axis CNC-shield arrangement
(including GPIO 12 enable and GPIO 16/17 axis signals). It initializes four
UART-addressed drivers, assumes 1/16 microsteps, and uses stallGuard for homing
despite the field note saying UART has not worked. The physical axes and the
robot's current base/shoulder/elbow/wrist kinematics also remain unresolved.

The MS connections above correspond to different standalone step resolutions:
TMC1 1/8, TMC2 1/32, TMC3 1/64, **if** the driver is actually in standalone
mode. The firmware's global `MICROSTEPS = 16` cannot describe that wiring.
When UART is enabled, the same pins select addresses 0, 1, and 2 instead.
Check the actual mode and module jumpers before diagnosing the torque issue.
The guide's `Vref = Irms × 1.44` and fixed clockwise-increases-current advice
should not be used as universal calibration instructions: BTT's published
110 mΩ board formula is `I_RMS ≈ VREF / sqrt(2)` and its documented pot
direction is clockwise **to decrease** Vref. Confirm the module revision,
sense resistor, motor nameplate current, actual Vref, supply voltage, and
driver/motor temperatures before choosing a current setting. A breadboard and
loose jumpers are unsuitable for sustained motor current; mount the drivers
and the local VMOT decoupling securely before loaded tests.

The earlier one-motor example in the attachment uses GPIO 14/12/13 and is
not the later three-driver field wiring. GPIO 12 is also an ESP32 boot
strapping pin, so avoid using that example as a current wiring diagram.

Sources: [TMC2209 datasheet](https://www.analog.com/media/en/technical-documentation/data-sheets/tmc2209_datasheet_rev1.09.pdf),
[BIGTREETECH TMC2209 guide](https://global.bttwiki.com/TMC2209.html),
[Espressif boot pins](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html).

### Next bench evidence

Photograph both sides of each driver and the ESP32, record each motor's exact
part number/current rating and which driver powers it, and draw the actual
EN, STEP, DIR, MS1, MS2, PDN/UART, VMOT, VDD, and common-ground connections.
Measure Vref and identify whether UART readback works for each addressed
driver. Then we can create a matching, bounded one-axis firmware test and a
four-axis pin map. Until those measurements exist, the software tests below
verify the HTTP/serial protocol only.

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
