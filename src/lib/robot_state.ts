// Sprint 10 — robot telemetry state.
//
// Listens to every serial line from the ESP32 and updates a shared robot
// state object. Subscribers (UI panels, the minimap) re-render when state
// changes. Lines are parsed using a small grammar — anything that doesn't
// match is ignored.
//
// Recognized lines:
//   POS X<mm> Y<mm> Z<mm> [R<deg>]            periodic position update
//   POS_OK X<mm> Y<mm> Z<mm> [R<deg>]         post-move ack with encoder-verified position
//   PICK_OK [weight=]<grams>[g]               vacuum on, load cell confirms part held
//   PICK_FAIL                                 vacuum on but no weight detected
//   PLACE_OK / RELEASE_OK                     vacuum off, weight dropped
//   PLACE_FAIL                                vacuum off but weight still present
//   VAC[UUM] <kpa>kpa                         vacuum gauge reading
//   ENC_DRIFT joint=<n> cmd=<deg> act=<deg>   encoder mismatch alarm
//   MISSED_STEP joint=<n>                     stallGuard detected a missed step
//   BUSY / READY / DONE / OK / ERR            generic acks (also handled by vla.ts)

import { onSerialLine } from "./serial";

export interface RobotPosition {
  x_mm: number;
  y_mm: number;
  z_mm: number;
  r_deg: number;
}

export type GripperState = "unknown" | "open" | "closed";

export interface RobotState {
  position: RobotPosition | null;
  gripperState: GripperState;
  pickWeightGrams: number | null;
  vacuumKPa: number | null;
  encoderDrift: boolean;
  missedStep: boolean;
  busy: boolean;
  lastResponse: { line: string; kind: "ok" | "err" | "info"; timestamp: number } | null;
  lastUpdatedAt: number;
}

const INITIAL: RobotState = {
  position: null,
  gripperState: "unknown",
  pickWeightGrams: null,
  vacuumKPa: null,
  encoderDrift: false,
  missedStep: false,
  busy: false,
  lastResponse: null,
  lastUpdatedAt: 0,
};

let state: RobotState = { ...INITIAL };
const subscribers = new Set<(s: RobotState) => void>();

function notify() {
  subscribers.forEach((fn) => {
    try { fn(state); } catch {}
  });
}

function update(patch: Partial<RobotState>) {
  state = { ...state, ...patch, lastUpdatedAt: Date.now() };
  notify();
}

function logResponse(line: string, kind: "ok" | "err" | "info") {
  return { line: line.trim(), kind, timestamp: Date.now() };
}

// ── Parsers ──────────────────────────────────────────────────────────────────
function parsePosition(line: string): RobotPosition | null {
  const m = line.match(
    /^(?:POS|POS_OK)\s+X(-?\d+(?:\.\d+)?)\s+Y(-?\d+(?:\.\d+)?)\s+Z(-?\d+(?:\.\d+)?)(?:\s+R(-?\d+(?:\.\d+)?))?/i,
  );
  if (!m) return null;
  return {
    x_mm: parseFloat(m[1]),
    y_mm: parseFloat(m[2]),
    z_mm: parseFloat(m[3]),
    r_deg: m[4] ? parseFloat(m[4]) : 0,
  };
}

function parsePickWeight(line: string): number | null {
  const m = line.match(/^PICK_OK\s+(?:weight=)?([\d.]+)\s*g?/i);
  return m ? parseFloat(m[1]) : null;
}

function parseVacuum(line: string): number | null {
  const m = line.match(/^VAC(?:UUM)?\s+(-?[\d.]+)\s*kpa/i);
  return m ? parseFloat(m[1]) : null;
}

// ── Single-line dispatcher ────────────────────────────────────────────────────
function processLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const upper = trimmed.toUpperCase();

  // Position
  const pos = parsePosition(trimmed);
  if (pos) {
    update({ position: pos, lastResponse: logResponse(trimmed, "ok") });
    return;
  }

  // Pick / place
  const weight = parsePickWeight(trimmed);
  if (weight != null) {
    update({
      gripperState: "closed",
      pickWeightGrams: weight,
      lastResponse: logResponse(trimmed, "ok"),
    });
    return;
  }
  if (upper === "PICK_OK") {
    update({ gripperState: "closed", lastResponse: logResponse(trimmed, "ok") });
    return;
  }
  if (upper === "PLACE_OK" || upper === "RELEASE_OK") {
    update({
      gripperState: "open",
      pickWeightGrams: null,
      lastResponse: logResponse(trimmed, "ok"),
    });
    return;
  }
  if (upper.startsWith("PICK_FAIL") || upper.startsWith("PLACE_FAIL")) {
    update({
      gripperState: "open",
      pickWeightGrams: null,
      lastResponse: logResponse(trimmed, "err"),
    });
    return;
  }

  // Vacuum
  const vac = parseVacuum(trimmed);
  if (vac != null) {
    update({ vacuumKPa: vac });
    return;
  }

  // Closed-loop alarms
  if (upper.startsWith("ENC_DRIFT")) {
    update({ encoderDrift: true, lastResponse: logResponse(trimmed, "err") });
    return;
  }
  if (upper.startsWith("MISSED_STEP")) {
    update({ missedStep: true, lastResponse: logResponse(trimmed, "err") });
    return;
  }

  // Generic acks
  if (upper === "BUSY") {
    update({ busy: true, lastResponse: logResponse(trimmed, "info") });
    return;
  }
  if (upper === "READY" || upper === "DONE") {
    update({ busy: false, lastResponse: logResponse(trimmed, "ok") });
    return;
  }
  if (upper === "OK" || upper.startsWith("OK ")) {
    update({ busy: false, lastResponse: logResponse(trimmed, "ok") });
    return;
  }
  if (upper.startsWith("ERR")) {
    update({ lastResponse: logResponse(trimmed, "err") });
    return;
  }

  // Anything else: log as info but don't change state
  update({ lastResponse: logResponse(trimmed, "info") });
}

// ── Public API ───────────────────────────────────────────────────────────────
export function getRobotState(): RobotState {
  return state;
}

export function onRobotState(cb: (s: RobotState) => void): () => void {
  subscribers.add(cb);
  try { cb(state); } catch {}
  return () => { subscribers.delete(cb); };
}

export function resetRobotState(): void {
  state = { ...INITIAL };
  notify();
}

let installed = false;
let cleanup: (() => void) | null = null;

/** Mount the serial-line listener. Call once at app boot. Idempotent. */
export function installRobotStateListener(): () => void {
  if (installed) return cleanup ?? (() => {});
  installed = true;
  cleanup = onSerialLine(processLine);
  return () => {
    if (cleanup) cleanup();
    installed = false;
    cleanup = null;
  };
}

// Browser console access for debugging
if (typeof window !== "undefined") {
  (window as any).__robotState = getRobotState;
  (window as any).__resetRobotState = resetRobotState;
}
