/**
 * Robot Command Client - Flask Backend Version
 */

const FLASK_BASE = "http://127.0.0.1:5000";
const REQUEST_TIMEOUT_MS = 30000;

export interface PlaceTarget {
  type: string;
  x: number;
  y: number;
  rotation_deg?: number;
}

export interface PlaceResult {
  status: "placed" | "queued_offline" | "rejected" | "error";
  message: string;
  commandId?: string;
  errors?: string[];
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${FLASK_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function commandPlace(target: PlaceTarget): Promise<PlaceResult> {
  try {
    const SCENE_TO_MM = 10;
    const targetXMm = target.x * SCENE_TO_MM;
    const targetYMm = target.y * SCENE_TO_MM;

    const resp = await postJSON<any>("/robot/place", {
      component_type: target.type,
      target_x_mm: targetXMm,
      target_y_mm: targetYMm,
      target_theta_deg: target.rotation_deg ?? 0.0,
    });

    if (!resp.accepted) {
      const errorMsg = resp.errors?.join("; ") || "Robot rejected placement";
      return {
        status: "rejected",
        message: `Placement rejected: ${errorMsg}`,
        commandId: resp.command_id,
        errors: resp.errors,
      };
    }

    return {
      status: "placed",
      message: `✓ Placed ${target.type} at (${targetXMm.toFixed(1)}, ${targetYMm.toFixed(1)}) mm`,
      commandId: resp.command_id,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      status: "queued_offline",
      message: `Flask server unreachable: ${errMsg}. Queued locally.`,
    };
  }
}

export async function checkFlaskHealth() {
  try {
    return await postJSON<any>("/health", {});
  } catch {
    return null;
  }
}