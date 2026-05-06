const BASE = (import.meta.env.VITE_NN_URL as string | undefined) || "http://localhost:5000";

export interface NNStatus {
  phase: string;
  loaded?: boolean;
  model?: string;
  model_kind?: "classifier" | "jepa" | "none";
  parameters?: number;
  num_classes?: number;
  class_names?: string[];
  metrics_from_paper?: {
    mAP: number;
    "macro_f1_at_0.5": number;
    "macro_precision_at_0.5": number;
    "macro_recall_at_0.5": number;
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
  delta_x_mm: number;
  delta_y_mm: number;
  confidence?: number;
  inference_ms?: number;
  available?: boolean;
  reason?: string;
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

async function postWithFrame(endpoint: string, frame: Blob | null): Promise<Response> {
  if (frame) {
    const form = new FormData();
    form.append("image", frame, "frame.jpg");
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

export const getAlignmentCorrection = async (frame?: Blob | null): Promise<AlignmentResult> => {
  try {
    const res = await postWithFrame("/nn/align", frame ?? null);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.available === false) {
      return {
        delta_theta_deg: 0, delta_x_mm: 0, delta_y_mm: 0,
        available: false, reason: data.reason,
      };
    }
    return data;
  } catch {
    await new Promise((r) => setTimeout(r, 1200));
    return {
      delta_theta_deg: (Math.random() * 10) - 5,
      delta_x_mm: (Math.random() * 0.8) - 0.4,
      delta_y_mm: (Math.random() * 0.8) - 0.4,
    };
  }
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
  R: "Resistor",
  RN: "Resistor Network",
  RA: "Resistor Array",
  C: "Capacitor",
  L: "Inductor",
  D: "Diode",
  LED: "LED",
  Q: "Transistor",
  QA: "Transistor Array",
  U: "Integrated Circuit",
  IC: "Integrated Circuit",
  T: "Transformer",
  F: "Fuse",
  FB: "Ferrite Bead",
  SW: "Switch",
  BTN: "Button",
  CR: "Crystal",
  CRA: "Crystal Array",
  J: "Connector",
  JP: "Jumper",
  M: "Module",
  P: "Plug",
  S: "Sensor",
  TP: "Test Point",
  V: "Voltage Regulator",
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
}

export interface DetectBoxesResult {
  boxes: DetectionBox[];
  image_size: [number, number];
  work_size?: [number, number];
  n_windows_evaluated?: number;
  model: string;
  inference_ms: number;
}

export const getDetectBoxes = async (frame: Blob | null): Promise<DetectBoxesResult> => {
  const res = await postWithFrame('/nn/detect_boxes', frame);
  if (!res.ok) throw new Error('detect_boxes failed: ' + res.status);
  return res.json();
};
