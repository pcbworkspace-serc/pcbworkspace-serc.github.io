/**
 * binScan â€” capture a frame from the top camera, run detection, and convert
 * pixel-space bounding boxes to world-mm coordinates.
 *
 * Returns a map keyed by component type with a list of world positions where
 * that type was detected. Used by useRobotPlacement to find a real pickup
 * location instead of a hardcoded one.
 *
 * Backend: calls existing /nn/detect endpoint. No new backend work required.
 * (When calibration backend lands, swap pixelToWorld for the real homography.)
 */
import { grabCameraFrame } from "@/components/CameraFeed";
import { bboxCenterToWorld, type WorldPoint } from "@/lib/pixelToWorld";

const NN_BASE = (import.meta.env.VITE_NN_URL as string | undefined) ?? "http://localhost:5000";

export interface DetectedInstance {
  type: string;
  world: WorldPoint;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface BinScanResult {
  ok: boolean;
  error?: string;
  instances: DetectedInstance[];
  imageSize: { width: number; height: number } | null;
  capturedAt: number;
}

interface DetectResponseBox {
  class_name: string;
  class_idx: number;
  confidence: number;
  bbox: [number, number, number, number];
}

interface DetectResponse {
  boxes?: DetectResponseBox[];
  detections?: DetectResponseBox[];
  image_width?: number;
  image_height?: number;
  inference_ms?: number;
}

async function decodeBlobSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 640, height: 480 });
    };
    img.src = url;
  });
}

export async function scanBins(): Promise<BinScanResult> {
  const capturedAt = Date.now();
  const frame = await grabCameraFrame();
  if (!frame) {
    return { ok: false, error: "No camera frame available", instances: [], imageSize: null, capturedAt };
  }
  const size = await decodeBlobSize(frame);
  try {
    const form = new FormData();
    form.append("image", frame, "scan.jpg");
    const res = await fetch(`${NN_BASE}/nn/detect`, { method: "POST", body: form });
    if (!res.ok) {
      return { ok: false, error: `Detect failed: ${res.status}`, instances: [], imageSize: size, capturedAt };
    }
    const data = (await res.json()) as DetectResponse;
    const rawBoxes = data.boxes ?? data.detections ?? [];
    const instances: DetectedInstance[] = await Promise.all(
      rawBoxes.map(async (b) => ({
        type: b.class_name,
        confidence: b.confidence,
        bbox: b.bbox,
        world: await bboxCenterToWorld(b.bbox, size.width, size.height),
      })),
    );
    return { ok: true, instances, imageSize: size, capturedAt };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, instances: [], imageSize: size, capturedAt };
  }
}

/** Pick a specific instance for a given type. Returns null if none visible. */
export function findInstance(result: BinScanResult, type: string): DetectedInstance | null {
  const matches = result.instances.filter((i) => i.type === type);
  if (matches.length === 0) return null;
  // Highest confidence first
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches[0];
}