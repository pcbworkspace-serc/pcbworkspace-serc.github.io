/**
 * Robot control panel — sits in the left blue sidebar below Inventory.
 * Styled to match the existing JEPA Vision / Inventory cards
 * (bg-black/20 rounded-xl, black-text headers, similar typography).
 *
 * Usage in Index.tsx:
 *
 *   import RobotPanel from "@/components/RobotPanel";
 *   ...
 *   <Inventory />
 *   <RobotPanel />          // <-- right after Inventory in the sidebar
 *
 * Sends structured robot commands (move/pick/home/etc.) to /robot/chat.
 * Natural-language Q&A is intentionally NOT here — Layla owns that.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRobotStatus } from "@/hooks/useRobotStatus";
import { robotClient, type ChatExecEntry } from "@/lib/robotClient";

type LogEntry =
  | { kind: "user"; text: string }
  | { kind: "exec"; entry: ChatExecEntry }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

export default function RobotPanel() {
  const { data: status, error: statusError } = useRobotStatus();
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([
    { kind: "info", text: "Try: home | move 200 0 30 | place_pcb 25 15 | vacuum on" },
  ]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log]);

  const append = useCallback((e: LogEntry) => setLog((p) => [...p, e]), []);

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    append({ kind: "user", text });
    setBusy(true);
    try {
      const res = await robotClient.chat(text);
      for (const entry of res.executed) append({ kind: "exec", entry });
      if (res.halted_on_error) append({ kind: "info", text: "(halted on error)" });
    } catch (e) {
      append({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }, [input, busy, append]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const doAction = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); append({ kind: "info", text: `${label}: ok` }); }
    catch (e) { append({ kind: "error", text: `${label}: ${e instanceof Error ? e.message : String(e)}` }); }
    finally { setBusy(false); }
  }, [append]);

  // Status pill ── matches the UI's color language: emerald=ok, yellow=moving, red=stopped/err
  const pillTone = (() => {
    if (statusError) return "bg-red-500/20 text-red-200 border-red-500/40";
    if (!status) return "bg-black/30 text-white/60 border-white/10";
    if (status.estopped) return "bg-red-500/20 text-red-200 border-red-500/40";
    if (status.moving) return "bg-yellow-500/20 text-yellow-200 border-yellow-500/40";
    if (status.connected) return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
    return "bg-black/30 text-white/60 border-white/10";
  })();

  const pillText = (() => {
    if (statusError) return "BACKEND DOWN";
    if (!status) return "CONNECTING";
    if (status.estopped) return "ESTOPPED";
    if (status.moving) return "MOVING";
    if (!status.connected) return "DISCONNECTED";
    return "READY";
  })();

  return (
    <div className="bg-black/20 rounded-xl p-3 border border-black/10">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-black font-black text-[10px] uppercase tracking-widest">Robot</h3>
        <span className={`text-[8px] px-1.5 py-0.5 rounded font-black border ${pillTone}`}>
          {pillText}
        </span>
      </div>

      {/* Position readout */}
      {status?.current_xyz && (
        <div className="text-[9px] font-mono text-black/70 mb-2 text-center tracking-wide">
          X {status.current_xyz[0].toFixed(0)}
          {"  "}Y {status.current_xyz[1].toFixed(0)}
          {"  "}Z {status.current_xyz[2].toFixed(0)}
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        <button
          type="button"
          onClick={() => doAction("home", robotClient.home)}
          disabled={busy || status?.estopped}
          className="py-1.5 bg-black text-[#00d4ff] text-[9px] font-black rounded uppercase tracking-widest hover:bg-black/80 transition-colors disabled:opacity-40"
        >
          Home
        </button>
        {status?.estopped ? (
          <button
            type="button"
            onClick={() => doAction("reset", robotClient.reset)}
            disabled={busy}
            className="py-1.5 bg-emerald-500 text-black text-[9px] font-black rounded uppercase tracking-widest hover:bg-emerald-400 transition-colors disabled:opacity-40"
          >
            Reset
          </button>
        ) : (
          <button
            type="button"
            onClick={() => doAction("estop", robotClient.estop)}
            disabled={busy}
            className="py-1.5 bg-red-500 text-white text-[9px] font-black rounded uppercase tracking-widest hover:bg-red-400 transition-colors disabled:opacity-40"
          >
            Stop
          </button>
        )}
        <button
          type="button"
          onClick={() => doAction("vacuum off", () => robotClient.command({ cmd: "vacuum", on: false }))}
          disabled={busy || status?.estopped}
          className="py-1.5 bg-black text-[#00d4ff] text-[9px] font-black rounded uppercase tracking-widest hover:bg-black/80 transition-colors disabled:opacity-40"
        >
          Drop
        </button>
      </div>

      {/* Calibration warning */}
      {status && (!status.calibrated.camera || !status.calibrated.workspace) && (
        <div className="text-[9px] text-black/70 mb-2 leading-tight">
          ⚠ {!status.calibrated.camera && "Camera"}
          {!status.calibrated.camera && !status.calibrated.workspace && " + "}
          {!status.calibrated.workspace && "Workspace"} not calibrated.
          Click Calibrate on the camera feed.
        </div>
      )}

      {/* Command log */}
      <div
        ref={scrollRef}
        className="bg-black/40 rounded h-[100px] overflow-y-auto p-1.5 mb-1.5 font-mono text-[9px] leading-snug space-y-0.5 border border-black/20"
      >
        {log.map((e, i) => {
          if (e.kind === "user") return <div key={i} className="text-[#00d4ff]">› {e.text}</div>;
          if (e.kind === "info") return <div key={i} className="text-white/40 italic">{e.text}</div>;
          if (e.kind === "error") return <div key={i} className="text-red-400">! {e.text}</div>;
          const cls = e.entry.ok ? "text-emerald-300" : "text-red-400";
          const detail = e.entry.error
            ? ` — ${e.entry.error}`
            : e.entry.result
            ? ` ${JSON.stringify(e.entry.result)}`
            : "";
          return <div key={i} className={cls}>{e.entry.ok ? "✓" : "✗"} {e.entry.line}{detail}</div>;
        })}
      </div>

      {/* Command input */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        placeholder={busy ? "..." : "Type a command"}
        className="w-full px-2 py-1.5 text-[10px] rounded bg-black text-[#00d4ff] border border-black/30 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#00d4ff]/30"
      />
    </div>
  );
}
