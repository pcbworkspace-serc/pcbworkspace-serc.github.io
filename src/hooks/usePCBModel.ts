import { useCallback, useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";

// Point ORT at the WASM files we'll copy to public/ort/
// (These come from node_modules/onnxruntime-web/dist at build time.
//  Until the model + wasm files are restored from the PC, this hook
//  will fail gracefully on load and the component will show an error.)
ort.env.wasm.wasmPaths = "/ort/";

export interface ClassInfo {
  id: number;
  code: string;
  name: string;
}

export interface ModelMeta {
  num_classes: number;
  classes: ClassInfo[];
  input_size: number;
  model: string;
  val_mAP: number;
  val_macro_f1: number;
}

export interface Prediction {
  id: number;
  code: string;
  name: string;
  prob: number;
}

interface UsePCBModelState {
  loading: boolean;
  ready: boolean;
  error: string | null;
  meta: ModelMeta | null;
}

export function usePCBModel() {
  const [state, setState] = useState<UsePCBModelState>({
    loading: true,
    ready: false,
    error: null,
    meta: null,
  });
  const sessionRef = useRef<ort.InferenceSession | null>(null);

  // Load model + metadata on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // Fetch class metadata JSON
        const metaResp = await fetch("/models/class_info.json");
        if (!metaResp.ok) {
          throw new Error(`class_info.json fetch failed: ${metaResp.status}`);
        }
        const meta: ModelMeta = await metaResp.json();

        // Load ONNX model
        const session = await ort.InferenceSession.create("/models/model.onnx", {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });

        if (cancelled) return;
        sessionRef.current = session;
        setState({ loading: false, ready: true, error: null, meta });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setState({ loading: false, ready: false, error: msg, meta: null });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Run inference on an HTMLImageElement or HTMLCanvasElement
  const predict = useCallback(
    async (source: HTMLImageElement | HTMLCanvasElement): Promise<Prediction[]> => {
      const session = sessionRef.current;
      if (!session || !state.meta) {
        throw new Error("Model not ready");
      }

      const inputSize = state.meta.input_size;

      // 1. Rasterize to inputSize x inputSize
      const canvas = document.createElement("canvas");
      canvas.width = inputSize;
      canvas.height = inputSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");
      ctx.drawImage(source, 0, 0, inputSize, inputSize);
      const imageData = ctx.getImageData(0, 0, inputSize, inputSize).data;

      // 2. Convert RGBA -> float32 CHW, normalized with ImageNet mean/std
      const chw = new Float32Array(3 * inputSize * inputSize);
      const mean = [0.485, 0.456, 0.406];
      const std = [0.229, 0.224, 0.225];
      const plane = inputSize * inputSize;
      for (let i = 0; i < plane; i++) {
        const r = imageData[i * 4] / 255;
        const g = imageData[i * 4 + 1] / 255;
        const b = imageData[i * 4 + 2] / 255;
        chw[i] = (r - mean[0]) / std[0];
        chw[i + plane] = (g - mean[1]) / std[1];
        chw[i + 2 * plane] = (b - mean[2]) / std[2];
      }

      // 3. Run the model
      const inputTensor = new ort.Tensor("float32", chw, [1, 3, inputSize, inputSize]);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[session.inputNames[0]] = inputTensor;
      const output = await session.run(feeds);
      const logits = output[session.outputNames[0]].data as Float32Array;

      // 4. Sigmoid (multi-label)
      const probs = new Float32Array(logits.length);
      for (let i = 0; i < logits.length; i++) {
        probs[i] = 1 / (1 + Math.exp(-logits[i]));
      }

      // 5. Zip with class metadata, sort by prob desc
      const preds: Prediction[] = state.meta.classes.map((c, idx) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        prob: probs[idx] ?? 0,
      }));
      preds.sort((a, b) => b.prob - a.prob);
      return preds;
    },
    [state.meta]
  );

  return {
    loading: state.loading,
    ready: state.ready,
    error: state.error,
    meta: state.meta,
    predict,
  };
}
