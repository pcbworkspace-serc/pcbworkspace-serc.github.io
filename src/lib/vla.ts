// VLA (Vision-Language-Action) client — Sprint 8 (camera feedback loop).
//
// Sprint 7 made execution wait for OK/ERR per step (closed-loop position).
// Sprint 8 adds VISUAL verification after critical actions:
//
//   After a PLACE (or PICK), the executor optionally grabs a fresh camera
//   frame and asks Claude: "Did that work? continue / retry / abort?"
//
// This is genuine closed-loop vision on top of the AS5048A encoder feedback
// the hardware already provides. The encoders confirm the arm went where it
// was told; the camera confirms the WORLD ended up as expected.

import { sendSerialCommand, getSerialStatus, onSerialLine } from "@/lib/serial";

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

export async function planAction(
  instruction: string,
  boardState: BoardStateItem[],
  cameraFrame?: Blob | null,
): Promise<VLAPlan | VLAError> {
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
      return { ok: false, error: "Couldn't reach 127.0.0.1:5000. Is your local Flask server running with the VLA route registered?" };
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
  /** Function that returns a fresh camera frame Blob (or null) for visual verification. */
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
    grabFrame,
    maxRetries = 1,
  } = opts;

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
      const shouldObserve = observeAfter.includes(a.action) && !!grabFrame;
      if (!shouldObserve) {
        stepDone = true;
      } else {
        onEvent?.({ kind: "observe_start", index: i });
        let frame: Blob | null = null;
        try { frame = await grabFrame!(); } catch {}

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
