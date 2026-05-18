// LeRobot demonstration recorder.
//
// Captures every robot command sent over serial into a timestamped episode.
// Exported as JSON in a format compatible with the HuggingFace LeRobot
// dataset spec (https://github.com/huggingface/lerobot). You can then run a
// small Python conversion script to turn it into a proper LeRobotDataset,
// or feed it directly into your own imitation-learning pipeline.
//
// Each episode is a sequence of (timestamp, command, parsed_action) frames.
// "Action" here is whatever the robot was instructed to do — the policy you
// train on this data will learn to emit similar commands given the current
// state.

interface TeachFrame {
  frame_index: number;
  timestamp_s: number;          // seconds since episode start
  timestamp_ms_abs: number;     // absolute epoch ms (for sync with camera logs)
  command: string;              // raw serial line, e.g. "MOVE X10 Y20 Z0 R0"
  action_type: string;          // parsed verb: "move", "home", "pick", ...
  action_params: Record<string, number | string>;
}

type EpisodeMetadata = {
  schemaVersion: 1;
  format: "lerobot-compatible-json";
  robot_type: "scara-pnp";
  fps_nominal: number;          // nominal frame rate (commands aren't really framed, this is for tooling)
  task: string;
  episode_index: number;
  total_frames: number;
  started_at_ms: number;
  ended_at_ms: number;
  duration_s: number;
};

let recording = false;
let episodeIndex = 0;
let frames: TeachFrame[] = [];
let episodeStartMs = 0;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((fn) => { try { fn(); } catch {} }); }

export function isRecording(): boolean { return recording; }
export function getFrameCount(): number { return frames.length; }
export function getEpisodeIndex(): number { return episodeIndex; }
export function onTeachChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function startRecording(): void {
  recording = true;
  frames = [];
  episodeStartMs = Date.now();
  notify();
}

export function stopRecording(): void {
  recording = false;
  notify();
}

export function discardEpisode(): void {
  frames = [];
  recording = false;
  notify();
}

/**
 * Parse a serial command line into a verb + params.
 * Mirrors the protocol your ESP32 firmware accepts.
 */
function parseCommandLine(line: string): { action_type: string; params: Record<string, number | string> } {
  const trimmed = line.trim();
  if (!trimmed) return { action_type: "unknown", params: {} };
  const [verb, ...rest] = trimmed.split(/\s+/);
  const verbLower = verb.toLowerCase();

  if (verbLower === "move") {
    const params: Record<string, number> = {};
    for (const tok of rest) {
      const m = tok.match(/^([XYZR])(-?\d+(?:\.\d+)?)$/i);
      if (m) params[m[1].toLowerCase()] = parseFloat(m[2]);
    }
    return { action_type: "move", params };
  }
  if (verbLower === "rotate" && rest.length >= 1) {
    return { action_type: "rotate", params: { degrees: parseFloat(rest[0]) } };
  }
  // single-verb commands
  if (["home","pick","place","release","stop","scan","detect","align","validate","ready"].includes(verbLower)) {
    return { action_type: verbLower, params: {} };
  }
  return { action_type: verbLower, params: { raw: rest.join(" ") } };
}

/**
 * Listen for any serial command broadcast on the window and, if recording,
 * append it as a frame. Called once at app boot.
 */
export function installSerialRecorder(): void {
  if (typeof window === "undefined") return;
  if ((window as any).__teachRecorderInstalled) return;
  (window as any).__teachRecorderInstalled = true;

  window.addEventListener("pcb:robot-command", (e: Event) => {
    if (!recording) return;
    const detail = (e as CustomEvent).detail as { command?: string; timestamp?: number } | undefined;
    if (!detail?.command) return;
    const absMs = detail.timestamp ?? Date.now();
    const parsed = parseCommandLine(detail.command);
    frames.push({
      frame_index: frames.length,
      timestamp_s: (absMs - episodeStartMs) / 1000,
      timestamp_ms_abs: absMs,
      command: detail.command,
      action_type: parsed.action_type,
      action_params: parsed.params,
    });
    notify();
  });
}

/** Build the export object — LeRobot-friendly JSON. */
function buildEpisode(task: string): { meta: EpisodeMetadata; frames: TeachFrame[] } {
  const endMs = frames.length > 0 ? frames[frames.length - 1].timestamp_ms_abs : episodeStartMs;
  return {
    meta: {
      schemaVersion: 1,
      format: "lerobot-compatible-json",
      robot_type: "scara-pnp",
      fps_nominal: 30,
      task,
      episode_index: episodeIndex,
      total_frames: frames.length,
      started_at_ms: episodeStartMs,
      ended_at_ms: endMs,
      duration_s: (endMs - episodeStartMs) / 1000,
    },
    frames,
  };
}

/** Trigger a browser download of the current episode as JSON. */
export function downloadEpisode(task: string): boolean {
  if (frames.length === 0) return false;
  const payload = buildEpisode(task);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lerobot-episode-${episodeIndex.toString().padStart(4, "0")}-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  episodeIndex += 1;
  frames = [];
  recording = false;
  notify();
  return true;
}
