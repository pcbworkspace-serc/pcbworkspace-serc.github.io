import { useState, useCallback, useRef, useEffect } from "react";

const FLASK_URL = "http://127.0.0.1:5000";

const LANGUAGES = [
  { code:"en", name:"English", flag:"US" },
  { code:"es", name:"Español", flag:"ES" },
  { code:"fr", name:"Français", flag:"FR" },
  { code:"de", name:"Deutsch", flag:"DE" },
  { code:"pt", name:"Português", flag:"PT" },
  { code:"pt-BR", name:"Português (Brasil)", flag:"BR" },
  { code:"it", name:"Italiano", flag:"IT" },
  { code:"zh", name:"中文", flag:"CN" },
  { code:"ja", name:"日本語", flag:"JP" },
  { code:"ko", name:"한국어", flag:"KR" },
  { code:"ar", name:"العربية", flag:"AR" },
  { code:"ru", name:"Русский", flag:"RU" },
  { code:"hi", name:"हिन्दी", flag:"IN" },
  { code:"nl", name:"Nederlands", flag:"NL" },
  { code:"tr", name:"Türkçe", flag:"TR" },
  { code:"pl", name:"Polski", flag:"PL" },
  { code:"sv", name:"Svenska", flag:"SE" },
  { code:"da", name:"Dansk", flag:"DK" },
  { code:"no", name:"Norsk", flag:"NO" },
  { code:"fi", name:"Suomi", flag:"FI" },
  { code:"el", name:"Ελληνικά", flag:"GR" },
  { code:"uk", name:"Українська", flag:"UA" },
  { code:"cs", name:"Čeština", flag:"CZ" },
  { code:"ro", name:"Română", flag:"RO" },
  { code:"id", name:"Bahasa Indonesia", flag:"ID" },
  { code:"vi", name:"Tiếng Việt", flag:"VN" },
  { code:"th", name:"ไทย", flag:"TH" },
  { code:"he", name:"עברית", flag:"IL" },
  { code:"tl", name:"Filipino", flag:"PH" },
  { code:"ms", name:"Bahasa Melayu", flag:"MY" },
  { code:"bn", name:"বাংলা", flag:"BD" },
  { code:"ur", name:"اردو", flag:"PK" },
  { code:"sw", name:"Swahili", flag:"SW" },
];

const SYSTEM_PROMPT = (lang: string) => `You are Layla, an expert PCB design assistant and robot co-pilot for SERC (Space Engineering Research Center). You help students learn electronics by building any PCB project they can imagine using the robot arm.

IMPORTANT: You MUST respond ONLY in ${lang}. All your responses must be in ${lang}.

You have deep knowledge of every category of PCB project including but not limited to:

SENSING & MEASUREMENT: Altimeters (BMP390, MS5611), IMU boards (MPU6050, MPU9250, BNO055), Environmental stations (BME680, SHT31, CCS811), GPS trackers (NEO-M8N), Ultrasonic rangefinders, Load cell amplifiers (HX711), Current monitors (INA219), Thermocouple interfaces (MAX31855), Hall effect sensors (ACS712), Geiger counters, Seismic sensors (ADXL355)

POWER ELECTRONICS: Buck converters (LM2596, TPS54340), Boost converters (MT3608, XL6009), Buck-boost (TPS63020), LDO regulators (AMS1117), Battery chargers (TP4056, BQ24079), BMS circuits, MPPT solar chargers, Wireless charging (Qi)

MOTOR CONTROL: DC motor drivers (L298N, DRV8833), BLDC controllers (DRV8302), Stepper drivers (A4988, TMC2209), Servo controllers (PCA9685), Brushless ESC design

COMMUNICATION: USB interfaces (CH340, CP2102), USB-C PD (FUSB302), CAN bus (MCP2515), RS485 (MAX485), Ethernet (W5500), WiFi (ESP32), Bluetooth (nRF52840), LoRa (SX1276), NFC (PN532), UWB (DW1000)

MICROCONTROLLERS: STM32, ESP32, RP2040, SAMD21/51, nRF52840, FPGA (iCE40, ECP5), RISC-V

AUDIO: Class D amps (TPA3116), Class AB (LM386), DAC boards (PCM5102), MEMS mics, Guitar pedals, Synthesizer VCO/VCF

DISPLAY & LIGHTING: LED matrix (MAX7219), Addressable LEDs (WS2812B), OLED (SSD1306), TFT (ILI9341), E-ink displays

ROBOTICS: Encoder interfaces, End effector control, Vision system interfaces, Drone ESC, Flight controllers

BIOMEDICAL: ECG front ends (AD8232), Pulse oximeters (MAX30102), EEG (ADS1299), Smart watch circuits

INDUSTRIAL: Signal generators (AD9833), Logic analyzers, Thermal cameras (MLX90640), Oscilloscope front ends

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
    <div className="flex flex-col h-full p-4">
      <div className="text-center mb-4">
        <div className="font-bold text-lg text-white mb-1">PCB <span style={{color:"#00d4ff"}}>Robot</span></div>
        <div className="text-white/60 text-sm">Select your language to start</div>
      </div>
      <div className="overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => onSelect(l.name)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-[#00d4ff]/10 hover:border-[#00d4ff]/40 transition-colors text-left"
            >
              <span className="text-[10px] font-black bg-white/20 px-1.5 py-0.5 rounded text-white/70 shrink-0">{l.flag}</span>
              <span className="text-sm text-white/80 truncate">{l.name}</span>
            </button>
          ))}
        </div>
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
      const reply = (data.content?.[0]?.text) ?? "Hi! I am Layla. Tell me what you want to build!";
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
          ? "Command sent! " + result.message + "\n\nReady for the next step - say next to continue."
          : result.message + "\n\nReady to continue planning - say next step to keep going.",
      }]);
      setBusy(false);
      return;
    }

    const newMessages = [...messages.map(m => ({ role: m.role as "user"|"assistant", content: m.content })), { role: "user" as const, content: text }];
    setMessages(prev => [...prev, { role: "user", content: text }]);

    try {
      const response = await fetch(SUPABASE_URL + "/functions/v1/layla-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
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
          <button type="button" onClick={() => { setLanguage(null); setMessages([]); }} className="text-[9px] text-white/30 hover:text-white/60 border border-white/10 px-2 py-0.5 rounded">
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
