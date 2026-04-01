import { useState, useCallback, useRef, useEffect } from "react";

const FLASK_URL = "http://127.0.0.1:5000";

const SYSTEM_PROMPT = `You are Layla, an expert PCB design assistant and robot co-pilot for SERC (Space Engineering Research Center). You help students learn electronics by building real PCB projects using the robot arm.

AVAILABLE PROJECTS (when user asks "what can I do" or "what can I build" or "what projects"):
List ALL of these as inspiration - but make it VERY clear these are just examples and Layla can help build absolutely any electronics project the student can imagine. Always end the list with "...and anything else you can dream up! Just describe your idea and I will guide you through it."

1. Altimeter - Measures altitude via barometric pressure (BMP390 sensor, STM32, I2C, 3.3V LDO)
2. Motor Driver Board - Controls DC motors (H-bridge IC, MOSFETs, current sense, flyback diodes)
3. LED Matrix Display - 8x8 or 16x16 LED grid (shift registers, current limiting resistors, multiplexing)
4. Environmental Sensor Station - Temperature, humidity, air quality (BME680, AHT21, SGP30, I2C mux)
5. Buck Converter Power Supply - Efficient step-down regulator (LM2596, inductor, output caps, feedback)
6. Microcontroller Breakout Board - Custom dev board (STM32/ESP32, crystal, SWD debug, GPIO headers)
7. Battery Management System - LiPo charger + protection (TP4056, DW01, MOSFETs, fuel gauge)
8. RF Antenna Board - Wireless communication (nRF24L01, SMA connector, impedance matching, 50-ohm traces)
9. Audio Amplifier - Class D or Class AB amp (TPA2016, filtering caps, speaker connectors)
10. Servo Controller - PWM servo driver (PCA9685, I2C, 16 channels, level shifter)
11. Sensor Fusion IMU Board - 9-DOF motion sensing (MPU9250, magnetometer, Kalman filter)
12. Solar Energy Harvester - Energy harvesting circuit (MPPT IC, supercapacitor, LDO, load switching)
13. CAN Bus Interface - Automotive/robotics comms (MCP2515, TJA1050 transceiver, 120-ohm termination)
14. Stepper Motor Driver - Precision motor control (A4988/TMC2209, microstepping, current limiting)
15. PCB Antenna Design - Custom trace antenna (2.4GHz patch, coplanar waveguide, return loss matching)

ROBOT CAPABILITIES:
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

WORKFLOW FOR EACH PROJECT:
When a student picks a project:
1. List all required components
2. Explain the circuit theory briefly
3. Walk through assembly step by step
4. For each physical step, output a ROBOT_CMD
5. After each placement, suggest running validate to confirm

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
    { role:"assistant", content:'Hi! I am Layla, your PCB design assistant and robot co-pilot.\n\nI can walk you through building 15 different PCB projects step by step - from component selection to physical assembly with the robot arm.\n\nAsk me "what can I build here?" to see all available projects, or just tell me what you want to make!' }
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
          : `${result.message}\n\nReady to continue planning the build - say "next step" to keep going.`,
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
          placeholder="What can I build here? or tell me a project..."
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


