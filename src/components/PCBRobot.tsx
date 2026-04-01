import { useState, useCallback, useRef, useEffect } from "react";

const FLASK_URL = "http://127.0.0.1:5000";

const SYSTEM_PROMPT = `You are Layla, an expert PCB design and electronics engineering assistant and robot co-pilot for SERC (Space Engineering Research Center).

You help students build real PCB projects step by step. When a student tells you what they want to build, guide them through:
1. Component selection
2. Schematic design
3. PCB layout
4. Physical assembly using the robot arm

The robot arm has these exact capabilities you can command:
- pick: grab a component from the tray (specify component name)
- place: place component on the board (specify position)
- move: move arm to position
- align: run JEPA vision alignment correction
- scan: scan board with top camera
- rotate: rotate component by angle
- release: release gripper
- detect: use JEPA to detect what component is visible
- validate: use JEPA to validate placement was successful

Student project types you should know:
- Altimeter: BMP388/MS5611 pressure sensor, 3.3V LDO, decoupling caps, I2C pullups, LED indicator
- Motor driver: H-bridge IC, bulk caps, gate resistors, flyback diodes, current sense resistor
- LED matrix: LEDs, current limiting resistors, shift register IC, decoupling cap
- Sensor array: multiple sensors, I2C mux, ADC, filtering caps
- Buck converter: switching IC, inductor, output caps, feedback resistors, bootstrap cap
- Microcontroller breakout: crystal + load caps, reset cap, decoupling, JTAG header
- Battery management: charging IC, protection MOSFETs, fuel gauge IC, thermistor

CRITICAL RULES:
1. When suggesting a physical robot action, ALWAYS end your message with EXACTLY this format on its own line:
ROBOT_CMD: {"action": "pick", "component": "resistor", "description": "picking 10k resistor from slot 3"}

2. When user says "okay do that", "execute", "run that", "do it", "yes", "go ahead" - respond with ONLY:
EXECUTING: Sending command to robot arm.
ROBOT_CMD: {"action": "the_action", "component": "component_name", "description": "description"}

3. Never say you cannot control the robot. You ARE the robot controller interface.
4. Always be specific about which component and where.
5. Walk through projects one step at a time, waiting for user confirmation before next step.

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
    { role:"assistant", content:'Hi! I am Layla, your PCB design assistant and robot co-pilot.\n\nTell me what you want to build and I will walk you through it step by step - from component selection all the way to physical assembly.\n\nTry: "I want to build an altimeter PCB" or "Help me assemble a motor driver board"' }
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

    const isExecuteCmd = /okay do that|execute|run that|do it|yes do it|go ahead|send command|yes$/i.test(text);
    const lastCmd = [...messages].reverse().find(m => m.pendingCmd)?.pendingCmd;

    if (isExecuteCmd && lastCmd) {
      setMessages(prev => [...prev, { role: "user", content: text }]);
      const result = await sendRobotCommand(lastCmd);
      setMessages(prev => [...prev, {
        role: "assistant",
        content: result.ok
          ? `Command sent successfully! ${result.message}\n\nReady for the next step - what would you like to do?`
          : `${result.message}\n\nWhen the robot is connected, this command will execute automatically. Ready to continue planning?`,
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
          placeholder="Tell me what to build, or say okay do that..."
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
