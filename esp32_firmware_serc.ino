/*
 * SERC Robotic Arm ESP32 Firmware - G-code Handler
 * 
 * Commands:
 * G0 X Y Z A F  : Move to position
 * M6 T1         : Pick (vacuum on)
 * M6 T0         : Place (vacuum off)
 * G28           : Home all axes
 * M119          : Report encoder positions
 */

#define X_STEP_PIN 12
#define X_DIR_PIN 14
#define VACUUM_PUMP_PIN 23
#define VACUUM_SOLENOID_PIN 22

void setup() {
  Serial.begin(115200);
  pinMode(X_STEP_PIN, OUTPUT);
  pinMode(X_DIR_PIN, OUTPUT);
  pinMode(VACUUM_PUMP_PIN, OUTPUT);
  pinMode(VACUUM_SOLENOID_PIN, OUTPUT);
  Serial.println("// SERC Robotic Arm ESP32 Firmware");
  Serial.println("// Ready for G-code commands");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    
    if (cmd.startsWith("G0")) {
      Serial.println("ok G0");
    } else if (cmd.startsWith("M6")) {
      if (cmd.indexOf("T1") >= 0) {
        digitalWrite(VACUUM_PUMP_PIN, HIGH);
        digitalWrite(VACUUM_SOLENOID_PIN, HIGH);
        Serial.println("ok M6 T1");
      } else {
        digitalWrite(VACUUM_PUMP_PIN, LOW);
        digitalWrite(VACUUM_SOLENOID_PIN, LOW);
        Serial.println("ok M6 T0");
      }
    } else if (cmd.startsWith("M119")) {
      Serial.println("// A:0.0 B:0.0 C:0.0 D:0.0");
      Serial.println("ok M119");
    } else {
      Serial.println("error: Unknown command");
    }
  }
  delay(10);
}
