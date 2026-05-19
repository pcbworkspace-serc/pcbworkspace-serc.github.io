// VLA (Vision-Language-Action) client — Sprint 7 (closed-loop).
//
// Sends a natural-language instruction (plus current board state and an
// optional camera frame) to the local Flask /vla/plan endpoint and gets
// back an ordered list of robot actions.
//
// Sprint 7 change: the executor now WAITS for an OK / ERR / READY line
// from the ESP32 between steps (closed-loop). If ERR, execution halts and
// the error surfaces in the UI. If the firmware never echoes OK, the step
// times out after stepTimeoutMs and execution continues (so old firmware
// without acknowledgements still works — just with no safety net).

import { sendSerialCommand, getSerialStatus, onSerialLine } from "@/lib/serial";

const VLA_ENDPOINT = "http://127.0.0.1:5000/vla/plan";

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

    const res = await fetch(VLA_ENDPOINT, {
      method: "POST", headers, body, signal: AbortSignal.timeout(30000),
    });

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

/**
 * Wait for the next OK / ERR / READY line from the ESP32, or timeout.
 * Subscribes BEFORE the caller sends a command so there's no race.
 */
function waitForResponse(timeoutMs: number): {
  promise: Promise<{ kind: "ok" | "err" | "timeout"; line: string }>;
  cancel: () => void;
} {
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
      if (upper === "OK" || upper.startsWith("OK ") ||
          upper === "READY" || upper === "DONE") {
        finish({ kind: "ok", line });
      } else if (upper.startsWith("ERR")) {
        finish({ kind: "err", line });
      }
      // Ignore everything else (position updates, debug prints, etc.)
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
  | { kind: "step"; index: number; total: number; line: string; action: VLAAction }
  | { kind: "response"; index: number; total: number; ok: boolean; line: string }
  | { kind: "timeout"; index: number; total: number }
  | { kind: "done" }
  | { kind: "error"; index: number; message: string }
  | { kind: "aborted"; index: number };

/**
 * Execute a plan sequentially over serial, waiting for acknowledgement after each step.
 */
export async function executePlan(
  actions: VLAAction[],
  opts: {
    onEvent?: (e: StepEvent) => void;
    waitForOk?: boolean;
    stepTimeoutMs?: number;
    interStepDelayMs?: number;
    abortSignal?: AbortSignal;
  } = {},
): Promise<void> {
  const {
    onEvent,
    waitForOk = true,
    stepTimeoutMs = 8000,
    interStepDelayMs = 150,
    abortSignal,
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

    // Subscribe BEFORE sending — avoids the race where the robot answers
    // faster than we install the listener.
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

    onEvent?.({ kind: "step", index: i, total: actions.length, line, action: a });

    if (waiter) {
      const result = await waiter.promise;
      if (abortSignal) abortSignal.removeEventListener("abort", abortListener);

      if (abortSignal?.aborted) {
        onEvent?.({ kind: "aborted", index: i });
        return;
      }

      if (result.kind === "ok") {
        onEvent?.({ kind: "response", index: i, total: actions.length, ok: true, line: result.line });
      } else if (result.kind === "err") {
        onEvent?.({ kind: "response", index: i, total: actions.length, ok: false, line: result.line });
        onEvent?.({ kind: "error", index: i, message: `Robot reported: ${result.line}` });
        return;
      } else {
        onEvent?.({ kind: "timeout", index: i, total: actions.length });
      }
    }

    if (i < actions.length - 1 && interStepDelayMs > 0) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, interStepDelayMs);
        if (abortSignal) abortSignal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }
  }

  if (abortSignal?.aborted) {
    onEvent?.({ kind: "aborted", index: actions.length });
    return;
  }
  onEvent?.({ kind: "done" });
}
