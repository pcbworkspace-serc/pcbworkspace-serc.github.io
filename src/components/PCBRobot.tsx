import React, { useState, useCallback, useRef, useEffect } from "react";
import { sendSerialCommand, getSerialStatus, isDemoMode } from "@/lib/serial";
import { planAction, executePlan, type VLAAction, type BoardStateItem } from "@/lib/vla";
import { captureFrameByRole } from "@/lib/cameras";
import { savePlan, type SavedPlan } from "@/lib/plans";
import { grabCameraFrame } from "@/components/CameraFeed";
import PlanLibrary from "@/components/PlanLibrary";

type Message = { role: "user" | "assistant"; content: string };
function parseRobotCommand(text: string): string | null {
 const t = text.toLowerCase().trim();
 if (/^(go )?home$/.test(t)) return "HOME";
 if (/^(emergency )?stop$/.test(t) || t === "halt") return "STOP";
 if (/^pick( up)?$/.test(t)) return "PICK";
 if (/^(place|release|drop)$/.test(t)) return "PLACE";
 const rot = t.match(/^rotate\s+(-?\d+(?:\.\d+)?)\s*(?:deg|degrees?)?$/);
 if (rot) return `ROTATE ${rot[1]}`;
 const move = t.match(
 /^(?:move|move to|go to|goto)\s+(-?\d+(?:\.\d+)?)\s*,?\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?(?:\s+(-?\d+(?:\.\d+)?))?$/
 );
 if (move) {
 const x = move[1], y = move[2], z = move[3] ?? "0", r = move[4] ?? "0";
 return `MOVE X${x} Y${y} Z${z} R${r}`;
 }
 const single = t.match(/^(scan|detect|align|validate)$/);
 if (single) return single[1].toUpperCase();
 return null;
}

// Inline formatting: **bold**, `code`, *italic*
function renderInline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/).map((part, j) => {
    const k = `${keyPrefix}-${j}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={k} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={k} className="px-1 py-0.5 rounded bg-black/40 text-[#00d4ff] text-[12px] font-mono">{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={k} className="text-white/70">{part.slice(1, -1)}</em>;
    return part;
  });
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
}

const isTableSeparator = (line: string) => /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

function RenderMsg({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let listBuf: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuf) return;
    const { ordered, items } = listBuf;
    const cls = "my-1 space-y-0.5 text-sm leading-relaxed " + (ordered ? "list-decimal" : "list-disc");
    blocks.push(
      ordered
        ? <ol key={`l${blocks.length}`} className={cls + " pl-5"}>
            {items.map((it, n) => <li key={n}>{renderInline(it, `li${blocks.length}-${n}`)}</li>)}
          </ol>
        : <ul key={`l${blocks.length}`} className={cls + " pl-5"}>
            {items.map((it, n) => <li key={n}>{renderInline(it, `li${blocks.length}-${n}`)}</li>)}
          </ul>
    );
    listBuf = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // blank line
    if (!trimmed) { flushList(); i++; continue; }

    // horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`h${blocks.length}`} className="my-2 border-white/15" />);
      i++; continue;
    }

    // table: a pipe row followed by a separator row
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const header = splitTableRow(trimmed);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().includes("|") && lines[j].trim()) {
        rows.push(splitTableRow(lines[j]));
        j++;
      }
      blocks.push(
        <div key={`t${blocks.length}`} className="my-2 overflow-x-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-[#00d4ff]/30">
                {header.map((h, n) => (
                  <th key={n} className="text-left py-1 pr-3 font-semibold text-[#00d4ff]">
                    {renderInline(h, `th${blocks.length}-${n}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rn) => (
                <tr key={rn} className="border-b border-white/5 last:border-0">
                  {r.map((c, cn) => (
                    <td key={cn} className="py-1 pr-3 align-top text-white/80">
                      {renderInline(c, `td${blocks.length}-${rn}-${cn}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = j; continue;
    }

    // headings
    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const txt = heading[2];
      const cls = level <= 2
        ? "text-[15px] font-bold text-white mt-2 mb-1"
        : "text-[13px] font-semibold text-[#00d4ff] mt-2 mb-0.5";
      blocks.push(<div key={`hd${blocks.length}`} className={cls}>{renderInline(txt, `hd${blocks.length}`)}</div>);
      i++; continue;
    }

    // blockquote
    if (trimmed.startsWith(">")) {
      flushList();
      blocks.push(
        <div key={`q${blocks.length}`} className="my-1 pl-3 border-l-2 border-[#00d4ff]/40 text-sm text-white/75 italic">
          {renderInline(trimmed.replace(/^>\s?/, ""), `q${blocks.length}`)}
        </div>
      );
      i++; continue;
    }

    // list items
    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      const item = (bullet ? bullet[1] : numbered![1]);
      if (!listBuf || listBuf.ordered !== ordered) { flushList(); listBuf = { ordered, items: [] }; }
      listBuf.items.push(item);
      i++; continue;
    }

    // plain paragraph
    flushList();
    blocks.push(
      <p key={`p${blocks.length}`} className="text-sm leading-relaxed">
        {renderInline(line, `p${blocks.length}`)}
      </p>
    );
    i++;
  }
  flushList();

  return <div className="space-y-0.5">{blocks}</div>;
}

interface PCBRobotProps {
 boardItems?: BoardStateItem[];
 // Called whenever a plan is staged for confirmation (null = cleared)
 onPendingPlanChange?: (items: { type: string; x: number; y: number; rotation_deg: number }[] | null) => void;
}


function extractComponentType(instruction: string): string {
  const l = instruction.toLowerCase();
  if (l.includes("resistor"))   return "Resistor";
  if (l.includes("capacitor"))  return "Capacitor";
  if (l.includes("led"))        return "LED";
  if (l.includes("diode"))      return "Diode";
  if (l.includes("transistor")) return "Transistor";
  if (l.includes(" ic ") || l.includes("chip")) return "IC";
  if (l.includes("inductor"))   return "Inductor";
  if (l.includes("crystal"))    return "Crystal";
  if (l.includes("switch"))     return "Switch";
  if (l.includes("header"))     return "Header";
  return "Resistor";
}


// ── Arm-path diagram rendered during plan confirmation ────────────────────────
function PlanDiagram({ actions }: { actions: VLAAction[] }) {
  const W = 224, H = 128, PAD = 16;
  const bW = W - PAD * 2, bH = H - PAD * 2;

  // PCB mm -> SVG px  (flip Y so board top = SVG top)
  const pt = (xm: number, ym: number) => ({
    svgX: PAD + (xm / 62) * bW,
    svgY: H - PAD - (ym / 42) * bH,
  });

  // Build ordered waypoints from actions
  type WP = { svgX: number; svgY: number; kind: "home" | "transit" | "target" };
  const wps: WP[] = [{ ...pt(0, 0), kind: "home" }];
  for (const a of actions) {
    if (a.action === "move") {
      const m = a as VLAAction & { x_mm: number; y_mm: number; z_mm: number };
      wps.push({ ...pt(m.x_mm, m.y_mm), kind: m.z_mm <= 1 ? "target" : "transit" });
    }
  }

  const colDot  = (k: string) => k === "home" ? "#f59e0b" : k === "target" ? "#10b981" : "#00d4ff";
  const colLine = (k: string) => k === "target" ? "#10b981" : "#00d4ff";
  const dash    = (k: string) => k === "transit" ? "5 3" : "none";

  return (
    <svg width={W} height={H} style={{ display:"block", margin:"6px 0", borderRadius:6, background:"#060e1a" }}>
      <defs>
        <marker id="ac" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,1 L6,3.5 L0,6" fill="none" stroke="#00d4ff" strokeWidth="1.2"/>
        </marker>
        <marker id="ag" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,1 L6,3.5 L0,6" fill="none" stroke="#10b981" strokeWidth="1.2"/>
        </marker>
      </defs>

      {/* PCB board */}
      <rect x={PAD} y={PAD} width={bW} height={bH} fill="#0c3d1e" stroke="#1a7a3a" strokeWidth={1} rx={2}/>

      {/* Faint grid */}
      {[10,20,30,40,50].map(x => (
        <line key={"gx"+x}
          x1={PAD+(x/62)*bW} y1={PAD} x2={PAD+(x/62)*bW} y2={H-PAD}
          stroke="#1a7a3a" strokeWidth={0.3}/>
      ))}
      {[10,20,30].map(y => (
        <line key={"gy"+y}
          x1={PAD} y1={H-PAD-(y/42)*bH} x2={W-PAD} y2={H-PAD-(y/42)*bH}
          stroke="#1a7a3a" strokeWidth={0.3}/>
      ))}

      {/* Path segments */}
      {wps.slice(1).map((wp, i) => {
        const from = wps[i];
        const color = colLine(wp.kind);
        const mid = wp.kind === "target" ? "ag" : "ac";
        return (
          <line key={"seg"+i}
            x1={from.svgX} y1={from.svgY} x2={wp.svgX} y2={wp.svgY}
            stroke={color} strokeWidth={1.5}
            strokeDasharray={dash(wp.kind)}
            markerEnd={`url(#${mid})`}
          />
        );
      })}

      {/* Waypoint dots */}
      {wps.map((wp, i) => (
        <circle key={"dot"+i}
          cx={wp.svgX} cy={wp.svgY} r={i === 0 ? 5 : 3.5}
          fill={colDot(wp.kind)} stroke="#000" strokeWidth={0.5}/>
      ))}

      {/* Labels */}
      <text x={wps[0].svgX+7} y={wps[0].svgY+4}
        fill="#f59e0b" fontSize={8} fontFamily="monospace">HOME</text>
      {wps.length > 1 && (
        <text x={wps[wps.length-1].svgX+7} y={wps[wps.length-1].svgY+4}
          fill="#10b981" fontSize={8} fontFamily="monospace">
          {wps[wps.length-1].kind === "target" ? "PLACE" : "TARGET"}
        </text>
      )}

      {/* Legend */}
      <line x1={PAD} y1={H-4} x2={PAD+14} y2={H-4} stroke="#00d4ff" strokeWidth={1.5} strokeDasharray="5 3"/>
      <text x={PAD+17} y={H-1} fill="#00d4ff" fontSize={7} fontFamily="monospace">transit</text>
      <line x1={PAD+58} y1={H-4} x2={PAD+72} y2={H-4} stroke="#10b981" strokeWidth={1.5}/>
      <text x={PAD+75} y={H-1} fill="#10b981" fontSize={7} fontFamily="monospace">place</text>
    </svg>
  );
}

export default function PCBRobot({ boardItems = [], onPendingPlanChange }: PCBRobotProps) {
 const [visible, setVisible] = useState(true);
 const [vlaMode, setVlaMode] = useState(false);
 const [planLibraryOpen, setPlanLibraryOpen] = useState(false);
 const [lastPlan, setLastPlan] = useState<{ instruction: string; actions: VLAAction[] } | null>(null);
 // Confirmation gate: holds a staged plan until user confirms or cancels
 const [pendingPlan, setPendingPlan] = useState<{ instruction: string; actions: VLAAction[]; summary: string } | null>(null);
 const [messages, setMessages] = useState<Message[]>([{
 role: "assistant",
 content: "Hi! I'm Layla. Ask me about the PCB arm or electronics. Plans can be simulated in Demo Mode; the physical arm is still being designed."
 }]);
 const [input, setInput] = useState("");
 const [busy, setBusy] = useState(false);
 const [executing, setExecuting] = useState(false);
 const abortRef = useRef<AbortController | null>(null);
 // Keep Q&A context separate from plan logs and simulated telemetry.
 const chatHistoryRef = useRef<Message[]>([]);
 const bottomRef = useRef<HTMLDivElement>(null);

 useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

 // Tell the parent which positions to preview on the Three.js board
 useEffect(() => {
 if (!onPendingPlanChange) return;
 if (!pendingPlan) { onPendingPlanChange(null); return; }
 const previewItems = pendingPlan.actions
 .filter(a => a.action === "move")
 .map(a => {
 const m = a as VLAAction & { x_mm: number; y_mm: number };
 // Three.js board uses the same x/y units as the VLA actions (mm → world units match)
 return { type: extractComponentType(pendingPlan.instruction), x: (m.x_mm - 31) / 10, y: (m.y_mm - 21) / 10, rotation_deg: 0 };
 });
 onPendingPlanChange(previewItems.length > 0 ? previewItems : null);
 }, [pendingPlan, onPendingPlanChange]);

 const appendAssistant = (content: string) =>
 setMessages(prev => [...prev, { role: "assistant", content }]);

 const handleAbort = () => {
 abortRef.current?.abort();
 appendAssistant("Aborted by user.");
 if (isDemoMode()) sendSerialCommand("STOP").catch(() => {});
 };

 const runVLA = async (instruction: string): Promise<boolean> => {
 appendAssistant(" Planning");

 // Try to grab a camera frame for visual grounding
 let frame: Blob | null = null;
 try { frame = await grabCameraFrame(); } catch {}

 const plan = await planAction(instruction, boardItems, frame);

 if ("error" in plan) {
 appendAssistant(`VLA error: ${plan.error}${plan.raw_response ? `\n\nRaw response:\n${plan.raw_response.slice(0, 400)}` : ""}`);
 return true;
 }

 // A question falls through to the conversational endpoint.
 if (plan.actions.length === 0) {
 return false;
 }

 let summary = `**Plan:** ${plan.interpretation}\n\n**${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"}:**`;
 plan.actions.forEach((a, i) => {
 const line = a.action === "move"
 ? `MOVE X${(a as VLAAction & { x_mm: number }).x_mm} Y${(a as VLAAction & { y_mm: number }).y_mm} Z${(a as VLAAction & { z_mm: number }).z_mm}`
 : a.action === "rotate"
 ? `ROTATE ${(a as VLAAction & { degrees: number }).degrees}`
 : a.action.toUpperCase();
 summary += `\n ${i + 1}. \`${line}\``;
 });
 if (plan.warnings?.length) {
 summary += `\n\n**Warnings:** ${plan.warnings.join("; ")}`;
 }
 appendAssistant(summary);

 // Stage the plan — user must confirm before the robot moves
 setLastPlan({ instruction, actions: plan.actions });
 setPendingPlan({ instruction, actions: plan.actions, summary });
 return true;
 };

 /** Called when user clicks Confirm on the pending plan. Runs executePlan. */
 const confirmPlan = async () => {
 if (!pendingPlan) return;
 const { instruction, actions } = pendingPlan;

 if (!isDemoMode() || getSerialStatus() !== "connected") {
 appendAssistant("This plan is a preview. The physical arm is not assembled or qualified for motion. Select Demo Mode to simulate it.");
 setBusy(false);
 return;
 }
 setPendingPlan(null);

 setBusy(true);
 setExecuting(true);
 abortRef.current = new AbortController();
 await executePlan(actions, {
 abortSignal: abortRef.current.signal,
 waitForOk: true,
 stepTimeoutMs: 8000,
 observeAfter: ["pick", "place", "release"],
 getFrameForAction: async (a) => {
 const role = a.action === "pick" ? "bottom" : "top";
 const frame = await captureFrameByRole(role);
 if (frame) return frame;
 try { return await grabCameraFrame(); } catch { return null; }
 },
 maxRetries: 1,
 onEvent: (e) => {
 if (e.kind === "step") {
 const retrySuffix = e.attempt > 1 ? ` (retry ${e.attempt - 1})` : "";
 appendAssistant(` Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
 } else if (e.kind === "response") {
 appendAssistant(` ${e.ok ? "" : ""} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
 } else if (e.kind === "timeout") {
 appendAssistant(` Step ${e.index + 1}: no acknowledgement; simulation stopped.`);
 } else if (e.kind === "observe_start") {
 appendAssistant(` Checking camera`);
 } else if (e.kind === "observe_result") {
 const icon = e.verified ? "" : "";
 const conf = (e.confidence * 100).toFixed(0);
 appendAssistant(` ${icon} ${e.observation} _(${e.recommendation}, ${conf}% conf)_`);
 } else if (e.kind === "observe_skip") {
 appendAssistant(` Visual check skipped: ${e.reason}`);
 } else if (e.kind === "retry") {
 appendAssistant(` Observer recommended retry re-running step ${e.index + 1}`);
 } else if (e.kind === "done") {
 appendAssistant(" Plan complete.");
 } else if (e.kind === "error") {
 appendAssistant(` Step ${e.index + 1} failed: ${e.message}`);
 } else if (e.kind === "aborted") {
 appendAssistant(` Aborted after step ${e.index}.`);
 }
 },
 });
 setExecuting(false);
 setBusy(false);
 abortRef.current = null;
 // surfaced instruction for later save
 void instruction;
 };

 /** Save the most recently generated VLA plan as a named template. */
 const handleSaveLastPlan = () => {
 if (!lastPlan) return;
 const defaultName = lastPlan.instruction.slice(0, 40);
 const name = window.prompt("Name this plan:", defaultName);
 if (name === null) return;
 const saved = savePlan(name, lastPlan.instruction, lastPlan.actions);
 appendAssistant(`Saved as "${saved.name}". Open the **Plans** popover above to replay it later.`);
 };

 /** Saved plans are staged for review; only Demo Mode can run them. */
 const replayPlan = (plan: SavedPlan) => {
   setPlanLibraryOpen(false);
   setMessages(prev => [...prev, { role: "user", content: `[Replay] ${plan.name}` }]);
   appendAssistant(`Review **${plan.name}** (${plan.actions.length} steps) and confirm to simulate it in Demo Mode.`);
   setPendingPlan({ instruction: plan.instruction, actions: plan.actions, summary: plan.name });
 };

 const send = useCallback(async () => {
 const text = input.trim();
 if (!text || busy) return;
 setInput(""); setBusy(true);
 setMessages(prev => [...prev, { role: "user", content: text }]);

 // 0) Meta-commands that operate on the UI, not the robot
 if (/^(save|save (this )?plan|save the (last )?plan|save it)$/i.test(text)) {
 if (lastPlan) {
 handleSaveLastPlan();
 } else {
 appendAssistant("There's no plan to save yet. Enable VLA Mode, preview a plan, then save it for later review or simulation.");
 }
 setBusy(false); return;
 }
 if (/^(plans|library|show plans|my plans|list plans)$/i.test(text)) {
 setPlanLibraryOpen(true);
 appendAssistant("Plan library opened. Choose a saved plan to review it.");
 setBusy(false); return;
 }

 // 1) The legacy text protocol is only supported by the explicit demo.
 const robotLine = parseRobotCommand(text);
 if (robotLine) {
 if (!isDemoMode() || getSerialStatus() !== "connected") {
 appendAssistant("That is a robot command. The physical arm is not ready, and this chat does not send the old text protocol to the ESP32. Select Demo Mode to simulate it.");
 setBusy(false); return;
 }
 try {
 await sendSerialCommand(robotLine);
 appendAssistant(`Demo command: \`${robotLine}\``);
 } catch (e) {
 appendAssistant(`Robot error: ${e instanceof Error ? e.message : "send failed"}`);
 }
 setBusy(false); return;
 }

 // 2) VLA mode: route freeform instructions to the planner first.
 // If the planner returns NO actions (it was a question / non-motion),
 // fall through to the KB so electronics questions still work in VLA mode.
 if (vlaMode) {
 let handled = false;
 try {
 handled = await runVLA(text);
 } catch (e) {
 appendAssistant(`VLA failed: ${e instanceof Error ? e.message : String(e)}`);
 handled = true;
 }
 if (handled) { setBusy(false); return; }
 // else ask the conversational endpoint
 }

 // 3) Conversation history contains only Q&A turns, not simulated commands
 // or plan execution logs. Keep the last eight exchanges.
    const NN_BASE = (import.meta.env.VITE_NN_URL as string | undefined) ?? "http://127.0.0.1:5000";
    const history: Message[] = [...chatHistoryRef.current.slice(-14), { role: "user", content: text }];
    try {
      const res = await fetch(`${NN_BASE}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }), signal: AbortSignal.timeout(60000),
      });
      const d = await res.json() as { reply?: string; error?: string };
      if (!res.ok || !d.reply) throw new Error(d.error || `Chat HTTP ${res.status}`);
      chatHistoryRef.current = [...history, { role: "assistant", content: d.reply }];
      appendAssistant(d.reply);
    } catch (e) {
      appendAssistant(`Layla conversation is unavailable: ${e instanceof Error ? e.message : String(e)}. Start the Flask server with its chat API configured, then retry.`);
    }
 setBusy(false);
 }, [input, busy, vlaMode, boardItems, lastPlan]);

 return (
 <div className="flex flex-col h-full">
 <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 gap-2 relative">
 <div className="font-bold text-white">PCB <span style={{ color: "#00d4ff" }}>Robot</span></div>
 <div className="flex items-center gap-1.5">
 <button
 type="button"
 onClick={() => setPlanLibraryOpen(v => !v)}
 className="text-[10px] font-bold px-2 py-1 rounded border bg-white/5 text-white/70 border-white/20 hover:bg-white/10 transition-colors"
 title="Open the saved-plans library"
 >
 Plans
 </button>
 <button
 type="button"
 onClick={() => setVlaMode(v => !v)}
 className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
 vlaMode
 ? "bg-purple-500/25 text-purple-200 border-purple-400/60"
 : "bg-white/5 text-white/60 border-white/20 hover:bg-white/10"
 }`}
 title="Toggle Vision-Language-Action mode: route freeform instructions through Claude robot"
 >
 {vlaMode ? " VLA: ON" : "VLA: OFF"}
 </button>
 <button
 type="button"
 onClick={() => setVisible(v => !v)}
 className="text-xs px-3 py-1 rounded border border-white/20 text-white/70 hover:bg-white/10 transition-colors"
 >
 {visible ? "Hide Robot" : "Show Robot"}
 </button>
 </div>
 {planLibraryOpen && (
 <PlanLibrary
 onClose={() => setPlanLibraryOpen(false)}
 onSelect={replayPlan}
 />
 )}
 </div>
 {visible && <>
 <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
 {messages.map((m, i) => (
 <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
 <div className={["inline-block max-w-[92%] px-3 py-2 rounded-lg text-left", m.role === "user" ? "bg-[#00d4ff]/15 text-[#00d4ff]" : "bg-black/30 text-white/85"].join(" ")}>
 <div className="text-[10px] opacity-60 mb-1">{m.role === "user" ? "you:" : "Layla:"}</div>
 <RenderMsg content={m.content} />
 </div>
 </div>
 ))}
 {busy && !executing && (
 <div className="text-left">
 <div className="inline-block px-3 py-2 rounded-lg bg-black/30">
 <div className="flex gap-1">
 {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#00d4ff]/60 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }}/>)}
 </div>
 </div>
 </div>
 )}
 <div ref={bottomRef}/>
 </div>
 {/* ── Confirmation gate: shown after Layla plans, before robot moves ── */}
 {pendingPlan && !executing && (
 <div className="px-3 py-2.5 bg-amber-900/30 border-t border-amber-400/40 shrink-0">
 <p className="text-[10px] font-bold text-amber-300 mb-1.5">
 Preview of {pendingPlan.actions.length} step{pendingPlan.actions.length === 1 ? "" : "s"} — confirm Demo Mode simulation?
 </p>
        <PlanDiagram actions={pendingPlan.actions} />
 <div className="flex gap-2">
 <button
 type="button"
 onClick={confirmPlan}
 className="flex-1 text-[10px] font-bold py-1 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/35 transition-colors"
 >
 Confirm demo simulation
 </button>
 <button
 type="button"
 onClick={() => { setPendingPlan(null); appendAssistant("Plan cancelled. The robot will not move."); setBusy(false); }}
 className="flex-1 text-[10px] font-bold py-1 rounded border bg-red-500/15 text-red-300 border-red-400/40 hover:bg-red-500/30 transition-colors"
 >
 ❌ Cancel
 </button>
 </div>
 </div>
 )}
 {executing && (
 <div className="px-3 py-2 bg-purple-900/40 border-t border-purple-400/30 flex items-center justify-between shrink-0">
 <span className="text-[10px] font-bold text-purple-200"> Executing plan</span>
 <button
 type="button"
 onClick={handleAbort}
 className="text-[10px] font-bold text-red-300 hover:text-red-200 border border-red-400/40 hover:border-red-400/70 rounded px-2 py-0.5"
 >
 ABORT
 </button>
 </div>
 )}
 {!executing && lastPlan && (
 <div className="px-3 py-1.5 bg-purple-900/15 border-t border-purple-400/15 flex items-center justify-between shrink-0">
 <span className="text-[10px] text-purple-300/70">
 Last plan: {lastPlan.actions.length} step{lastPlan.actions.length === 1 ? "" : "s"}
 </span>
 <button
 type="button"
 onClick={handleSaveLastPlan}
 className="text-[10px] font-bold text-purple-300 hover:text-purple-200 border border-purple-400/40 hover:border-purple-400/70 rounded px-2 py-0.5"
 >
 Save plan
 </button>
 </div>
 )}
 <div className="px-3 pt-2 pb-1 border-t border-white/10 flex flex-wrap gap-1 shrink-0 bg-black/20">
 <span className="text-[9px] text-white/40 mr-1 self-center uppercase tracking-wide">Try:</span>
 {vlaMode
 ? ["inspect the board", "what would be needed to place R1?", "move to 20 10 5"].map(ex => (
 <button
 key={ex}
 type="button"
 onClick={() => setInput(ex)}
 className="text-[9px] text-purple-200/70 hover:text-purple-100 border border-purple-400/25 hover:border-purple-400/60 rounded px-1.5 py-0.5 transition-colors"
 >
 {ex}
 </button>
 ))
 : ["what should I print first?", "how does the Flask link work?", "what motor data do we need?"].map(ex => (
 <button
 key={ex}
 type="button"
 onClick={() => setInput(ex)}
 className="text-[9px] font-mono text-white/60 hover:text-white border border-white/15 hover:border-white/40 rounded px-1.5 py-0.5 transition-colors"
 >
 {ex}
 </button>
 ))}
 </div>
 <div className="p-3 border-t border-white/10 flex gap-2 shrink-0">
 <input
 value={input}
 onChange={e => setInput(e.target.value)}
 onKeyDown={e => { if (e.key === "Enter") send(); }}
 className="flex-1 rounded-md px-3 py-2 text-sm bg-[#e8f3ff] text-[#001524] border border-[#00d4ff]/30 focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30"
 placeholder={vlaMode ? "Preview a plan or ask a question" : "Ask Layla about the arm or PCB design"}
 disabled={busy}
 />
 <button
 type="button"
 onClick={send}
 disabled={busy || !input.trim()}
 className="px-4 py-2 rounded-md font-semibold text-sm bg-[#00d4ff] text-[#001524] hover:bg-[#00b8d9] disabled:opacity-50 transition-colors"
 >
 {busy ? "..." : "Send"}
 </button>
 </div>
 </>}
 </div>
 );
}
