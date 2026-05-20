// Sprint 9 — multi-camera capture with role-based routing.
//
// Your hardware has two USB cameras:
//   - "top"    looks DOWN at the PCB (fiducial alignment, placement verification)
//   - "bottom" looks UP at the nozzle (pick verification, part inspection)
//
// This module captures a single still frame from either camera on demand,
// independent of whatever the live CameraFeed component is doing in the UI.
//
// Device selection:
//   1. localStorage override:  pcb.camera.top / pcb.camera.bottom = <deviceId>
//   2. Label heuristic:        device labels containing "top"/"down"/"overhead"
//                              vs "bottom"/"up"/"nozzle"
//   3. Fallback:               first two video devices, top = index 0, bottom = 1
//
// To explicitly assign cameras (run once in the browser console):
//   await window.__assignCamera('top',    '<deviceId>')
//   await window.__assignCamera('bottom', '<deviceId>')
// Use window.__listCameras() to get the deviceIds + labels.

export type CameraRole = "top" | "bottom";

const LS_KEY_TOP = "pcb.camera.top";
const LS_KEY_BOTTOM = "pcb.camera.bottom";
const CAPTURE_SETTLE_MS = 250;  // let the first frame stabilize

// Cached open streams, keyed by deviceId — reused across captures.
const openStreams = new Map<string, MediaStream>();

interface DeviceInfo {
  deviceId: string;
  label: string;
}

/** Probe all video input devices. Requires the user to have granted camera permission once. */
export async function listVideoDevices(): Promise<DeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    // Some browsers hide labels until permission is granted — request a tiny probe stream
    // if we have no labels at all.
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videos = devices.filter((d) => d.kind === "videoinput");
    const labelsHidden = videos.length > 0 && videos.every((d) => !d.label);
    if (labelsHidden) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true });
        probe.getTracks().forEach((t) => t.stop());
        devices = await navigator.mediaDevices.enumerateDevices();
        videos = devices.filter((d) => d.kind === "videoinput");
      } catch {
        // permission denied or unavailable — return what we have
      }
    }
    return videos.map((d) => ({ deviceId: d.deviceId, label: d.label || `(unnamed ${d.deviceId.slice(0, 6)})` }));
  } catch {
    return [];
  }
}

const TOP_HINTS = /\b(top|overhead|down|pcb|fiducial|board)\b/i;
const BOTTOM_HINTS = /\b(bottom|nozzle|up|upward|part|tip)\b/i;

/** Pick which deviceId should be used for a role, using overrides + heuristics + fallback. */
export async function resolveDeviceId(role: CameraRole): Promise<string | null> {
  const override = localStorage.getItem(role === "top" ? LS_KEY_TOP : LS_KEY_BOTTOM);
  if (override) return override;

  const devices = await listVideoDevices();
  if (devices.length === 0) return null;

  const hints = role === "top" ? TOP_HINTS : BOTTOM_HINTS;
  const negHints = role === "top" ? BOTTOM_HINTS : TOP_HINTS;

  // Prefer a device whose label matches the role's hints AND doesn't match the other's
  const matched = devices.find((d) => hints.test(d.label) && !negHints.test(d.label));
  if (matched) return matched.deviceId;

  // Fallback: first device for top, second for bottom (if it exists)
  if (role === "top") return devices[0].deviceId;
  return devices[1]?.deviceId ?? devices[0].deviceId;
}

/** Open a stream for a deviceId, caching for reuse. */
async function getOrOpenStream(deviceId: string): Promise<MediaStream> {
  const existing = openStreams.get(deviceId);
  if (existing && existing.active) return existing;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  openStreams.set(deviceId, stream);
  // First frame can be black — let it warm up
  await new Promise((r) => setTimeout(r, CAPTURE_SETTLE_MS));
  return stream;
}

/**
 * Capture one still frame from the camera assigned to `role`.
 * Returns null if no camera is available for that role.
 */
export async function captureFrameByRole(role: CameraRole): Promise<Blob | null> {
  const deviceId = await resolveDeviceId(role);
  if (!deviceId) return null;

  try {
    const stream = await getOrOpenStream(deviceId);
    return await grabFrameFromStream(stream);
  } catch {
    return null;
  }
}

async function grabFrameFromStream(stream: MediaStream): Promise<Blob | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;

  // Use ImageCapture if available (faster, no canvas roundtrip)
  if (typeof (window as any).ImageCapture !== "undefined") {
    try {
      const ic = new (window as any).ImageCapture(track);
      const bitmap = await ic.grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
      );
    } catch {
      // Fall through to <video> path
    }
  }

  // Fallback: <video> element + canvas
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play().catch(() => {});
  // Wait for video to have dimensions
  let tries = 0;
  while ((video.videoWidth === 0 || video.videoHeight === 0) && tries < 20) {
    await new Promise((r) => setTimeout(r, 50));
    tries += 1;
  }
  if (video.videoWidth === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
  );
}

/** Manually assign a deviceId to a role. Persisted in localStorage. */
export function assignCamera(role: CameraRole, deviceId: string): void {
  localStorage.setItem(role === "top" ? LS_KEY_TOP : LS_KEY_BOTTOM, deviceId);
}

/** Forget the override for a role (revert to heuristic). */
export function clearCameraAssignment(role: CameraRole): void {
  localStorage.removeItem(role === "top" ? LS_KEY_TOP : LS_KEY_BOTTOM);
}

/** Close all cached streams. Call on page unload or when you want to free hardware. */
export function disposeAll(): void {
  for (const s of openStreams.values()) {
    s.getTracks().forEach((t) => t.stop());
  }
  openStreams.clear();
}

// ── Convenience globals for ad-hoc browser-console camera assignment ─────────
if (typeof window !== "undefined") {
  (window as any).__listCameras = async () => {
    const devs = await listVideoDevices();
    console.table(devs);
    return devs;
  };
  (window as any).__assignCamera = (role: CameraRole, deviceId: string) => {
    assignCamera(role, deviceId);
    console.log(`Assigned ${role} → ${deviceId}`);
  };
  (window as any).__clearCamera = (role: CameraRole) => clearCameraAssignment(role);
  // Tidy up streams on unload
  window.addEventListener("beforeunload", disposeAll);
}
