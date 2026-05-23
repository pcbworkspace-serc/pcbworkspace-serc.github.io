// WebSerial wrapper for ESP32 communication, with built-in Demo Mode.
//
// Demo Mode: when enabled, the app pretends a robot is connected and
// generates realistic responses (POS_OK, PICK_OK, PLACE_OK, etc.) in the
// background. Lets you demo the full pipeline â€” chat, VLA planning,
// teach mode, telemetry â€” without any hardware plugged in.
//
// Real mode: requires Chromium browser + WebSerial + actual USB device.

const BAUD_RATE = 115200;

export type SerialStatus = "disconnected" | "connecting" | "connected";

let port: any = null;
let writer: WritableStreamDefaultWriter<string> | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let currentStatus: SerialStatus = "disconnected";
let demoMode = false;
let simulatedPosition = { x: 0, y: 0, z: 0, r: 0 };

const lineSubscribers = new Set<(line: string) => void>();
const statusSubscribers = new Set<(s: SerialStatus) => void>();

function setStatus(s: SerialStatus) {
  currentStatus = s;
  statusSubscribers.forEach((fn) => { try { fn(s); } catch {} });
}

export function emitLine(line: string) {
  lineSubscribers.forEach((fn) => { try { fn(line); } catch {} });
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

// â”€â”€â”€ Demo Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function isDemoMode(): boolean { return demoMode; }

export function enableDemoMode(): void {
  if (demoMode) return;
  demoMode = true;
  setStatus("connected");
  // Send a READY line so subscribers know "the robot booted"
  setTimeout(() => emitLine("READY"), 100);
  setTimeout(() => emitLine("VAC 0.0 kpa"), 200);
}

export function disableDemoMode(): void {
  if (!demoMode) return;
  demoMode = false;
  setStatus("disconnected");
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

/** Generate realistic responses for a simulated robot. */
async function simulateCommand(line: string): Promise<void> {
  const trimmed = line.trim();
  const verb = trimmed.split(/\s+/)[0]?.toUpperCase() ?? "";

  // MOVE X Y Z R
  if (verb === "MOVE") {
    const m = trimmed.match(/^MOVE\s+X(-?\d+(?:\.\d+)?)\s+Y(-?\d+(?:\.\d+)?)\s+Z(-?\d+(?:\.\d+)?)\s+R(-?\d+(?:\.\d+)?)/i);
    if (!m) { await sleep(50); emitLine("ERR bad_syntax"); return; }
    const tx = parseFloat(m[1]), ty = parseFloat(m[2]), tz = parseFloat(m[3]), tr = parseFloat(m[4]);
    emitLine("BUSY");
    // Animate position over ~600ms with a few intermediate POS lines
    const steps = 4;
    const startX = simulatedPosition.x, startY = simulatedPosition.y, startZ = simulatedPosition.z;
    for (let i = 1; i <= steps; i++) {
      await sleep(150);
      const t = i / steps;
      const ix = startX + (tx - startX) * t;
      const iy = startY + (ty - startY) * t;
      const iz = startZ + (tz - startZ) * t;
      if (i < steps) emitLine(`POS X${ix.toFixed(2)} Y${iy.toFixed(2)} Z${iz.toFixed(2)}`);
    }
    simulatedPosition = { x: tx, y: ty, z: tz, r: tr };
    emitLine(`POS_OK X${tx.toFixed(2)} Y${ty.toFixed(2)} Z${tz.toFixed(2)} R${tr.toFixed(1)}`);
    return;
  }

  // ROTATE <deg>
  if (verb === "ROTATE") {
    const m = trimmed.match(/^ROTATE\s+(-?\d+(?:\.\d+)?)/i);
    if (!m) { await sleep(50); emitLine("ERR bad_syntax"); return; }
    simulatedPosition.r = parseFloat(m[1]);
    await sleep(250);
    emitLine(`OK rotate ${simulatedPosition.r.toFixed(1)}`);
    return;
  }

  // HOME
  if (verb === "HOME") {
    emitLine("BUSY");
    await sleep(800);
    simulatedPosition = { x: 0, y: 0, z: 0, r: 0 };
    emitLine("POS_OK X0.00 Y0.00 Z0.00 R0.0");
    return;
  }

  // PICK â€” random part weight between 0.1 and 0.4 g
  if (verb === "PICK") {
    await sleep(150);
    emitLine("VAC -78.3 kpa");
    await sleep(150);
    const weight = (0.1 + Math.random() * 0.3).toFixed(2);
    emitLine(`PICK_OK ${weight}g`);
    return;
  }

  // PLACE / RELEASE
  if (verb === "PLACE" || verb === "RELEASE") {
    await sleep(200);
    emitLine("VAC 0.5 kpa");
    await sleep(150);
    emitLine("PLACE_OK");
    return;
  }

  if (verb === "STOP") { await sleep(20); emitLine("OK halted"); return; }

  // Reserved no-op verbs
  if (["SCAN", "DETECT", "ALIGN", "VALIDATE"].includes(verb)) {
    await sleep(200);
    emitLine(`OK ${verb.toLowerCase()}_complete`);
    return;
  }

  await sleep(50);
  emitLine(`ERR unknown_command_${verb.toLowerCase()}`);
}

// â”€â”€â”€ Real WebSerial connection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function connectRobot(): Promise<void> {
  if (demoMode) return;  // Demo Mode already "connected"
  if (!isWebSerialSupported()) {
    throw new Error("WebSerial not supported. Use Chrome, Edge, or another Chromium browser â€” or click Demo Mode to try the app without hardware.");
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
        emitLine(trimmed);
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
  if (demoMode) { disableDemoMode(); return; }
  try { await reader?.cancel(); } catch {}
  await safeClose();
  setStatus("disconnected");
}

/** Send a single line to the robot, newline appended. Fires "pcb:robot-command" on window. */
export async function sendSerialCommand(cmd: string): Promise<void> {
  if (demoMode) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pcb:robot-command", { detail: { command: cmd, timestamp: Date.now() } }));
    }
    // Fire and forget the simulation
    simulateCommand(cmd);
    return;
  }

  if (!writer) throw new Error("Robot not connected. Click the badge to connect first.");
  await writer.write(cmd + "\n");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pcb:robot-command", { detail: { command: cmd, timestamp: Date.now() } }));
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
  (window as any).__enableDemoMode = enableDemoMode;
  (window as any).__disableDemoMode = disableDemoMode;
}
