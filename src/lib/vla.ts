// VLA (Vision-Language-Action) client — Sprint 8 + 9 + Demo Mode aware.
//
// When Demo Mode is active, planAction and observeStep short-circuit to
// keyword-based stubs that don't need Flask or an Anthropic API key.
// The whole UI flow (plan → execute → verify → save) works offline.

import { sendSerialCommand, getSerialStatus, onSerialLine, isDemoMode } from "@/lib/serial";

const VLA_PLAN_ENDPOINT    = "http://127.0.0.1:5000/vla/plan";
const VLA_OBSERVE_ENDPOINT = "http://127.0.0.1:5000/vla/observe";

export type VLAAction =
  | { action: "home" }
  | { action: "move"; x_mm: number; y_mm: number; z_mm: number }
  | { action: "pick" }
  | { action: "place" }
  | { action: "release" }
  | { action: "rotate"; degrees: number }
  | { action: "stop" }
  | { action: "scan" }
  | { action: "detect" }
  | { action: "align" }
  | { action: "validate" };

export interface VLAPlan {
  ok: true;
  interpretation: string;
  actions: VLAAction[];
  warnings: string[];
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  elapsed_ms?: number;
}

export interface VLAError {
  ok: false;
  error: string;
  raw_response?: string;
}

export interface VLAObservation {
  ok: true;
  verified: boolean;
  observation: string;
  recommendation: "continue" | "retry" | "abort";
  confidence: number;
  elapsed_ms?: number;
}

export interface BoardStateItem {
  type: string;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
}

// ─── Demo Mode planner ──────────────────────────────────────────────────────
// Keyword-based stub that turns simple natural-language instructions into
// plausible action sequences. Used when isDemoMode() is true so the user
// can demo the VLA flow without a live Flask server.

function simulatePlan(instruction: string, boardState: BoardStateItem[]): VLAPlan {
  const lower = instruction.toLowerCase();

  // Questions are not motion commands — let the caller fall through to KB
  const looksLikeQuestion =
    /^\s*(where|how|what|why|when|who|which|is|are|does|do|can|could|should|tell|explain)\b/i.test(instruction)
    || instruction.includes("?");
  if (looksLikeQuestion) {
    return {
      ok: true,
      interpretation: "Looks like a question, not a motion command",
      actions: [],
      warnings: [],
      model: "demo-stub",
      tokens_in: 0,
      tokens_out: 0,
      elapsed_ms: 50,
    };
  }

  const wantsPick  = /\b(pick|grab|take|get)\b/.test(lower);
  const wantsPlace = /\b(place|put|set|drop|release)\b/.test(lower);
  const wantsMove  = /\b(move|go|navigate|travel)\b/.test(lower);
  const wantsScan  = /\b(scan|inspect|look)\b/.test(lower);
  const wantsHome  = /\bhome\b/.test(lower);

  if (!wantsPick && !wantsPlace && !wantsMove && !wantsScan && !wantsHome) {
    return {
      ok: true,
      interpretation: "No motion verbs detected",
      actions: [],
      warnings: [],
      model: "demo-stub",
      tokens_in: 0,
      tokens_out: 0,
      elapsed_ms: 50,
    };
  }

  const actions: VLAAction[] = [];
  const PCB_W = 62, PCB_H = 42;
  const safeZ = 5;

  let target = { x: PCB_W / 2, y: PCB_H / 2 };
  const corner = lower.match(/\b(lower|upper|bottom|top)[\s-]*(left|right)\b/);
  if (corner) {
    const v = corner[1], h = corner[2];
    target = {
      x: h === "left" ? 10 : PCB_W - 10,
      y: (v === "lower" || v === "bottom") ? 10 : PCB_H - 10,
    };
  } else if (/\bcenter\b|\bmiddle\b|\bcentre\b/.test(lower)) {
    target = { x: PCB_W / 2, y: PCB_H / 2 };
  } else {
    const xy = lower.match(/(\d+(?:\.\d+)?)\s*(?:mm)?[\s,]+(\d+(?:\.\d+)?)\s*(?:mm)?/);
    if (xy) target = { x: parseFloat(xy[1]), y: parseFloat(xy[2]) };
  }

  const pickup = { x: 50, y: 8, z: safeZ };
  const skipHome = /\b(?:don'?t|skip)\s+home\b|\bfrom here\b/.test(lower);
  if (!skipHome) actions.push({ action: "home" });

  if (wantsPick && wantsPlace) {
    actions.push({ action: "move", x_mm: pickup.x, y_mm: pickup.y, z_mm: safeZ });
    actions.push({ action: "pick" });
    actions.push({ action: "move", x_mm: target.x, y_mm: target.y, z_mm: safeZ });
    actions.push({ action: "place" });
  } else if (wantsPick) {
    actions.push({ action: "move", x_mm: pickup.x, y_mm: pickup.y, z_mm: safeZ });
    actions.push({ action: "pick" });
  } else if (wantsPlace) {
    actions.push({ action: "move", x_mm: target.x, y_mm: target.y, z_mm: safeZ });
    actions.push({ action: "place" });
  } else if (wantsMove) {
    actions.push({ action: "move", x_mm: target.x, y_mm: target.y, z_mm: safeZ });
  } else if (wantsScan) {
    actions.push({ action: "scan" });
  }

  if (!skipHome && actions.length > 1 && actions[actions.length - 1].action !== "home") {
    actions.push({ action: "home" });
  }

  return {
    ok: true,
    interpretation: `Plan: ${describeActions(actions)}`,
    actions,
    warnings: [],
    model: "demo-stub",
    tokens_in: 0,
    tokens_out: 0,
    elapsed_ms: 200,
  };
}

function describeActions(actions: VLAAction[]): string {
  return actions.map((a) => {
    if (a.action === "move") return `move to (${a.x_mm}, ${a.y_mm})`;
    if (a.action === "rotate") return `rotate ${a.degrees}°`;
    return a.action;
  }).join(" → ");
}

function simulateObservation(actionDescription: string): VLAObservation {
  return {
    ok: true,
    verified: true,
    observation: `Demo Mode: ${actionDescription} completed`,
    recommendation: "continue",
    confidence: 0.85,
    elapsed_ms: 150,
  };
}

export async function planAction(
  instruction: string,
  boardState: BoardStateItem[],
  cameraFrame?: Blob | null,
): Promise<VLAPlan | VLAError> {
  // Demo Mode: no Flask, no Anthropic — just a keyword stub
  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 400));
    return simulatePlan(instruction, boardState);
  }

  try {
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (cameraFrame) {
      const form = new FormData();
      form.append("instruction", instruction);
      form.append("board_state", JSON.stringify(boardState));
      form.append("image", cameraFrame, "frame.jpg");
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ instruction, board_state: boardState });
    }
    const res = await fetch(VLA_PLAN_ENDPOINT, { method: "POST", headers, body, signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: false, error: errBody.error ?? `HTTP ${res.status}`, raw_response: errBody.raw_response };
    }
    return (await res.json()) as VLAPlan;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      // Flask offline — fall back to the offline keyword planner so the user
      // can still see VLA work end-to-end. Tag it so the UI can warn.
      const fallback = simulatePlan(instruction, boardState);
      return {
        ...fallback,
        interpretation: `(Flask offline — using offline planner) ${fallback.interpretation}`,
        warnings: [
          "Local Flask server at 127.0.0.1:5000 isn't running, so I used the offline keyword stub. Start Flask with the ANTHROPIC_API_KEY env var for real Claude planning.",
          ...fallback.warnings,
        ],
      };
    }
    return { ok: false, error: msg };
  }
}

/** Ask the planner to verify what just happened from a fresh camera frame. */
export async function observeStep(
  actionDescription: string,
  robotReport: string,
  cameraFrame: Blob | null,
): Promise<VLAObservation | VLAError> {
  // Demo Mode: always pass
  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 200));
    return simulateObservation(actionDescription);
  }

  try {
    let body: BodyInit;
    const headers: Record<string, string> = {};
    if (cameraFrame) {
      const form = new FormData();
      form.append("action_description", actionDescription);
      form.append("robot_report", robotReport);
      form.append("image", cameraFrame, "frame.jpg");
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({ action_description: actionDescription, robot_report: robotReport });
    }
    const res = await fetch(VLA_OBSERVE_ENDPOINT, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: false, error: errBody.error ?? `HTTP ${res.status}` };
    }
    return (await res.json()) as VLAObservation;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export function actionToSerialLine(a: VLAAction): string {
  switch (a.action) {
    case "home":   return "HOME";
    case "stop":   return "STOP";
    case "pick":   return "PICK";
    case "place":
    case "release": return "PLACE";
    case "rotate": return `ROTATE ${a.degrees}`;
    case "move":   return `MOVE X${a.x_mm} Y${a.y_mm} Z${a.z_mm} R0`;
    case "scan":   return "SCAN";
    case "detect": return "DETECT";
    case "align":  return "ALIGN";
    case "validate": return "VALIDATE";
  }
}

function actionDescription(a: VLAAction): string {
  switch (a.action) {
    case "move": return `Move nozzle to X=${a.x_mm}, Y=${a.y_mm}, Z=${a.z_mm} mm`;
    case "rotate": return `Rotate end-effector to ${a.degrees}°`;
    case "pick": return "Pick up the part under the nozzle (vacuum on)";
    case "place":
    case "release": return "Release the held part at current position (vacuum off)";
    case "home": return "Return to home position";
    default: return `${a.action.toUpperCase()}`;
  }
}

/** Wait for the next OK/ERR/READY line, or timeout. */
function waitForResponse(timeoutMs: number) {
  let unsubscribe: (() => void) | null = null;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const promise = new Promise<{ kind: "ok" | "err" | "timeout"; line: string }>((resolve) => {
    const finish = (result: { kind: "ok" | "err" | "timeout"; line: string }) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      unsubscribe?.();
      resolve(result);
    };

    unsubscribe = onSerialLine((line) => {
      const upper = line.trim().toUpperCase();
      if (upper === "OK" || upper.startsWith("OK ")
          || upper === "READY" || upper === "DONE"
          || upper.startsWith("POS_OK")
          || upper.startsWith("PICK_OK")
          || upper.startsWith("PLACE_OK")) {
        finish({ kind: "ok", line });
      } else if (upper.startsWith("ERR")
                 || upper.startsWith("PICK_FAIL")
                 || upper.startsWith("PLACE_FAIL")
                 || upper.startsWith("ENC_DRIFT")
                 || upper.startsWith("MISSED_STEP")) {
        finish({ kind: "err", line });
      }
    });

    timeoutHandle = setTimeout(() => finish({ kind: "timeout", line: "" }), timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      unsubscribe?.();
    },
  };
}

export type StepEvent =
  | { kind: "start"; total: number }
  | { kind: "step"; index: number; total: number; line: string; action: VLAAction; attempt: number }
  | { kind: "response"; index: number; total: number; ok: boolean; line: string }
  | { kind: "timeout"; index: number; total: number }
  | { kind: "observe_start"; index: number }
  | { kind: "observe_result"; index: number; verified: boolean; observation: string;
      recommendation: "continue" | "retry" | "abort"; confidence: number }
  | { kind: "observe_skip"; index: number; reason: string }
  | { kind: "retry"; index: number; attempt: number }
  | { kind: "done" }
  | { kind: "error"; index: number; message: string }
  | { kind: "aborted"; index: number };

export interface ExecuteOpts {
  onEvent?: (e: StepEvent) => void;
  waitForOk?: boolean;
  stepTimeoutMs?: number;
  interStepDelayMs?: number;
  abortSignal?: AbortSignal;
  /** Grab a fresh camera frame and verify with Claude after these actions. Defaults to ["pick","place","release"]. */
  observeAfter?: VLAAction["action"][];
  /**
   * Function that returns a fresh camera frame for visual verification.
   * Sprint 9: the function receives the action so it can pick which camera to use
   * (e.g. bottom camera for PICK, top camera for PLACE).
   * For backwards compatibility, also accepts grabFrame (no argument).
   */
  getFrameForAction?: (action: VLAAction) => Promise<Blob | null>;
  grabFrame?: () => Promise<Blob | null>;
  /** Max retry attempts per step when the observer recommends retry. Defaults to 1. */
  maxRetries?: number;
}

/**
 * Execute a plan sequentially over serial with closed-loop position + vision.
 *
 *  - Sends each action over serial, waits for OK/ERR/timeout.
 *  - After actions in `observeAfter`, grabs a camera frame and asks Claude to verify.
 *  - If the observer recommends retry, re-executes the step (bounded by maxRetries).
 *  - If the observer recommends abort, halts the plan.
 */
export async function executePlan(actions: VLAAction[], opts: ExecuteOpts = {}): Promise<void> {
  const {
    onEvent,
    waitForOk = true,
    stepTimeoutMs = 8000,
    interStepDelayMs = 150,
    abortSignal,
    observeAfter = ["pick", "place", "release"],
    getFrameForAction,
    grabFrame,
    maxRetries = 1,
  } = opts;

  // Unified frame resolver: prefer per-action callback, fall back to grabFrame, then null.
  const resolveFrame = async (a: VLAAction): Promise<Blob | null> => {
    if (getFrameForAction) {
      try { return await getFrameForAction(a); } catch { return null; }
    }
    if (grabFrame) {
      try { return await grabFrame(); } catch { return null; }
    }
    return null;
  };

  if (getSerialStatus() !== "connected") {
    onEvent?.({ kind: "error", index: -1, message: "Robot not connected." });
    return;
  }

  onEvent?.({ kind: "start", total: actions.length });

  for (let i = 0; i < actions.length; i++) {
    if (abortSignal?.aborted) {
      onEvent?.({ kind: "aborted", index: i });
      return;
    }

    const a = actions[i];
    const line = actionToSerialLine(a);
    let attempt = 0;
    let stepDone = false;

    while (!stepDone) {
      attempt += 1;
      if (attempt > maxRetries + 1) {
        onEvent?.({ kind: "error", index: i, message: `Step gave up after ${maxRetries + 1} attempts.` });
        return;
      }

      // ── 1. Send the command, watch for the robot's response ────────────
      const waiter = waitForOk ? waitForResponse(stepTimeoutMs) : null;
      const abortListener = () => waiter?.cancel();
      if (abortSignal && waiter) abortSignal.addEventListener("abort", abortListener, { once: true });

      try {
        await sendSerialCommand(line);
      } catch (e) {
        waiter?.cancel();
        onEvent?.({ kind: "error", index: i, message: e instanceof Error ? e.message : "send failed" });
        return;
      }

      onEvent?.({ kind: "step", index: i, total: actions.length, line, action: a, attempt });

      let robotReport = "";
      if (waiter) {
        const result = await waiter.promise;
        if (abortSignal) abortSignal.removeEventListener("abort", abortListener);
        if (abortSignal?.aborted) { onEvent?.({ kind: "aborted", index: i }); return; }
        if (result.kind === "ok") {
          robotReport = result.line || "OK";
          onEvent?.({ kind: "response", index: i, total: actions.length, ok: true, line: result.line });
        } else if (result.kind === "err") {
          onEvent?.({ kind: "response", index: i, total: actions.length, ok: false, line: result.line });
          onEvent?.({ kind: "error", index: i, message: `Robot reported: ${result.line}` });
          return;
        } else {
          robotReport = "(no ack)";
          onEvent?.({ kind: "timeout", index: i, total: actions.length });
        }
      }

      // ── 2. Optional camera feedback for critical actions ───────────────
      const shouldObserve = observeAfter.includes(a.action) && (!!getFrameForAction || !!grabFrame);
      if (!shouldObserve) {
        stepDone = true;
      } else {
        onEvent?.({ kind: "observe_start", index: i });
        const frame = await resolveFrame(a);

        if (!frame) {
          onEvent?.({ kind: "observe_skip", index: i, reason: "no camera frame available" });
          stepDone = true;
        } else {
          const obs = await observeStep(actionDescription(a), robotReport, frame);
          if (!obs.ok) {
            // Observer error — treat as skip, don't block the plan
            onEvent?.({ kind: "observe_skip", index: i, reason: obs.error });
            stepDone = true;
          } else {
            onEvent?.({
              kind: "observe_result",
              index: i,
              verified: obs.verified,
              observation: obs.observation,
              recommendation: obs.recommendation,
              confidence: obs.confidence,
            });
            if (obs.recommendation === "abort") {
              onEvent?.({ kind: "error", index: i, message: `Observer aborted: ${obs.observation}` });
              return;
            }
            if (obs.recommendation === "retry" && attempt <= maxRetries) {
              onEvent?.({ kind: "retry", index: i, attempt });
              // Loop again — re-execute the same step
              continue;
            }
            // "continue" or "retry" exhausted → move on
            stepDone = true;
          }
        }
      }
    }

    // ── 3. Inter-step pacing ───────────────────────────────────────────
    if (i < actions.length - 1 && interStepDelayMs > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, interStepDelayMs);
        if (abortSignal) abortSignal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
  }

  if (abortSignal?.aborted) { onEvent?.({ kind: "aborted", index: actions.length }); return; }
  onEvent?.({ kind: "done" });
}
