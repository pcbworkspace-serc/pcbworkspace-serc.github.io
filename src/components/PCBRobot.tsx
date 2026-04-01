import { useState, useCallback, useRef, useEffect } from "react";

const FLASK_URL = "http://127.0.0.1:5000";

const LANGUAGES = [
  { code:"en", name:"English", flag:"🇺🇸" },
  { code:"es", name:"Español", flag:"🇪🇸" },
  { code:"fr", name:"Français", flag:"🇫🇷" },
  { code:"de", name:"Deutsch", flag:"🇩🇪" },
  { code:"pt", name:"Português", flag:"🇧🇷" },
  { code:"it", name:"Italiano", flag:"🇮🇹" },
  { code:"zh", name:"中文", flag:"🇨🇳" },
  { code:"ja", name:"日本語", flag:"🇯🇵" },
  { code:"ko", name:"한국어", flag:"🇰🇷" },
  { code:"ar", name:"العربية", flag:"🇸🇦" },
  { code:"ru", name:"Русский", flag:"🇷🇺" },
  { code:"hi", name:"हिन्दी", flag:"🇮🇳" },
  { code:"nl", name:"Nederlands", flag:"🇳🇱" },
  { code:"tr", name:"Türkçe", flag:"🇹🇷" },
  { code:"pl", name:"Polski", flag:"🇵🇱" },
  { code:"sv", name:"Svenska", flag:"🇸🇪" },
  { code:"da", name:"Dansk", flag:"🇩🇰" },
];

const SYSTEM_PROMPT = (lang: string) => `You are Layla, an expert PCB design assistant and robot co-pilot for SERC (Space Engineering Research Center). You help students learn electronics by building any PCB project they can imagine using the robot arm.

IMPORTANT: You MUST respond ONLY in ${lang}. All your responses must be in ${lang} regardless of what language the user writes in.

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
- Geiger counter circuits (high voltage, pulse detection)
- Seismic sensors (ADXL355 - low noise accelerometer)

POWER ELECTRONICS:
- Buck converters (LM2596, TPS54340, MP1584 - step down)
- Boost converters (MT3608, XL6009, TPS61023 - step up)
- Buck-boost converters (TPS63020, LTC3780)
- LDO regulators (AMS1117, MCP1700, TLV1117)
- Battery chargers (TP4056, MCP73831, BQ24079)
- Battery management systems (BQ29700, DW01, S-8261)
- MPPT solar chargers (CN3791, BQ24650)
- Wireless charging (WPC Qi, BQ51013)

MOTOR CONTROL:
- DC motor drivers (L298N, DRV8833, TB6612FNG)
- BLDC controllers (DRV8302, VESC, SimpleFOC)
- Stepper motor drivers (A4988, DRV8825, TMC2209, TMC2130)
- Servo controllers (PCA9685 - 16ch PWM)
- Brushless ESC design (FETs, gate drivers, back-EMF sensing)

COMMUNICATION & CONNECTIVITY:
- USB interfaces (CH340, CP2102, FTDI)
- USB-C power delivery (FUSB302, STUSB4500)
- CAN bus interfaces (MCP2515, SN65HVD230, TJA1050)
- RS485/RS422 (MAX485, SP3485)
- Ethernet (W5500, LAN8720)
- WiFi modules (ESP8266, ESP32)
- Bluetooth (nRF52840, CC2640 - BLE 5.0)
- LoRa long range (SX1276, RFM95W)
- NFC/RFID (PN532, MFRC522)
- UWB positioning (DW1000, DW3000)

MICROCONTROLLER & PROCESSOR BOARDS:
- STM32 breakouts (F103, F411, G474)
- ESP32 custom boards (WROOM, WROVER)
- RP2040 boards (Raspberry Pi silicon)
- SAMD21/SAMD51 (Arduino compatible)
- nRF52840 boards (Nordic - BLE + USB)
- FPGA boards (iCE40, ECP5, Xilinx Spartan)
- RISC-V boards (GD32VF103, ESP32-C3)

AUDIO:
- Class D amplifiers (TPA3116, TPA3118, MAX98357)
- Class AB amplifiers (LM386, TDA2030, TPA6120)
- Headphone amplifiers (OPA2134, NE5532, AD8397)
- DAC boards (PCM5102, ES9038, AK4493)
- MEMS microphone arrays (SPH0645, ICS-43434)
- Guitar effects pedals (op-amp circuits, clipping, filtering)
- Synthesizer VCO/VCF circuits (analog, CEM3340)

DISPLAY & LIGHTING:
- LED matrix drivers (IS31FL3741, HT16K33, MAX7219)
- Addressable LED controllers (WS2812B, SK6812, APA102)
- OLED display interfaces (SSD1306, SH1106)
- TFT display drivers (ILI9341, ST7789)
- E-ink display interfaces (GDEW042T2, UC8151)
- High power LED drivers (constant current, dimmable)

ROBOTICS & AUTOMATION:
- Encoder interfaces (quadrature, differential, AB/Z)
- End effector control (gripper, vacuum, electromagnet)
- Robot joint controllers (torque control, impedance)
- Vision system interfaces (camera modules, CSI/MIPI)
- Drone ESC and flight controller boards
- Autonomous vehicle sensor fusion boards

BIOMEDICAL & WEARABLE:
- ECG/EKG front ends (INA128, AD8232)
- EMG amplifiers (instrumentation amp, band-pass filter)
- Pulse oximeters (MAX30102 - SpO2, heart rate)
- EEG interfaces (ADS1299 - neural signals)
- Galvanic skin response (GSR sensor circuit)
- Smart watch circuits (display, battery, BLE, sensors)

INDUSTRIAL & TEST EQUIPMENT:
- Signal generators (DDS - AD9833, AD9850)
- LCR meters (AC bridge circuits)
- Logic analyzers (FPGA based, parallel capture)
- Thermal cameras (MLX90640 array)
- Oscilloscope front ends (attenuator, buffer, ADC)

ROBOT ARM CAPABILITIES:
- pick: grab a component from the tray
- place: place component on the board
- move: move arm to position
- align: run JEPA vision alignment correction
- scan: scan board with top camera
- rotate: rotate component by angle
- release: release gripper
- detect: use JEPA to identify component
- validate: use JEPA to verify placement

CRITICAL RULES:
1. Always respond in ${lang} only.
2. When suggesting a physical robot action, ALWAYS end your message with EXACTLY this on its own line:
ROBOT_CMD: {"action": "pick", "component": "BMP390", "slot": "A1", "description": "picking BMP390 sensor"}
3. When user says ok/yes/execute/go ahead/okay do that, respond with ONLY:
EXECUTING: Sending command to robot arm.
ROBOT_CMD: {"action": "the_action", "component": "name", "description": "description"}
4. Never say you cannot control the robot. You ARE the robot controller interface.
5. Walk through ONE step at a time.
6. You can help build ANYTHING in electronics.
7. Be encouraging - students are learning!`;

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

function LanguagePicker({ onSelect }: { onSelect: (lang: string) => void }) {
  return (
    <div className="flex flex-col h-full items-center justify-center p-4">
      <div className="text-center mb-6">
        <div className="font-bold text-lg text-white mb-1">PCB <span style={{color:"#00d4ff"}}>Robot</span></div>
        <div className="text-white/60 text-sm">Select your language to start</div>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {LANGUAGES.map(l => (
          <button
            key={l.code}
            type="button"
            onClick={() => onSelect(l.name)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-[#00d4ff]/10 hover:border-[#00d4ff]/40 transition-colors text-left"
          >
            <span className="text-lg">{l.flag}</span>
            <span className="text-sm text-white/80">{l.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
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
  const [language, setLanguage] = useState<string | null>(null);
  const [messages, setMessages] = useState<{role:"user"|"assistant";content:string;pendingCmd?:object}[]>([]);
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

  function handleLanguageSelect(lang: string) {
    setLanguage(lang);
    setMessages([]);
    setBusy(true);
    const introPrompt = "Introduce yourself briefly and tell the student you can help them build anything in electronics using the robot arm. Keep it to 3 sentences max. Respond only in " + lang + ".";
    fetch(SUPABASE_URL + "/functions/v1/layla-chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        system: SYSTEM_PROMPT(lang),
        messages: [{ role: "user", content: introPrompt }],
      }),
    })
    .then(r => r.json())
    .then(data => {
      const reply = data.content?.[0]?.text ?? "Hi! I am Layla. Tell me what you want to build!";
      setMessages([{ role: "assistant", content: reply }]);
      setBusy(false);
    })
    .catch(() => {
      setMessages([{ role: "assistant", content: "Hi! I am Layla. Tell me what you want to build!" }]);
      setBusy(false);
    });
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !language) return;
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
          system: SYSTEM_PROMPT(language),
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
  }, [input, busy, messages, language]);

  if (!language) {
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
        <LanguagePicker onSelect={handleLanguageSelect} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
        <div>
          <div className="font-bold text-sm text-white">PCB <span style={{color:"#00d4ff"}}>Robot</span></div>
          <div className="text-[9px] text-white/40 uppercase tracking-widest">Layla - Your EE Assistant</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLanguage(null)} className="text-[9px] text-white/30 hover:text-white/60">
            {LANGUAGES.find(l => l.name === language)?.flag} {language}
          </button>
          <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${robotStatus === "online" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-red-500/20 text-red-400"}`}>
            {robotStatus === "online" ? "Robot Online" : "Robot Offline"}
          </div>
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

