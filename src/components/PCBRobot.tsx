import { useState, useCallback, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are Layla, an expert PCB design and electronics engineering assistant for SERC (Space Engineering Research Center). You help engineers with:
- Electronics theory (resistors, capacitors, inductors, transistors, op-amps, diodes)
- PCB design (trace width, clearance, via sizing, impedance, grounding, EMI)
- SMT assembly and reflow soldering
- Communication protocols (UART, I2C, SPI, CAN)
- Power electronics (LDO, buck, boost converters)
- The JEPA Vision System used by this robot arm for precision component placement

Keep answers concise, technical, and practical. Use dashes for bullet points. Always be helpful and encouraging.`;

const SUPABASE_URL = "https://khqvffquritcnznusfcp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocXZmZnF1cml0Y256bnVzZmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTUyODUsImV4cCI6MjA4NzY5MTI4NX0.PNkqYM41fpff_Dr6h-9nnZyEDnlLMijsRaFlv7Aei9A";

function RenderMsg({ content }: { content: string }) {
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
    </div>
  );
}

export default function PCBRobot() {
  const [messages, setMessages] = useState<{role:"user"|"assistant";content:string}[]>([
    { role:"assistant", content:'Hi! I am Layla, your PCB design assistant. I can help with electronics theory, PCB design rules, component placement, communication protocols, and the JEPA vision system.\n\nFeel free to ask anything - try "How does a capacitor work?" or "What is the difference between I2C and SPI?"' }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const newMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(newMessages);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/layla-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const reply = data.content?.[0]?.text ?? "Sorry, I could not generate a response.";
        setMessages(prev => [...prev, { role: "assistant", content: reply }]);
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
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 shrink-0">
        <div>
          <div className="font-bold text-sm text-white">PCB <span style={{color:"#00d4ff"}}>Robot</span></div>
          <div className="text-[9px] text-white/40 uppercase tracking-widest">Layla - Your EE Assistant</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((m,i) => (
          <div key={i} className={m.role==="user"?"text-right":"text-left"}>
            <div className={["inline-block max-w-[92%] px-3 py-2 rounded-lg text-left", m.role==="user"?"bg-[#00d4ff]/15 text-[#00d4ff]":"bg-black/30 text-white/85"].join(" ")}>
              <div className="text-[10px] opacity-60 mb-1">{m.role==="user"?"you:":"Layla:"}</div>
              <RenderMsg content={m.content} />
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
          placeholder="Ask Layla an electronics question..."
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
