/**
 * pixelToWorld — maps camera pixel coordinates to PCB-mm world coordinates.
 *
 * Strategy:
 *   1. On app load, fetch saved homography from backend GET /calibration/get
 *   2. If present, apply the 3x3 matrix to every pixel
 *   3. If absent (calibration never run, or backend offline), fall back to
 *      a hardcoded planar assumption so the app still works for demos
 *
 * When the backend ships /calibration/save (run by CalibrationModal) and
 * /calibration/get, this module starts returning real-world coords with
 * no other code changes needed.
 */
export interface PixelPoint { x: number; y: number; }
export interface WorldPoint { x_mm: number; y_mm: number; }

// 3x3 row-major matrix [[a,b,c],[d,e,f],[g,h,i]]
export type Homography = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

const NN_BASE = (import.meta.env.VITE_NN_URL as string | undefined) ?? "http://localhost:5000";

// Placeholder constants for when calibration is not available.
// Replace by running CalibrationModal once the backend endpoint ships.
const FALLBACK_WORKSPACE_WIDTH_MM = 120;
const FALLBACK_WORKSPACE_HEIGHT_MM = 90;

// Cached homography, loaded lazily on first call
let cachedHomography: Homography | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // re-check every minute in case user just calibrated

async function fetchHomography(): Promise<Homography | null> {
  const now = Date.now();
  if (cachedHomography && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedHomography;
  }
  try {
    const res = await fetch(`${NN_BASE}/calibration/get`, { method: "GET" });
    if (!res.ok) {
      // 404 = no calibration saved yet, treat as no homography
      cachedHomography = null;
      cacheTimestamp = now;
      return null;
    }
    const data = (await res.json()) as { homography?: number[][] };
    if (data.homography && data.homography.length === 3) {
      cachedHomography = data.homography as Homography;
      cacheTimestamp = now;
      return cachedHomography;
    }
    return null;
  } catch {
    // Backend offline or unreachable
    return null;
  }
}

/** Force re-fetch on next call. Call after a successful calibration save. */
export function invalidateHomographyCache(): void {
  cachedHomography = null;
  cacheTimestamp = 0;
}

function applyHomography(H: Homography, p: PixelPoint): WorldPoint {
  // [x', y', w'] = H * [x, y, 1]
  // world = [x' / w', y' / w']
  const x = p.x, y = p.y;
  const xp = H[0][0] * x + H[0][1] * y + H[0][2];
  const yp = H[1][0] * x + H[1][1] * y + H[1][2];
  const w  = H[2][0] * x + H[2][1] * y + H[2][2];
  return { x_mm: xp / w, y_mm: yp / w };
}

function fallbackTransform(
  p: PixelPoint,
  imageWidth: number,
  imageHeight: number,
): WorldPoint {
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const scaleX = FALLBACK_WORKSPACE_WIDTH_MM / imageWidth;
  const scaleY = FALLBACK_WORKSPACE_HEIGHT_MM / imageHeight;
  return {
    x_mm: (p.x - cx) * scaleX,
    y_mm: -(p.y - cy) * scaleY, // flip Y (image Y grows down, world Y grows up)
  };
}

/** Async pixel-to-world. Uses calibrated homography if available, else fallback. */
export async function pixelToWorld(
  pixel: PixelPoint,
  imageWidth: number,
  imageHeight: number,
): Promise<WorldPoint> {
  const H = await fetchHomography();
  if (H) return applyHomography(H, pixel);
  return fallbackTransform(pixel, imageWidth, imageHeight);
}

/** Async bbox-center-to-world. Convenience wrapper. */
export async function bboxCenterToWorld(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): Promise<WorldPoint> {
  const [x, y, w, h] = bbox;
  return pixelToWorld({ x: x + w / 2, y: y + h / 2 }, imageWidth, imageHeight);
}

/** Synchronous probe: is calibration currently loaded? Useful for UI badges. */
export function hasCalibration(): boolean {
  return cachedHomography !== null;
}