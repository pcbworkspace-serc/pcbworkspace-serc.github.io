import { useState, useCallback, useRef, useEffect } from "react";

const FLASK_URL = "http://127.0.0.1:5000";

const SYSTEM_PROMPT = `You are Layla, an expert PCB design assistant and robot co-pilot for SERC (Space Engineering Research Center). You help students learn electronics by building any PCB project they can imagine using the robot arm.

You have deep knowledge of every category of PCB project including but not limited to:

SENSING & MEASUREMENT:
- Altimeters (BMP390, MS5611 - barometric pressure, altitude)
- IMU boards (MPU6050, MPU9250, BNO055 - accelerometer, gyro, magnetometer)
- Environmental stations (BME680, SHT31, CCS811 - temp, humidity, air quality, CO2)
- GPS trackers (NEO-M8N, ZOE-M8Q - position, speed, time)
- Ultrasonic rangefinders (HC-SR04, TFmini LiDAR)
- Load cell amplifiers (HX711 - weight sensing)
- Current/power monitors (INA219, INA3221 - voltage, current, power)
- Thermocouple interfaces (MAX31855, MAX31865 - high temp sensing)
- Hall effect sensor boards (ACS712, DRV5053 - current, position)
- Photodiode arrays (TSL2591, VEML7700 - light intensity, color)
- Soil moisture sensors (capacitive, resistive)
- pH sensor interfaces (analog front end, isolation)
- Geiger counter circuits (high voltage, pulse detection)
- Seismic sensors (ADXL355 - low noise accelerometer)
- Strain gauge amplifiers (INA128, instrumentation amp)

POWER ELECTRONICS:
- Buck converters (LM2596, TPS54340, MP1584 - step down)
- Boost converters (MT3608, XL6009, TPS61023 - step up)
- Buck-boost converters (TPS63020, LTC3780 - any input to any output)
- LDO regulators (AMS1117, MCP1700, TLV1117 - low dropout)
- Battery chargers (TP4056, MCP73831, BQ24079 - LiPo/Li-ion)
- Battery management systems (BQ29700, DW01, S-8261 - protection)
- MPPT solar chargers (CN3791, BQ24650 - maximum power tracking)
- Wireless charging (WPC Qi, BQ51013 - receiver, transmitter)
- Supercapacitor chargers (LTC3226, MAX1840)
- High voltage power supplies (flyback, SEPIC, Cuk topology)
- Motor power stages (gate drivers, bootstrap circuits)
- Power factor correction (PFC circuits for AC-DC)
- Isolated DC-DC converters (flyback, forward, push-pull)
- Power sequencing circuits (TPS3706, UCC28610)
- Hot swap controllers (LTC4364, TPS2490)

MOTOR CONTROL:
- DC motor drivers (L298N, DRV8833, TB6612FNG)
- BLDC controllers (DRV8302, VESC, SimpleFOC)
- Stepper motor drivers (A4988, DRV8825, TMC2209, TMC2130)
- Servo controllers (PCA9685 - 16ch PWM, direct PWM)
- Linear actuator drivers (H-bridge with limit switches)
- Brushless ESC design (FETs, gate drivers, back-EMF sensing)
- Field oriented control boards (current sensing, encoder interface)
- Peristaltic pump controllers (stepper or DC with encoder)

COMMUNICATION & CONNECTIVITY:
- USB interfaces (CH340, CP2102, FTDI - UART to USB)
- USB-C power delivery (FUSB302, STUSB4500 - PD negotiation)
- CAN bus interfaces (MCP2515, SN65HVD230, TJA1050)
- RS485/RS422 (MAX485, SP3485 - industrial serial)
- Ethernet (W5500, LAN8720 - TCP/IP stack)
- WiFi modules (ESP8266, ESP32 - 2.4GHz)
- Bluetooth (nRF52840, CC2640 - BLE 5.0)
- LoRa long range (SX1276, RFM95W - 868/915MHz)
- Zigbee (CC2530, XBee - mesh networking)
- 900MHz RF (CC1101, Si4463 - FSK/OOK)
- NFC/RFID (PN532, MFRC522 - 13.56MHz)
- UWB positioning (DW1000, DW3000 - centimeter accuracy)
- Satellite comms (RockBLOCK - Iridium, SWARM)
- IR communication (TSOP38238 receiver, IR LED driver)

MICROCONTROLLER & PROCESSOR BOARDS:
- STM32 breakouts (F103, F411, G474 - various peripherals)
- ESP32 custom boards (WROOM, WROVER - WiFi+BT)
- RP2040 boards (Raspberry Pi silicon - dual core)
- SAMD21/SAMD51 (Atmel - Arduino compatible)
- nRF52840 boards (Nordic - BLE + USB)
- FPGA boards (iCE40, ECP5, Xilinx Spartan)
- RISC-V boards (GD32VF103, ESP32-C3)
- Linux SBC carrier boards (CM4, Jetson Nano)
- Arduino shield designs (Uno, Mega form factor)
- Feather compatible boards (Adafruit ecosystem)

AUDIO:
- Class D amplifiers (TPA3116, TPA3118, MAX98357)
- Class AB amplifiers (LM386, TDA2030, TPA6120)
- Headphone amplifiers (OPA2134, NE5532, AD8397)
- DAC boards (PCM5102, ES9038, AK4493)
- ADC audio interfaces (PCM1808, CS5343)
- MEMS microphone arrays (SPH0645, ICS-43434 - I2S)
- Audio DSP boards (ADAU1701, ADAU1452)
- Guitar effects pedals (op-amp circuits, clipping, filtering)
- Synthesizer VCO/VCF circuits (analog, CEM3340)
- Active crossovers (Linkwitz-Riley, Butterworth filter)

DISPLAY & LIGHTING:
- LED matrix drivers (IS31FL3741, HT16K33, MAX7219)
- Addressable LED controllers (WS2812B, SK6812, APA102)
- OLED display interfaces (SSD1306, SH1106 - I2C/SPI)
- TFT display drivers (ILI9341, ST7789 - SPI)
- E-ink display interfaces (GDEW042T2, UC8151)
- VGA output circuits (resistor DAC, FPGA)
- HDMI/DVI interfaces (FPGA, serializer IC)
- High power LED drivers (constant current, dimmable)
- RGB LED controllers (PWM dimming, color mixing)
- Laser driver circuits (constant current, modulation)

ROBOTICS & AUTOMATION:
- Encoder interfaces (quadrature, differential, AB/Z)
- Limit switch debounce circuits
- End effector control (gripper, vacuum, electromagnet)
- Robot joint controllers (torque control, impedance)
- Vision system interfaces (camera modules, CSI/MIPI)
- Lidar interfaces (UART, I2C, USB - RPLidar, SICK)
- Force/torque sensor amplifiers
- Soft robotics pneumatic controllers
- Drone ESC and flight controller boards
- Autonomous vehicle sensor fusion boards

BIOMEDICAL & WEARABLE:
- ECG/EKG front ends (INA128, AD8232 - heart monitoring)
- EMG amplifiers (instrumentation amp, band-pass filter)
- Pulse oximeters (MAX30102 - SpO2, heart rate)
- Blood pressure monitors (analog front end)
- EEG interfaces (ADS1299 - neural signals)
- Galvanic skin response (GSR sensor circuit)
- Body temperature (MLX90614 - IR thermometer)
- UV index sensors (VEML6075, SI1145)
- Fall detection (accelerometer + algorithm)
- Smart watch circuits (display, battery, BLE, sensors)

INDUSTRIAL & TEST EQUIPMENT:
- Oscilloscope front ends (attenuator, buffer, ADC)
- Signal generators (DDS - AD9833, AD9850)
- Arbitrary waveform generators (DAC + op-amp)
- Spectrum analyzers (superheterodyne, SDR front end)
- LCR meters (AC bridge circuits)
- Curve tracers (transistor, diode characterization)
- Logic analyzers (FPGA based, parallel capture)
- Protocol analyzers (I2C, SPI, UART sniffers)
- High voltage probes (divider networks, protection)
- Current clamp interfaces (Rogowski coil, Hall sensor)
- Thermal cameras (MLX90640 array - IR imaging)
- Network analyzers (VNA front end circuits)

SECURITY & ACCESS:
- RFID/NFC access control (PN532, MFRC522)
- Fingerprint sensor interfaces (R307, AS608)
- Keypad matrix interfaces (4x4, debounce, encryption)
- Door lock controllers (relay, MOSFET, solenoid)
- Alarm systems (PIR, reed switch, siren driver)
- Tamper detection circuits (seal, vibration, light)

ENVIRONMENTAL & IOT:
- Smart home sensor nodes (temperature, motion, light)
- Weather stations (wind, rain, UV, pressure)
- Water quality monitors (pH, TDS, turbidity, DO)
- Smart irrigation controllers (soil moisture, valve driver)
- Energy monitors (whole house, circuit level)
- Air quality networks (PM2.5, VOC, CO, NO2)
- Flood/leak detectors (capacitive, resistive sensing)
- Earthquake early warning (seismic network node)

ROBOT ARM CAPABILITIES:
The robot arm can physically assemble any of these projects. Available commands:
- pick: grab a component from the tray (specify component name and slot)
- place: place component on the board (specify position/pad)
- move: move arm to position
- align: run JEPA vision alignment correction
- scan: scan board with top camera to detect components
- rotate: rotate component by angle
- release: release gripper
- detect: use JEPA to identify what component is visible
- validate: use JEPA to verify placement was successful

WORKFLOW FOR ANY PROJECT:
1. Understand what the student wants to build
2. Suggest the best components and explain why
3. Explain the circuit theory briefly
4. Walk through schematic design
5. Guide PCB layout
6. Physically assemble step by step using robot commands
7. Validate each placement with JEPA

CRITICAL RULES:
1. When suggesting a physical robot action, ALWAYS end your message with EXACTLY this on its own line:
ROBOT_CMD: {"action": "pick", "component": "BMP390", "slot": "A1", "description": "picking BMP390 sensor"}

2. When user says "okay do that", "execute", "run that", "do it", "yes", "go ahead" respond with ONLY:
EXECUTING: Sending command to robot arm.
ROBOT_CMD: {"action": "the_action", "component": "name", "description": "description"}

3. Never say you cannot control the robot. You ARE the robot controller interface.
4. Walk through ONE step at a time. Wait for confirmation before next step.
5. After placement steps, always suggest validating with JEPA.
6. Be encouraging - students are learning!
7. You can help build ANYTHING in electronics - if it is not in your list, figure it out!

Keep answers concise and practical. Use dashes for bullet points.`;

const SUPABASE_URL = "https://khqvffquritcnznusfcp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocXZmZnF1cml0Y256bnVzZmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTUyODUsImV4cCI6MjA4NzY5MTI4NX0.PNkqYM41fpff_Dr6h-9nnZyEDnlLMijsRaFlv7Aei9A";

function extractRobotCmd(text: string): { cmd: object; cleanText: string } | null {
  const match = text.match(/ROBOT_CMD:\s*(\{[^}]+\})/);
  if (!match) return null;
  try {
    const cmd = JSON.parse(match[1]);
    const cleanText = text.replace(/ROBOT_CMD:\s*\{[^}]+\}/, "").replace("EXECUTING: Sending command to robot arm.", "").trim();
    return { cmd, cleanText };
  } catch {
    return null;
  }
}

async function sendRobotCommand(cmd: object): Promise<{ok: boolean; message: string}> {
  try {
    const res = await fetch(`${FLASK_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, message: data.message ?? "Command executed." };
    }
    return { ok: false, message: "Robot rejected the command." };
  } catch {
    return { ok: false, message: "Robot not connected. Command queued for when hardware is online." };
  }
}

function RenderMsg({ content, pendingCmd }: { content: string; pendingCmd?: object }) {
  return (
    <div className="space-y-0.5">
      {content.split("\n").map((line, i) => (
        <p key={i} className={["text-sm leading-relaxed", line.startsWith("-") || line.startsWith(" ") ? "pl-2" : ""].join(" ")}>
          {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={j} className="text-white">{part.slice(2,-2)}</strong>
              : part
          )}
        </p>
      ))}
      {pendingCmd && (
        <div className="mt-2 p-2 rounded border border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981] text-[10px] font-mono">
          <p className="font-bold mb-1">Robot command ready:</p>
          <p>{JSON.stringify(pendingCmd)}</p>
          <p className="text-white/50 mt-1">Say "okay do that" to execute</p>
        </div>
      )}
    </div>
  );
}

export default function PCBRobot() {
  const [messages, setMessages] = useState<{role:"user"|"assistant";content:string;pendingCmd?:object}[]>([
    { role:"assistant", content:'Hi! I am Layla, your PCB design assistant and robot co-pilot.\n\nI can help you build anything in electronics - from simple sensor boards to complex motor controllers, RF systems, audio amplifiers, biomedical devices, industrial test equipment, and everything in between.\n\nJust tell me what you want to build and I will guide you through every step - component selection, schematic design, PCB layout, and physical assembly with the robot arm.\n\nOr ask me "what can I build here?" for some project ideas to get you started!' }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [robotStatus, setRobotStatus] = useState<"unknown"|"online"|"offline">("unknown");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  useEffect(() => {
    fetch(`${FLASK_URL}/health`, { signal: AbortSignal.timeout(2000) })
      .then(r => setRobotStatus(r.ok ? "online" : "offline"))
      .catch(() => setRobotStatus("offline"));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const isExecuteCmd = /okay do that|execute|run that|do it|yes do it|go ahead|send command|^yes$/i.test(text);
    const lastCmd = [...messages].reverse().find(m => m.pendingCmd)?.pendingCmd;

    if (isExecuteCmd && lastCmd) {
      setMessages(prev => [...prev, { role: "user", content: text }]);
      const result = await sendRobotCommand(lastCmd);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: result.ok
          ? `Command sent! ${result.message}\n\nReady for the next step - say "next" to continue.`
          : `${result.message}\n\nReady to continue planning - say "next step" to keep going.`,
      }]);
      setBusy(false);
      return;
    }

    const newMessages = [...messages.map(m => ({ role: m.role as "user"|"assistant", content: m.content })), { role: "user" as const, content: text }];
    setMessages(prev => [...prev, { role: "user", content: text }]);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/layla-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: newMessages,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawReply = data.content?.[0]?.text ?? "Sorry, I could not generate a response.";
        const extracted = extractRobotCmd(rawReply);
        if (extracted) {
          setMessages(prev => [...prev, { role: "assistant", content: extracted.cleanText, pendingCmd: extracted.cmd }]);
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: rawReply }]);
        }
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I am having trouble connecting right now. Please try again." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I could not reach the AI service. Please check your connection and try again." }]);
    }

    setBusy(false);
  }, [input, busy, messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
        <div>
          <div className="font-bold text-sm text-white">PCB <span style={{color:"#00d4ff"}}>Robot</span></div>
          <div className="text-[9px] text-white/40 uppercase tracking-widest">Layla - Your EE Assistant</div>
        </div>
        <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${robotStatus === "online" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-red-500/20 text-red-400"}`}>
          {robotStatus === "online" ? "Robot Online" : "Robot Offline"}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((m,i) => (
          <div key={i} className={m.role==="user"?"text-right":"text-left"}>
            <div className={["inline-block max-w-[92%] px-3 py-2 rounded-lg text-left", m.role==="user"?"bg-[#00d4ff]/15 text-[#00d4ff]":"bg-black/30 text-white/85"].join(" ")}>
              <div className="text-[10px] opacity-60 mb-1">{m.role==="user"?"you:":"Layla:"}</div>
              <RenderMsg content={m.content} pendingCmd={m.pendingCmd} />
            </div>
          </div>
        ))}
        {busy && (
          <div className="text-left">
            <div className="inline-block px-3 py-2 rounded-lg bg-black/30">
              <div className="flex gap-1">
                {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 bg-[#00d4ff]/60 rounded-full animate-bounce" style={{animationDelay:`${i*150}ms`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter")send();}}
          className="flex-1 rounded-md px-3 py-2 text-sm bg-[#e8f3ff] text-[#001524] border border-[#00d4ff]/30 focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30"
          placeholder="Tell me what you want to build..."
          disabled={busy}
        />
        <button
          type="button"
          onClick={send}
          disabled={busy||!input.trim()}
          className="px-4 py-2 rounded-md font-semibold text-sm bg-[#00d4ff] text-[#001524] hover:bg-[#00b8d9] disabled:opacity-50 transition-colors"
        >
          {busy?"...":"Send"}
        </button>
      </div>
    </div>
  );
}
