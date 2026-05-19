// WebSerial wrapper for ESP32 communication.
//
// Browser support: Chromium-based browsers (Chrome, Edge, Brave) on desktop.
// Requires HTTPS (the deployed site is HTTPS) or localhost.
// Not supported on Firefox/Safari/mobile.
//
// Protocol expected by your ESP32 firmware (you implement this on the embedded side):
//   - Baud rate: 115200, 8N1
//   - Commands are newline-terminated ASCII
//   - Common verbs:
//       MOVE X<mm> Y<mm> Z<mm> R<deg>   move end-effector to absolute position
//       PICK / PLACE / RELEASE          gripper open/close
//       HOME                            return to home position
//       STOP                            emergency stop
//       ROTATE <deg>                    rotate end-effector
//       SCAN / DETECT / ALIGN / VALIDATE  task verbs
//   - Responses expected on serial (any line is fine):
//       OK / ERR <msg> / READY / DONE / POS_OK / PICK_OK / PLACE_OK / etc.
//
// Every successful send fires a `pcb:robot-command` CustomEvent on window,
// which teach.ts hooks into for recording LeRobot demonstration episodes.
// NO imports from "@/lib/lerobot" or similar — the integration is event-based.

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
        lineSubscribers.forEach((fn) => { try { fn(trimmed); } catch {} });
      }
    }
  } catch {
    // stream closed
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

/** Send a single line to the robot, newline appended. Fires "pcb:robot-command" on window. */
export async function sendSerialCommand(cmd: string): Promise<void> {
  if (!writer) throw new Error("Robot not connected. Click the badge to connect first.");
  await writer.write(cmd + "\n");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pcb:robot-command", {
      detail: { command: cmd, timestamp: Date.now() },
    }));
  }
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
