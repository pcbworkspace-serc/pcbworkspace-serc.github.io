/**
 * Human labeling of captured frames for the backend's held-out evaluation
 * (vision_eval.py in the backend repo).
 *
 * The evaluator only reports on frames that a person labeled and that carry
 * a board/session id, so it can hold out whole boards instead of single
 * frames. This module keeps those ids, decides which frames may be labeled
 * at all, converts what the labeler clicks into the backend's ground-truth
 * format, and builds the /nn/feedback payload.
 *
 * Only camera photos and uploads of real SERC boards are labelable. A 3D
 * scene render is synthetic and a bundled sample is a public-dataset image;
 * neither gets a board id, so the evaluator can never count them as SERC
 * frames.
 */

export type FrameSource = "camera" | "upload" | "sample" | "scene_render";

const LABELABLE: ReadonlySet<FrameSource> = new Set<FrameSource>(["camera", "upload"]);

export function isLabelableSource(source: FrameSource | null | undefined): boolean {
  return !!source && LABELABLE.has(source);
}

export function describeSource(source: FrameSource | null | undefined): string {
  switch (source) {
    case "camera": return "camera photo";
    case "upload": return "uploaded photo";
    case "sample": return "bundled dataset sample";
    case "scene_render": return "3D scene render";
    default: return "unknown source";
  }
}

// ── capture tags ────────────────────────────────────────────────────────

const LABELER_KEY = "pcbworkspace.capture.labeler";

function readStored(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* private mode: keep in memory only */ }
}

// The board id deliberately isn't persisted: a stale id from yesterday's
// board would be recorded with the first capture of today's.
let boardId = "";
let labeler = readStored(LABELER_KEY);

export function newSessionId(now: Date = new Date(), rand: () => number = Math.random): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const suffix = Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0");
  return `${stamp}-${suffix}`;
}

let sessionId = newSessionId();

export const getCaptureSessionId = () => sessionId;
export function startNewCaptureSession(): string {
  sessionId = newSessionId();
  return sessionId;
}

export const getBoardId = () => boardId;
/** A new board starts a new capture session, so a session never spans two
 *  boards and the evaluator can hold them out independently. */
export function setBoardId(value: string) {
  const next = value.trim();
  if (next !== boardId) sessionId = newSessionId();
  boardId = next;
}

export const getLabeler = () => labeler;
export function setLabeler(value: string) {
  labeler = value.trim();
  writeStored(LABELER_KEY, labeler);
}

/** Form fields sent with a frame to /nn/align or /nn/detect_boxes[_yolo].
 *  Every frame says where it came from; only labelable frames get a
 *  session id, and a board id when one is set. */
export function captureFields(source: FrameSource): Record<string, string> {
  const fields: Record<string, string> = { frame_source: source };
  if (isLabelableSource(source)) {
    fields.session_id = sessionId;
    if (boardId) fields.board_id = boardId;
  }
  return fields;
}

// ── geometry ────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };
export type Box = [number, number, number, number];

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A point on the displayed image -> pixels of the image the backend saved. */
export function toImagePixels(p: Point, displayed: { w: number; h: number }, imageSize: [number, number]): Point {
  const x = Math.min(Math.max(p.x, 0), displayed.w) * (imageSize[0] / displayed.w);
  const y = Math.min(Math.max(p.y, 0), displayed.h) * (imageSize[1] / displayed.h);
  return { x: round1(x), y: round1(y) };
}

export function boxFromCorners(a: Point, b: Point): Box {
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
}

/** Ground truth for one part in an alignment crop, from two clicks: the
 *  part's center and its pin-1 / polarity end. Same convention as
 *  /nn/align: offsets are part center minus crop center (x right, y down);
 *  the angle is the part's axis pointing away from pin 1, measured from +x,
 *  positive clockwise on screen. */
export function alignmentFromClicks(center: Point, pin1End: Point, cropSize: [number, number]) {
  const vx = center.x - pin1End.x;
  const vy = center.y - pin1End.y;
  if (Math.hypot(vx, vy) < 1) throw new Error("click the pin-1 end away from the center");
  const round2 = (v: number) => Math.round(v * 100) / 100;
  return {
    delta_theta_deg: round2((Math.atan2(vy, vx) * 180) / Math.PI),
    delta_x_px: round2(center.x - cropSize[0] / 2),
    delta_y_px: round2(center.y - cropSize[1] / 2),
  };
}

// ── /nn/feedback payload ────────────────────────────────────────────────

export type LabeledBox = { class: string; box: Box };

export type HumanLabel =
  | { kind: "detect"; captureId: string; groundTruth: { boxes: LabeledBox[] } }
  | { kind: "align"; captureId: string; groundTruth: { delta_theta_deg: number; delta_x_px: number; delta_y_px: number; polarity_visible: boolean } };

/** A board id is required: without it, two sessions on the same board look
 *  like different groups to the evaluator and could land on both sides of
 *  its split. It fills in a capture taken before the id was entered, and the
 *  backend rejects one that contradicts the id recorded at capture time.
 *  The session id was already recorded with the capture. */
export function buildFeedbackPayload(label: HumanLabel, who: string, board: string) {
  const name = who.trim();
  if (!name) throw new Error("enter your name or initials as the labeler");
  if (!board.trim()) throw new Error("enter the board id printed on / assigned to this board");
  if (!label.captureId) throw new Error("this frame was not captured, so it can't be labeled");
  return {
    kind: label.kind,
    capture_id: label.captureId,
    ground_truth: label.groundTruth,
    label_source: "human",
    labeler: name,
    board_id: board.trim(),
  };
}
