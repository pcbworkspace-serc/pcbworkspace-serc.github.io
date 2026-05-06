// ============================================================================
//  SERC Robot Arm — ESP32 Firmware
//  ----------------------------------------------------------------------------
//  Communication: JSON line-protocol over USB serial @ 115200 baud
//  One JSON object per line, terminated by '\n'.
//
//  COMMANDS (host -> ESP32):
//    {"cmd":"home"}                              -- sensorless home all axes
//    {"cmd":"move","j":[b,s,e,w]}                -- move to joint angles (deg)
//    {"cmd":"move_steps","s":[b,s,e,w]}          -- absolute steps (debug only)
//    {"cmd":"vacuum","on":true}                  -- pump + solenoid
//    {"cmd":"status"}                            -- one-shot status query
//    {"cmd":"estop"}                             -- emergency stop, disable drivers
//    {"cmd":"reset"}                             -- clear estop
//    {"cmd":"set_speed","v":<deg/s>}             -- max joint speed
//    {"cmd":"encoder_zero"}                      -- zero encoder offsets at current pos
//
//  RESPONSES (ESP32 -> host):
//    {"ack":<id>,"ok":true}                      -- after each command
//    {"event":"done","cmd":"move"}               -- motion complete
//    {"event":"stall","axis":"shoulder"}         -- stallGuard fired
//    {"event":"estop","reason":"..."}            -- triggered estop
//    {"status":{...}}                            -- response to "status"
//
//  STANDARD CNC SHIELD V3.0 PINOUT (Arduino-compatible, Uno-style headers):
//    The ESP32 must be wired to the shield via the standard pins. On a
//    "ESP32 CNC Shield" carrier, these map to ESP32 GPIOs as below.
//    If using a plain Uno-style CNC shield + level shifter, double-check.
//
//    Axis     | Step | Dir  | Enable (shared on shield)
//    ---------|------|------|---------------------------
//    X (Base) |  26  |  16  |  12 (active LOW, all axes)
//    Y (Shldr)|  25  |  27  |  12
//    Z (Elbow)|  17  |  14  |  12
//    A (Wrist)|  13  |  15  |  12   -- A axis uses CLN/CLK pins on shield
//
//    TMC2209 UART (optional but recommended for stallGuard):
//      All 4 drivers share one half-duplex line; addresses set by MS1/MS2.
//      ESP32 pin 4 -> TX (with 1k series resistor) and -> RX
//      Each driver: MS1, MS2 set address 0..3 (Base=0, Shldr=1, Elbow=2, Wrist=3)
//
//    AS5048A magnetic encoders (Base + Shoulder), shared SPI:
//      SCK=18, MISO=19, MOSI=23
//      CS_BASE=5, CS_SHOULDER=21
//
//    Vacuum:
//      VACUUM_PUMP_PIN=32  (HIGH = pump on)
//      SOLENOID_PIN=33     (HIGH = solenoid open / drop part)
//
//    Limit switches (optional; we prefer stallGuard sensorless homing):
//      X_LIM=22, Y_LIM=2, Z_LIM=34, A_LIM=35
//
//  KINEMATICS NOTE: This sketch ONLY moves to commanded joint angles.
//  All inverse kinematics (XYZ -> joint angles) happens on the Python side.
// ============================================================================

#include <ArduinoJson.h>
#include <AccelStepper.h>
#include <SPI.h>
#include <TMCStepper.h>          // optional; remove if not using UART

// ---- Pin definitions (Standard CNC Shield V3.0) ----------------------------
#define PIN_X_STEP   26
#define PIN_X_DIR    16
#define PIN_Y_STEP   25
#define PIN_Y_DIR    27
#define PIN_Z_STEP   17
#define PIN_Z_DIR    14
#define PIN_A_STEP   13
#define PIN_A_DIR    15
#define PIN_ENABLE   12         // active LOW -- shared by all drivers

#define PIN_VACUUM   32
#define PIN_SOLENOID 33

// AS5048A SPI
#define PIN_SPI_SCK  18
#define PIN_SPI_MISO 19
#define PIN_SPI_MOSI 23
#define PIN_CS_BASE     5
#define PIN_CS_SHOULDER 21

// TMC2209 UART (single shared line)
#define TMC_SERIAL Serial2
#define TMC_R_SENSE 0.11f
#define TMC_BAUD    115200

// ---- Mechanical config -----------------------------------------------------
// Steps per revolution AT THE MOTOR (typically 200 for 1.8°), times microstepping.
// CNC Shield default microstep with M0/M1 jumpers is 1/16. Adjust if you change.
const int   MICROSTEPS = 16;
const float STEPS_PER_REV = 200.0f * MICROSTEPS;       // 3200

// Gearing ratio (output / input). Set to 1.0 for direct-drive joints.
// If you add belts/pulleys, change these. All four are direct-drive in the
// hardware doc, so default to 1.
const float GEAR_BASE     = 1.0f;
const float GEAR_SHOULDER = 1.0f;
const float GEAR_ELBOW    = 1.0f;
const float GEAR_WRIST    = 1.0f;

// Max joint speed (deg/s) and acceleration (deg/s^2). Tuned conservatively.
float MAX_SPEED_DEG_S = 60.0f;
float MAX_ACCEL_DEG_S2 = 120.0f;

// TMC2209 run / hold currents (mA). Match Vref tuning in your hardware doc:
//   NEMA 17 (base/shoulder): Vref ~1.0-1.2V => ~1000-1200mA run
//   NEMA 14 (elbow): ~800mA
//   NEMA 8 (wrist):  ~300-500mA
const uint16_t I_RUN_BASE     = 1000;
const uint16_t I_RUN_SHOULDER = 1000;
const uint16_t I_RUN_ELBOW    = 800;
const uint16_t I_RUN_WRIST    = 400;
// Hold current = 50% of run, per doc, to prevent gravity back-driving.
const uint8_t  I_HOLD_PCT     = 50;

// stallGuard threshold (0-255). Higher = more sensitive. Tune per axis.
const uint8_t SG_THRESH_BASE     = 80;
const uint8_t SG_THRESH_SHOULDER = 80;
const uint8_t SG_THRESH_ELBOW    = 70;
const uint8_t SG_THRESH_WRIST    = 50;

// ---- Globals ---------------------------------------------------------------
AccelStepper stepBase    (AccelStepper::DRIVER, PIN_X_STEP, PIN_X_DIR);
AccelStepper stepShoulder(AccelStepper::DRIVER, PIN_Y_STEP, PIN_Y_DIR);
AccelStepper stepElbow   (AccelStepper::DRIVER, PIN_Z_STEP, PIN_Z_DIR);
AccelStepper stepWrist   (AccelStepper::DRIVER, PIN_A_STEP, PIN_A_DIR);

AccelStepper* steppers[4] = { &stepBase, &stepShoulder, &stepElbow, &stepWrist };
const float gears[4]      = { GEAR_BASE, GEAR_SHOULDER, GEAR_ELBOW, GEAR_WRIST };
const char* axisName[4]   = { "base", "shoulder", "elbow", "wrist" };

// TMC2209 drivers (one per axis, shared UART, addresses 0..3)
TMC2209Stepper drvBase    (&TMC_SERIAL, TMC_R_SENSE, 0);
TMC2209Stepper drvShoulder(&TMC_SERIAL, TMC_R_SENSE, 1);
TMC2209Stepper drvElbow   (&TMC_SERIAL, TMC_R_SENSE, 2);
TMC2209Stepper drvWrist   (&TMC_SERIAL, TMC_R_SENSE, 3);
TMC2209Stepper* drivers[4] = { &drvBase, &drvShoulder, &drvElbow, &drvWrist };

bool estopped = false;
bool moving = false;
uint32_t lastCmdId = 0;

// ---- Helpers ---------------------------------------------------------------
long degToSteps(int axis, float deg) {
  return (long)(deg * gears[axis] * STEPS_PER_REV / 360.0f);
}
float stepsToDeg(int axis, long steps) {
  return (float)steps * 360.0f / (gears[axis] * STEPS_PER_REV);
}

void enableDrivers(bool en) {
  digitalWrite(PIN_ENABLE, en ? LOW : HIGH);   // active LOW
}

// AS5048A: read 14-bit angle over SPI. Returns degrees 0-360, or NAN on error.
float readAS5048A(int csPin) {
  const uint16_t CMD_ANGLE = 0x3FFF | 0x4000;  // read angle reg with parity
  digitalWrite(csPin, LOW);
  SPI.transfer16(CMD_ANGLE);
  digitalWrite(csPin, HIGH);
  delayMicroseconds(1);
  digitalWrite(csPin, LOW);
  uint16_t raw = SPI.transfer16(0x0000);
  digitalWrite(csPin, HIGH);
  uint16_t angle = raw & 0x3FFF;               // mask out parity + EF bits
  return (float)angle * 360.0f / 16384.0f;
}

void setupTMC(TMC2209Stepper* d, uint16_t i_run, uint8_t sg_thresh) {
  d->begin();
  d->toff(5);
  d->rms_current(i_run, I_HOLD_PCT / 100.0f);
  d->microsteps(MICROSTEPS);
  d->pwm_autoscale(true);
  d->TCOOLTHRS(0xFFFFF);   // enable stallGuard at all speeds
  d->SGTHRS(sg_thresh);
  d->en_spreadCycle(false); // stealthChop -> silent
}

void sendJson(JsonDocument& doc) {
  serializeJson(doc, Serial);
  Serial.println();
}

// ---- Command handlers ------------------------------------------------------
void cmdMove(JsonArray j) {
  if (estopped) { reportError("estopped"); return; }
  if (j.size() != 4) { reportError("move requires 4 angles"); return; }
  for (int i = 0; i < 4; i++) {
    long target = degToSteps(i, j[i].as<float>());
    steppers[i]->moveTo(target);
    steppers[i]->setMaxSpeed(MAX_SPEED_DEG_S * gears[i] * STEPS_PER_REV / 360.0f);
    steppers[i]->setAcceleration(MAX_ACCEL_DEG_S2 * gears[i] * STEPS_PER_REV / 360.0f);
  }
  moving = true;
}

void cmdHome() {
  // Sensorless homing using TMC2209 stallGuard. Drive each axis toward its
  // mechanical limit at low speed, watch DIAG pin (or read SG_RESULT via UART)
  // for stall, then back off and zero.
  // For brevity here we implement a simple back-off-and-zero version.
  if (estopped) { reportError("estopped"); return; }
  enableDrivers(true);

  for (int i = 0; i < 4; i++) {
    // drive axis toward negative limit
    steppers[i]->setMaxSpeed(MAX_SPEED_DEG_S * 0.3f * gears[i] * STEPS_PER_REV / 360.0f);
    steppers[i]->setAcceleration(MAX_ACCEL_DEG_S2 * gears[i] * STEPS_PER_REV / 360.0f);
    steppers[i]->moveTo(-100000);
    while (steppers[i]->distanceToGo() != 0) {
      steppers[i]->run();
      // Check stallGuard via UART
      if (drivers[i]->SG_RESULT() < 50) break;
    }
    // back off 5 deg and zero
    long backoff = degToSteps(i, 5);
    steppers[i]->move(backoff);
    while (steppers[i]->distanceToGo() != 0) steppers[i]->run();
    steppers[i]->setCurrentPosition(0);
  }

  StaticJsonDocument<128> ev;
  ev["event"] = "homed";
  sendJson(ev);
}

void cmdVacuum(bool on) {
  digitalWrite(PIN_VACUUM, on ? HIGH : LOW);
  // Solenoid is the *release* valve: open it briefly to drop a part.
  // For "on" (picking) we keep solenoid closed.
  digitalWrite(PIN_SOLENOID, on ? LOW : HIGH);
  if (!on) {
    delay(100);                   // brief pulse to vent
    digitalWrite(PIN_SOLENOID, LOW);
  }
}

void cmdStatus() {
  StaticJsonDocument<512> doc;
  JsonObject s = doc.createNestedObject("status");
  s["estop"] = estopped;
  s["moving"] = moving;
  JsonArray pos = s.createNestedArray("joints_deg");
  for (int i = 0; i < 4; i++) pos.add(stepsToDeg(i, steppers[i]->currentPosition()));

  JsonObject enc = s.createNestedObject("encoders");
  enc["base"]     = readAS5048A(PIN_CS_BASE);
  enc["shoulder"] = readAS5048A(PIN_CS_SHOULDER);

  JsonObject sg = s.createNestedObject("stallguard");
  for (int i = 0; i < 4; i++) sg[axisName[i]] = drivers[i]->SG_RESULT();

  sendJson(doc);
}

void cmdEstop(const char* reason) {
  estopped = true;
  for (int i = 0; i < 4; i++) steppers[i]->stop();
  enableDrivers(false);
  digitalWrite(PIN_VACUUM, LOW);
  digitalWrite(PIN_SOLENOID, LOW);
  StaticJsonDocument<128> ev;
  ev["event"] = "estop";
  ev["reason"] = reason ? reason : "user";
  sendJson(ev);
}

void cmdReset() {
  estopped = false;
  enableDrivers(true);
}

void reportError(const char* msg) {
  StaticJsonDocument<128> ev;
  ev["error"] = msg;
  sendJson(ev);
}

// ---- Setup / loop ----------------------------------------------------------
void setup() {
  Serial.begin(115200);
  TMC_SERIAL.begin(TMC_BAUD, SERIAL_8N1, 16, 17);  // RX, TX -- adjust for your wiring

  pinMode(PIN_ENABLE, OUTPUT);
  pinMode(PIN_VACUUM, OUTPUT);
  pinMode(PIN_SOLENOID, OUTPUT);
  pinMode(PIN_CS_BASE, OUTPUT);
  pinMode(PIN_CS_SHOULDER, OUTPUT);
  digitalWrite(PIN_CS_BASE, HIGH);
  digitalWrite(PIN_CS_SHOULDER, HIGH);

  SPI.begin(PIN_SPI_SCK, PIN_SPI_MISO, PIN_SPI_MOSI);

  enableDrivers(true);

  setupTMC(&drvBase,     I_RUN_BASE,     SG_THRESH_BASE);
  setupTMC(&drvShoulder, I_RUN_SHOULDER, SG_THRESH_SHOULDER);
  setupTMC(&drvElbow,    I_RUN_ELBOW,    SG_THRESH_ELBOW);
  setupTMC(&drvWrist,    I_RUN_WRIST,    SG_THRESH_WRIST);

  for (int i = 0; i < 4; i++) {
    steppers[i]->setMaxSpeed(MAX_SPEED_DEG_S * gears[i] * STEPS_PER_REV / 360.0f);
    steppers[i]->setAcceleration(MAX_ACCEL_DEG_S2 * gears[i] * STEPS_PER_REV / 360.0f);
  }

  StaticJsonDocument<128> hello;
  hello["event"] = "ready";
  hello["fw"] = "serc_arm 0.1";
  sendJson(hello);
}

void loop() {
  // 1. Run motion
  bool anyMoving = false;
  for (int i = 0; i < 4; i++) {
    if (steppers[i]->distanceToGo() != 0) {
      steppers[i]->run();
      anyMoving = true;
    }
  }
  if (moving && !anyMoving) {
    moving = false;
    StaticJsonDocument<64> ev;
    ev["event"] = "done";
    sendJson(ev);
  }

  // 2. Check for stall during motion
  if (anyMoving) {
    for (int i = 0; i < 4; i++) {
      if (drivers[i]->SG_RESULT() < 30) {  // very low result = stalled
        cmdEstop("stall");
        StaticJsonDocument<128> ev;
        ev["event"] = "stall";
        ev["axis"] = axisName[i];
        sendJson(ev);
        break;
      }
    }
  }

  // 3. Handle incoming commands (non-blocking)
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) { reportError("bad json"); return; }

    const char* cmd = doc["cmd"] | "";
    uint32_t id = doc["id"] | (++lastCmdId);

    StaticJsonDocument<64> ack;
    ack["ack"] = id;
    ack["ok"] = true;

    if      (!strcmp(cmd, "move"))       { cmdMove(doc["j"].as<JsonArray>()); sendJson(ack); }
    else if (!strcmp(cmd, "home"))       { cmdHome(); sendJson(ack); }
    else if (!strcmp(cmd, "vacuum"))     { cmdVacuum(doc["on"].as<bool>()); sendJson(ack); }
    else if (!strcmp(cmd, "status"))     { cmdStatus(); }
    else if (!strcmp(cmd, "estop"))      { cmdEstop("user"); sendJson(ack); }
    else if (!strcmp(cmd, "reset"))      { cmdReset(); sendJson(ack); }
    else if (!strcmp(cmd, "set_speed"))  { MAX_SPEED_DEG_S = doc["v"].as<float>(); sendJson(ack); }
    else                                 { reportError("unknown cmd"); }
  }
}
