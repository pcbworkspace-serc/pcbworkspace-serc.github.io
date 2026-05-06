/**
 * Typed client for the Flask /robot/* and /camera/* endpoints.
 *
 * Auth: every request attaches a shared-secret Bearer token. The token
 * comes from VITE_ROBOT_TOKEN at build time. The same value must be set
 * as SERC_ROBOT_TOKEN on the Flask backend.
 *
 * MJPEG streams: <img> tags can't set headers, so the stream URL embeds
 * the token as ?access_token=... — the backend middleware accepts both.
 */
import { ROBOT_BASE_URL } from "@/lib/robotConfig";

const ROBOT_TOKEN = (import.meta.env.VITE_ROBOT_TOKEN as string | undefined) ?? "";

if (!ROBOT_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn(
    "[robotClient] VITE_ROBOT_TOKEN not set; robot/camera endpoints will return 401.",
  );
}

export type RobotStatus = {
  connected: boolean;
  estopped: boolean;
  moving: boolean;
  joints_deg: [number, number, number, number];
  current_xyz: [number, number, number] | null;
  encoders: Record<string, number>;
  last_event: string | null;
  calibrated: { camera: boolean; workspace: boolean };
  config: { L1: number; L2: number; shoulder_h: number; nozzle_offset: number };
};

export type ChatExecEntry = {
  line: string;
  ok: boolean;
  error: string | null;
  result: unknown;
};

export type ChatResponse = {
  executed: ChatExecEntry[];
  halted_on_error: boolean;
};

async function _request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (ROBOT_TOKEN) headers.set("Authorization", `Bearer ${ROBOT_TOKEN}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const r = await fetch(`${ROBOT_BASE_URL}${path}`, { ...init, headers });
  if (!r.ok) {
    let body: { error?: string } = {};
    try { body = await r.json(); } catch { /* ignore */ }
    throw new Error(body.error || `${r.status} ${r.statusText}`);
  }
  return r.json() as Promise<T>;
}

export const robotClient = {
  status: () => _request<RobotStatus>("/robot/status"),
  home:   () => _request<{ ok: boolean }>("/robot/home", { method: "POST" }),
  estop:  () => _request<{ ok: boolean }>("/robot/estop", { method: "POST" }),
  reset:  () => _request<{ ok: boolean }>("/robot/reset", { method: "POST" }),

  command: (cmd: Record<string, unknown>) =>
    _request<{ ok: boolean; result?: unknown; error?: string }>(
      "/robot/command",
      { method: "POST", body: JSON.stringify(cmd) },
    ),

  chat: (text: string, nl = false) =>
    // Default nl=false because Layla owns natural-language Q&A; the robot
    // chat is for direct structured commands (move/pick/home/etc).
    _request<ChatResponse>("/robot/chat", {
      method: "POST",
      body: JSON.stringify({ text, nl }),
    }),

  placeAt: (
    x_pcb: number,
    y_pcb: number,
    opts: { wrist?: number; pick_from?: { x: number; y: number; z: number } } = {},
  ) =>
    _request<{ ok: boolean; robot_xyz?: [number, number, number]; error?: string }>(
      "/robot/place_at",
      {
        method: "POST",
        body: JSON.stringify({ x_pcb, y_pcb, ...opts }),
      },
    ),

  calibrateCamera: (
    pixelPts: [number, number][],
    pcbPts: [number, number][],
  ) =>
    _request<{ ok: boolean; error?: string }>("/robot/calibrate/camera", {
      method: "POST",
      body: JSON.stringify({ pixel_pts: pixelPts, pcb_pts: pcbPts }),
    }),

  calibrateWorkspace: (
    pcbPts: [number, number][],
    robotPts: [number, number, number][],
  ) =>
    _request<{ ok: boolean; error?: string }>("/robot/calibrate/workspace", {
      method: "POST",
      body: JSON.stringify({ pcb_pts: pcbPts, robot_pts: robotPts }),
    }),

  /** MJPEG stream URL with token as query param (since <img> can't set headers). */
  cameraStreamUrl: (name: "top" | "bottom") =>
    `${ROBOT_BASE_URL}/camera/${name}/stream?access_token=${encodeURIComponent(ROBOT_TOKEN)}`,

  /** Single still frame for calibration (uses Authorization header). */
  cameraFrame: async (name: "top" | "bottom"): Promise<Blob> => {
    const headers: Record<string, string> = {};
    if (ROBOT_TOKEN) headers["Authorization"] = `Bearer ${ROBOT_TOKEN}`;
    const r = await fetch(`${ROBOT_BASE_URL}/camera/${name}/frame`, { headers });
    if (!r.ok) throw new Error(`camera frame: ${r.status}`);
    return r.blob();
  },
};
