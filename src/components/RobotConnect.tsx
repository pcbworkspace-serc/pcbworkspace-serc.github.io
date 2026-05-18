import { useEffect, useState, useRef } from "react";
import {
  connectRobot, disconnectRobot, sendSerialCommand,
  onSerialStatus, onSerialLine, isWebSerialSupported,
  getSerialStatus, type SerialStatus,
} from "@/lib/serial";

/**
 * Compact robot connection badge — sits in the top bar.
 *
 *  • One pill button that shows status (Disconnected / Connecting / Connected)
 *  • Click when disconnected → opens browser port picker
 *  • Click when connected → opens a small console popover
 *      - last ~30 serial lines from the robot
 *      - a text input + Send button to fire commands manually
 *      - a Disconnect button
 */
export default function RobotConnect() {
  const [status, setStatus] = useState<SerialStatus>(getSerialStatus());
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u1 = onSerialStatus(setStatus);
    const u2 = onSerialLine((line) =>
      setLog((prev) => [...prev.slice(-29), `← ${line}`])
    );
    return () => { u1(); u2(); };
  }, []);

  // Autoscroll log on new line
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log, open]);

  const handleBadgeClick = async () => {
    setError(null);
    if (status === "connected") { setOpen((v) => !v); return; }
    if (status === "connecting") return;
    if (!isWebSerialSupported()) {
      setError("WebSerial not supported. Use Chrome or Edge.");
      return;
    }
    try {
      await connectRobot();
      setOpen(true);
    } catch (e) {
      // User cancelled or hardware error
      const msg = e instanceof Error ? e.message : String(e);
      // The port-picker "cancel" surfaces as a NotFoundError — don't yell about it
      if (!/cancel|NotFound/i.test(msg)) setError(msg);
    }
  };

  const handleSend = async () => {
    const cmd = input.trim();
    if (!cmd) return;
    setError(null);
    try {
      await sendSerialCommand(cmd);
      setLog((prev) => [...prev.slice(-29), `→ ${cmd}`]);
      setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    }
  };

  const handleDisconnect = async () => {
    await disconnectRobot();
    setOpen(false);
  };

  // Badge appearance based on status
  const badge = (() => {
    if (status === "connected") {
      return { bg: "bg-emerald-500/20", color: "text-emerald-300", border: "border-emerald-400/60", dot: "bg-emerald-400", label: "Robot Connected" };
    }
    if (status === "connecting") {
      return { bg: "bg-amber-500/20", color: "text-amber-300", border: "border-amber-400/60", dot: "bg-amber-400", label: "Connecting…" };
    }
    return { bg: "bg-red-500/15", color: "text-red-300", border: "border-red-400/50", dot: "bg-red-400", label: "Connect Robot" };
  })();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleBadgeClick}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors hover:opacity-90 flex items-center gap-1.5 ${badge.bg} ${badge.color} ${badge.border}`}
        title={
          status === "connected"
            ? "Connected to ESP32 — click for serial console"
            : "Connect to ESP32 via USB (Chrome/Edge only)"
        }
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${badge.dot}`} />
        {badge.label}
      </button>

      {open && status === "connected" && (
        <div className="absolute right-0 mt-2 z-50 w-[340px] rounded-lg border border-emerald-400/30 bg-black/95 shadow-2xl backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Serial Console</span>
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[9px] font-bold text-red-300 hover:text-red-200 border border-red-400/40 hover:border-red-400/70 rounded px-2 py-0.5"
            >
              Disconnect
            </button>
          </div>

          {/* Log area */}
          <div
            ref={logRef}
            className="h-40 overflow-y-auto px-3 py-2 text-[10px] font-mono leading-snug text-emerald-100/80 bg-black/60"
          >
            {log.length === 0 ? (
              <div className="text-white/30">No traffic yet. Try sending HOME or PICK.</div>
            ) : (
              log.map((line, i) => (
                <div key={i} className={line.startsWith("→") ? "text-amber-300" : "text-emerald-200"}>
                  {line}
                </div>
              ))
            )}
          </div>

          {/* Input row */}
          <div className="flex items-center gap-1 px-2 py-2 border-t border-white/10 bg-black/40">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder="e.g. MOVE X10 Y20 Z0 R0"
              className="flex-1 text-[10px] font-mono bg-white/5 border border-white/15 rounded px-2 py-1 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/60"
            />
            <button
              type="button"
              onClick={handleSend}
              className="text-[10px] font-bold text-emerald-300 hover:text-emerald-200 border border-emerald-400/40 hover:border-emerald-400/70 rounded px-2 py-1"
            >
              Send
            </button>
          </div>

          {/* Quick command shortcuts */}
          <div className="flex flex-wrap gap-1 px-2 pb-2 bg-black/40">
            {["HOME", "PICK", "PLACE", "STOP"].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setInput(q); }}
                className="text-[9px] font-bold text-white/60 hover:text-white border border-white/15 hover:border-white/40 rounded px-1.5 py-0.5"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="absolute right-0 mt-2 z-50 w-[260px] rounded-lg border border-red-400/40 bg-red-950/95 shadow-2xl px-3 py-2 text-[10px] text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
