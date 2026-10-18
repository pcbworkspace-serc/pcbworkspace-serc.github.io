import { captureFields, type FrameSource } from "@/lib/labeling";

const BASE = (import.meta.env.VITE_NN_URL as string | undefined) || "http://localhost:5000";

export type DetectionMethod = "sliding_window" | "yolo_hybrid";

export interface NNStatus {
  phase: string;
  loaded?: boolean;
  model?: string;
  model_kind?: "classifier" | "jepa" | "none";
  parameters?: number;
  num_classes?: number;
  class_names?: string[];
  /** No detection accuracy has been measured on SERC boards yet
   *  (serc_boards.measured is false). The only figures are the FPIC paper's,
   *  on the public FPIC dataset; never show them as SERC performance. */
  detection_metrics?: {
    serc_boards: { measured: boolean; status: string; how_to_measure?: string };
    fpic_paper_reference: {
      source: string;
      dataset: string;
      measured_by_serc: false;
      mAP: number;
      "macro_f1_at_0.5": number;
      "macro_precision_at_0.5": number;
      "macro_recall_at_0.5": number;
    };
  };
  methods?: {
    sliding_window?: { endpoint: string; available: boolean; description: string };
    yolo_hybrid?: { endpoint: string; available: boolean; description: string };
  };
}

export interface DetectionResult {
  class_name: string;
  class_idx: number;
  confidence: number;
  bbox: [number, number, number, number];
  inference_ms: number;
}

export interface ClassPrediction {
  class: string;
  score: number;
  above_threshold: boolean;
}

export interface MultiLabelResult {
  predictions: ClassPrediction[];
  num_classes: number;
  model: string;
  model_kind: "classifier" | "jepa" | "none";
  trained: boolean;
  inference_ms: number;
}

export interface AlignmentResult {
  delta_theta_deg: number;
  /** null when the backend has no calibration to convert pixels to mm */
  delta_x_mm: number | null;
  delta_y_mm: number | null;
  delta_x_px?: number;
  delta_y_px?: number;
  method?: string;
  confidence?: number;
  inference_ms?: number;
  available?: boolean;
  reason?: string;
  /** present when the backend saved this frame for labeling */
  capture_id?: string;
}

export interface ValidationResult {
  decision: "PASS" | "FAIL";
  pass_prob: number;
  fail_prob: number;
  inference_ms: number;
  available?: boolean;
  reason?: string;
}

export interface TrainingStatus {
  running: boolean;
  progress: number;
}

// Max edge of uploaded images. The backend resizes to 640px for inference anyway,
// so anything larger is wasted bandwidth + processing time on the free Render tier.
const UPLOAD_MAX_SIDE = 800;
const UPLOAD_JPEG_QUALITY = 0.85;

/**
 * Resize a blob image down to UPLOAD_MAX_SIDE on the longer edge.
 * Returns the original blob if it's already small enough or if anything fails.
 */
async function resizeBlobImage(blob: Blob, maxSide: number = UPLOAD_MAX_SIDE): Promise<Blob> {
  try {
    // createImageBitmap is faster than the new Image() approach and avoids DOM
    const bitmap = await createImageBitmap(blob);
    try {
      const longSide = Math.max(bitmap.width, bitmap.height);
      if (longSide <= maxSide) return blob;
      const scale = maxSide / longSide;
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const resized = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", UPLOAD_JPEG_QUALITY),
      );
      return resized || blob;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return blob;
  }
}

/** source tags the frame for the backend's capture loop (see labeling.ts).
 *  resize: false keeps pixels 1:1 with what a labeler clicks on. */
async function postWithFrame(
  endpoint: string, frame: Blob | null, source?: FrameSource, resize = true,
): Promise<Response> {
  if (frame) {
    const body = resize ? await resizeBlobImage(frame) : frame;
    const form = new FormData();
    form.append("image", body, resize ? "frame.jpg" : "frame.png");
    if (source) {
      for (const [k, v] of Object.entries(captureFields(source))) form.append(k, v);
    }
    return fetch(BASE + endpoint, { method: "POST", body: form });
  }
  return fetch(BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export const pingNNServer = async (): Promise<boolean> => {
  try {
    const res = await fetch(BASE + "/health", { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
};

export const wakeBackend = async (): Promise<void> => {
  try {
    await fetch(BASE + "/health", { signal: AbortSignal.timeout(60000) });
  } catch {
    /* best-effort; ignore */
  }
};

export const getNNStatus = async (): Promise<NNStatus> => {
  try {
    const res = await fetch(BASE + "/nn/status");
    return res.json();
  } catch {
    return { phase: "IDLE" };
  }
};

export const getMultiLabelDetection = async (frame?: Blob | null): Promise<MultiLabelResult> => {
  const res = await postWithFrame("/nn/detect", frame ?? null);
  if (!res.ok) throw new Error("Detection failed: " + res.status);
  return res.json();
};

export const getDetection = async (frame?: Blob | null): Promise<DetectionResult> => {
  const ml = await getMultiLabelDetection(frame);
  const top = ml.predictions[0];
  return {
    class_name: top?.class ?? "unknown",
    class_idx: 0,
    confidence: top?.score ?? 0,
    bbox: [0.5, 0.5, 1.0, 1.0],
    inference_ms: ml.inference_ms,
  };
};

/** Never invents a correction: when the backend can't answer, the result
 *  is available: false with the reason, and callers must show that. */
export const getAlignmentCorrection = async (
  frame?: Blob | null, source?: FrameSource, resize = true,
): Promise<AlignmentResult> => {
  const unavailable = (reason: string): AlignmentResult => ({
    delta_theta_deg: 0, delta_x_mm: null, delta_y_mm: null, available: false, reason,
  });
  let res: Response;
  try {
    res = await postWithFrame("/nn/align", frame ?? null, source, resize);
  } catch {
    return unavailable("alignment backend unreachable");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return unavailable(data?.reason ?? data?.error ?? `alignment failed (HTTP ${res.status})`);
  if (data.available === false) return { ...unavailable(data.reason ?? "no alignment available"), capture_id: data.capture_id };
  return data;
};

export const getValidation = async (frame?: Blob | null): Promise<ValidationResult> => {
  const res = await postWithFrame("/nn/validate", frame ?? null);
  if (!res.ok) throw new Error("Validation failed: " + res.status);
  const data = await res.json();
  if (data.available === false) {
    return {
      decision: "PASS", pass_prob: 0, fail_prob: 0,
      inference_ms: data.inference_ms ?? 0,
      available: false, reason: data.reason,
    };
  }
  return data;
};

export const startPretraining = async (_epochs: number) => true;
export const startFinetuning = async (_epochs: number) => true;
export const getTrainingStatus = async (): Promise<TrainingStatus> => ({ running: false, progress: 100 });

export const COMPONENT_FULL_NAMES: Record<string, string> = {
  R: "Resistor", RN: "Resistor Network", RA: "Resistor Array",
  C: "Capacitor", L: "Inductor", D: "Diode", LED: "LED",
  Q: "Transistor", QA: "Transistor Array",
  U: "Integrated Circuit", IC: "Integrated Circuit",
  T: "Transformer", F: "Fuse", FB: "Ferrite Bead",
  SW: "Switch", BTN: "Button", CR: "Crystal", CRA: "Crystal Array",
  J: "Connector", JP: "Jumper", M: "Module", P: "Plug",
  S: "Sensor", TP: "Test Point", V: "Voltage Regulator",
};

export function decodeComponent(code: string): string {
  return COMPONENT_FULL_NAMES[code] ?? code;
}

export interface DetectionBox {
  box: [number, number, number, number];
  box_norm: [number, number, number, number];
  class: string;
  class_full: string;
  score: number;
  yolo_score?: number;
  classifier_score?: number;
}

export interface DetectBoxesResult {
  boxes: DetectionBox[];
  image_size: [number, number];
  work_size?: [number, number];
  n_windows_evaluated?: number;
  n_proposals?: number;
  method?: DetectionMethod;
  model: string;
  inference_ms: number;
  /** present when the backend saved this frame for labeling */
  capture_id?: string;
}

export const getDetectBoxes = async (frame: Blob | null, source?: FrameSource): Promise<DetectBoxesResult> => {
  const res = await postWithFrame('/nn/detect_boxes', frame, source);
  if (!res.ok) throw new Error('detect_boxes failed: ' + res.status);
  return res.json();
};

export const getDetectBoxesYolo = async (frame: Blob | null, source?: FrameSource): Promise<DetectBoxesResult> => {
  const res = await postWithFrame('/nn/detect_boxes_yolo', frame, source);
  if (!res.ok) throw new Error('detect_boxes_yolo failed: ' + res.status);
  return res.json();
};

export const getDetectBoxesByMethod = (
  frame: Blob | null,
  method: DetectionMethod,
  source?: FrameSource,
): Promise<DetectBoxesResult> => {
  return method === "yolo_hybrid" ? getDetectBoxesYolo(frame, source) : getDetectBoxes(frame, source);
};

/** Sends a person's label for a captured frame to /nn/feedback. The payload
 *  comes from labeling.buildFeedbackPayload (label_source "human"). */
export const submitHumanLabel = async (payload: object): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch(BASE + "/nn/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error ?? `feedback failed (HTTP ${res.status})` };
  } catch {
    return { ok: false, error: "backend unreachable" };
  }
};
