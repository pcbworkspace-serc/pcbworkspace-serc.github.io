// WebSerial wrapper for ESP32 SCARA communication.
//
// Browser support: Chromium-based browsers (Chrome, Edge, Brave) on desktop.
// Requires HTTPS (the deployed site is HTTPS) or localhost.

import { tapOutgoing, tapIncoming } from "@/lib/lerobot";

const BAUD_RATE = 115200;

export type SerialStatus = "disconnected" | "connecting" | "connected";

let port: any = null;
let writer: WritableStreamDefaultWriter<string> | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let currentStatus: SerialStatus = "disconnected";

const lineSubscribers = new Set<(line: string) => void>();
const statusSubscribers = new Set<(s: SerialStatus) => void>();

function setStatus(s: SerialStatus) {
  currentStatus = s;
  statusSubscribers.forEach((fn) => { try { fn(s); } catch {} });
}

export function getSerialStatus(): SerialStatus { return currentStatus; }

export function onSerialStatus(cb: (s: SerialStatus) => void): () => void {
  statusSubscribers.add(cb);
  try { cb(currentStatus); } catch {}
  return () => { statusSubscribers.delete(cb); };
}

export function onSerialLine(cb: (line: string) => void): () => void {
  lineSubscribers.add(cb);
  return () => { lineSubscribers.delete(cb); };
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in (navigator as any);
}

export async function connectRobot(): Promise<void> {
  if (!isWebSerialSupported()) {
    throw new Error("WebSerial not supported. Use Chrome, Edge, or another Chromium browser.");
  }
  if (port) return;
  setStatus("connecting");
  try {
    port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: BAUD_RATE });

    const encoder = new TextEncoderStream();
    encoder.readable.pipeTo(port.writable).catch(() => {});
    writer = encoder.writable.getWriter();

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => {});
    reader = decoder.readable.getReader();

    setStatus("connected");
    readLoop();
  } catch (e) {
    await safeClose();
    setStatus("disconnected");
    throw e;
  }
}

async function readLoop() {
  let buffer = "";
  try {
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Tap for the LeRobot recorder — silent unless an episode is active
        try { tapIncoming(trimmed); } catch {}
        lineSubscribers.forEach((fn) => { try { fn(trimmed); } catch {} });
      }
    }
  } catch {
  } finally {
    await safeClose();
    setStatus("disconnected");
  }
}

async function safeClose() {
  try { reader?.releaseLock(); } catch {}
  reader = null;
  try { await writer?.close(); } catch {}
  writer = null;
  try { await port?.close(); } catch {}
  port = null;
}

export async function disconnectRobot(): Promise<void> {
  try { await reader?.cancel(); } catch {}
  await safeClose();
  setStatus("disconnected");
}

export async function sendSerialCommand(cmd: string): Promise<void> {
  if (!writer) throw new Error("Robot not connected. Click the badge to connect first.");
  await writer.write(cmd + "\n");
  // Tap for the LeRobot recorder — silent unless an episode is active
  try { tapOutgoing(cmd); } catch {}
}

export function robotCmdToSerialLine(cmd: any): string {
  if (!cmd || typeof cmd !== "object") return "";
  const action = String(cmd.action ?? "").toLowerCase();
  switch (action) {
    case "move":
    case "goto": {
      const x = cmd.x_mm ?? cmd.x ?? 0;
      const y = cmd.y_mm ?? cmd.y ?? 0;
      const z = cmd.z_mm ?? cmd.z ?? 0;
      const r = cmd.rotation_deg ?? cmd.r ?? 0;
      return `MOVE X${x} Y${y} Z${z} R${r}`;
    }
    case "pick":     return "PICK";
    case "place":    return "PLACE";
    case "release":  return "RELEASE";
    case "home":     return "HOME";
    case "stop":     return "STOP";
    case "rotate": {
      const deg = cmd.degrees ?? cmd.rotation_deg ?? 90;
      return `ROTATE ${deg}`;
    }
    case "scan":     return "SCAN";
    case "detect":   return "DETECT";
    case "align":    return "ALIGN";
    case "validate": return "VALIDATE";
    default:         return `CMD ${JSON.stringify(cmd)}`;
  }
}

if (typeof window !== "undefined") {
  (window as any).__sendRobotSerial = async (cmd: any) => {
    const line = robotCmdToSerialLine(cmd);
    await sendSerialCommand(line);
    return line;
  };
  (window as any).__robotSerialStatus = getSerialStatus;
}
