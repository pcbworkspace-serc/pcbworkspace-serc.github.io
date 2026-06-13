#!/usr/bin/env python3
"""Run from project root: python patch_diagram.py
Adds an arm-path diagram to the PCBRobot plan confirmation UI."""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
RB   = os.path.join(ROOT, "src", "components", "PCBRobot.tsx")

content = open(RB, encoding="utf-8").read()

# ── Insert PlanDiagram component before export default ────────────────────────
DIAGRAM_COMP = r"""
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

"""

ANCHOR = "export default function PCBRobot"
if ANCHOR not in content:
    print("ERROR: cannot find PCBRobot export"); sys.exit(1)

content = content.replace(ANCHOR, DIAGRAM_COMP + ANCHOR)

# ── Render diagram above the Confirm/Cancel buttons ───────────────────────────
OLD_CONFIRM_HEADER = """      <p className=\"text-[10px] font-bold text-amber-300 mb-1.5\">
          \u26a0 Ready to execute {pendingPlan.actions.length} step{pendingPlan.actions.length === 1 ? \"\" : \"s\"} \u2014 confirm?
        </p>"""

NEW_CONFIRM_HEADER = """      <p className=\"text-[10px] font-bold text-amber-300 mb-1\">
          \u26a0 Ready to execute {pendingPlan.actions.length} step{pendingPlan.actions.length === 1 ? \"\" : \"s\"} \u2014 confirm?
        </p>
        <PlanDiagram actions={pendingPlan.actions} />"""

if OLD_CONFIRM_HEADER not in content:
    # Try a simpler match on just the warning line
    OLD_SIMPLE = "⚠ Ready to execute {pendingPlan.actions.length}"
    if OLD_SIMPLE in content:
        # Find the paragraph and insert diagram after it
        idx = content.find(OLD_SIMPLE)
        # Find end of the closing </p> tag
        p_end = content.find("</p>", idx) + 4
        content = content[:p_end] + "\n        <PlanDiagram actions={pendingPlan.actions} />" + content[p_end:]
        print("  inserted diagram via fallback match")
    else:
        print("WARNING: could not find confirm header — diagram not inserted into UI")
        print("  (component added, wire it up manually inside the pendingPlan block)")
else:
    content = content.replace(OLD_CONFIRM_HEADER, NEW_CONFIRM_HEADER)

open(RB, "w", encoding="utf-8").write(content)
print("  patched  src/components/PCBRobot.tsx")
print("\nDone! Vite will hot-reload.")
