import { useEffect, useState } from "react";
import { getRobotState, onRobotState, type RobotState } from "@/lib/robot_state";
import { getSerialStatus, onSerialStatus, type SerialStatus } from "@/lib/serial";

/**
 * Live robot telemetry panel — bottom-left of the screen, only visible when
 * the robot is connected. Click to expand and see full state breakdown.
 *
 * Pulls from robot_state.ts which parses incoming serial lines.
 */
export default function RobotStatus() {
  const [state, setState] = useState<RobotState>(getRobotState());
  const [serial, setSerial] = useState<SerialStatus>(getSerialStatus());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const u1 = onRobotState(setState);
    const u2 = onSerialStatus(setSerial);
    return () => { u1(); u2(); };
  }, []);

  // Hide entirely until the robot is connected
  if (serial !== "connected") return null;

  const pos = state.position;
  const briefPos = pos
    ? `X${pos.x_mm.toFixed(1)} Y${pos.y_mm.toFixed(1)} Z${pos.z_mm.toFixed(1)}`
    : "no telemetry";

  const hasAlarm = state.encoderDrift || state.missedStep;
  const accentClass = hasAlarm
    ? "border-red-400/50 bg-red-950/80"
    : "border-emerald-400/30 bg-black/90";

  return (
    <div
      className={`fixed bottom-4 left-4 z-40 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden border ${accentClass}`}
      style={{ minWidth: 200 }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-emerald-200 hover:bg-emerald-500/10 w-full"
      >
        <span className="font-black text-sm">🤖</span>
        <span className="font-mono">{briefPos}</span>
        {state.gripperState === "closed" && (
          <span className="text-amber-300 text-[9px] font-bold ml-1">● HELD</span>
        )}
        {state.busy && (
          <span className="text-blue-300 text-[9px] font-bold ml-1">BUSY</span>
        )}
        {hasAlarm && (
          <span className="text-red-400 text-[10px] font-bold ml-1">⚠</span>
        )}
        <span className="text-emerald-400/40 text-[9px] ml-auto">{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div className="px-3 py-2 border-t border-white/10 text-[10px] text-white/85 space-y-1 min-w-[280px]">
          <Row label="Position">
            <span className="font-mono text-emerald-200">{briefPos}</span>
          </Row>
          {pos && (
            <Row label="Rotation">
              <span className="font-mono">{pos.r_deg.toFixed(1)}°</span>
            </Row>
          )}
          <Row label="Gripper">
            <span className={state.gripperState === "closed" ? "text-amber-300" : "text-white/60"}>
              {state.gripperState}
            </span>
          </Row>
          {state.pickWeightGrams != null && (
            <Row label="Pick weight">
              <span className="font-mono text-amber-300">{state.pickWeightGrams.toFixed(2)} g</span>
            </Row>
          )}
          {state.vacuumKPa != null && (
            <Row label="Vacuum">
              <span className="font-mono">{state.vacuumKPa.toFixed(1)} kPa</span>
            </Row>
          )}
          {state.encoderDrift && (
            <div className="text-red-300 font-bold pt-1">⚠ Encoder drift detected</div>
          )}
          {state.missedStep && (
            <div className="text-red-300 font-bold">⚠ Missed step detected</div>
          )}
          {state.lastResponse && (
            <div className="pt-2 mt-2 border-t border-white/10">
              <div className="text-[9px] uppercase tracking-wide text-white/40 mb-1">Last response</div>
              <div
                className={`font-mono text-[10px] leading-tight ${
                  state.lastResponse.kind === "err"
                    ? "text-red-300"
                    : state.lastResponse.kind === "ok"
                      ? "text-emerald-200"
                      : "text-white/60"
                }`}
              >
                {state.lastResponse.line}
              </div>
              <div className="text-[8px] text-white/30 mt-0.5">
                {timeSince(state.lastResponse.timestamp)} ago
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/45 uppercase tracking-wide text-[9px]">{label}</span>
      <span>{children}</span>
    </div>
  );
}

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 1) return "just now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}
