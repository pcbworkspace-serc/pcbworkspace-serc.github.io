import { useState, useRef, useEffect } from "react";
import { getDetection, getAlignmentCorrection, getValidation } from "@/lib/nn";

const LaylaChat = () => {
  const [minimized, setMinimized] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "bot", text: "Hi! I am Layla. I'm ready to help with your PCB assembly! Try typing detect, align, or validate to run the CNN vision engine." }
  ]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, minimized]);

  const pushMsg = (role: string, text: string) =>
    setMessages((prev) => [...prev, { role, text }]);

  const handleSend = async () => {
    if (!input.trim() || busy) return;

    const text = input.trim();
    const lower = text.toLowerCase();
    const newMessages = [...messages, { role: "user", text }];
    setMessages(newMessages);
    setInput("");
    setBusy(true);

    try {
      // CNN commands
      if (lower.includes("detect")) {
        const r = await getDetection();
        pushMsg("bot", `🔍 Detection result: ${r.class_name} (${(r.confidence * 100).toFixed(1)}% confidence)\nBBox: cx=${r.bbox[0].toFixed(3)} cy=${r.bbox[1].toFixed(3)} w=${r.bbox[2].toFixed(3)} h=${r.bbox[3].toFixed(3)} — ${r.inference_ms}ms`);
      } else if (lower.includes("align")) {
        const r = await getAlignmentCorrection();
        pushMsg("bot", `📐 Alignment correction:\nΔθ = ${r.delta_theta_deg.toFixed(2)}°\nΔx = ${r.delta_x_mm.toFixed(3)} mm\nΔy = ${r.delta_y_mm.toFixed(3)} mm`);
      } else if (lower.includes("validate")) {
        const r = await getValidation();
        const icon = r.decision === "PASS" ? "✅" : "❌";
        pushMsg("bot", `${icon} Validation: ${r.decision}\nPass prob: ${(r.pass_prob * 100).toFixed(1)}%  Fail prob: ${(r.fail_prob * 100).toFixed(1)}% — ${r.inference_ms}ms`);
      } else {
        // Original fallback response
        setTimeout(() => {
          pushMsg("bot", "I'm processing that request for your PCB workspace...");
        }, 600);
      }
    } catch {
      pushMsg("bot", "⚠️ CNN server offline. Make sure flask_server.py is running.");
    }

    setBusy(false);
  };

  return (
    <div className="fixed right-6 bottom-6 z-[9999] flex flex-col items-end">
      {!minimized && (
        <div className="w-[280px] h-[350px] bg-black/95 border border-[#00a3ff]/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden mb-4 animate-in fade-in slide-in-from-bottom-4 backdrop-blur-md">
          <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
            <span className="text-[10px] font-bold text-[#00a3ff] uppercase tracking-widest">Layla AI</span>
            <button onClick={() => setMinimized(true)} className="text-white/40 hover:text-white transition-colors">✕</button>
          </div>

          <div ref={scrollRef} className="flex-1 p-4 text-[11px] text-white/80 overflow-y-auto space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <span className={`inline-block p-2 rounded-lg whitespace-pre-wrap text-left max-w-[95%] ${m.role === 'user' ? 'bg-[#00a3ff]/20 text-[#00a3ff]' : 'bg-white/5 text-white/90'}`}>
                  {m.text}
                </span>
              </div>
            ))}
            {busy && (
              <div className="text-left">
                <span className="inline-block p-2 rounded-lg bg-white/5 text-white/30 text-[10px] italic animate-pulse">Thinking...</span>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-white/10 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={busy}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-white outline-none focus:border-[#00a3ff]/50 disabled:opacity-50"
              placeholder="detect / align / validate..."
            />
            <button
              onClick={handleSend}
              disabled={busy}
              className="bg-[#00a3ff] text-black font-bold px-3 py-1 rounded-lg text-[10px] disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setMinimized(!minimized)}
        className="bg-[#00a3ff] hover:scale-105 text-white text-[10px] font-bold px-5 py-2.5 rounded-full shadow-xl border border-white/20 transition-all flex items-center gap-2"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        {minimized ? "Ask Layla" : "Close"}
      </button>
    </div>
  );
};

export default LaylaChat;
