import { useEffect, useRef, useState } from "react";
import { decodeComponent, type ClassPrediction, type DetectionBox } from "@/lib/nn";

interface CircuitBlock {
  name: string;
  description: string;
  components: string[];
}

interface NetAnalysis {
  numNets: number;
  totalPins: number;
  connectedPins: number;
  floatingPins: number;
  shorts: string[];
}

interface DetectResult {
  groundTruth: { type: string; count: number }[];
  circuits: CircuitBlock[];
  nets: NetAnalysis | null;
  mlClass: string | null;
  mlConfidence: number | null;
  mlError: string | null;
  mlPredictions?: ClassPrediction[] | null;
  mlModel?: string | null;
  mlInferenceMs?: number | null;
  mlSource?: string | null;
  mlImageUrl?: string | null;
  mlBoxes?: DetectionBox[] | null;
  mlImageSize?: [number, number] | null;
}

interface DetectModalProps {
  result: DetectResult | null;
  onClose: () => void;
  onDetectAgain: () => void;
  loading: boolean;
}

const COMPONENT_LETTER: Record<string, string> = {
  Resistor: "R", Capacitor: "C", Diode: "D", LED: "L", Transistor: "T",
};
const COMPONENT_COLOR: Record<string, string> = {
  Resistor: "#f59e0b", Capacitor: "#10b981", Diode: "#a78bfa",
  LED: "#fbbf24", Transistor: "#ef4444",
};

function scoreColor(score: number): string {
  if (score >= 0.5) return "#10b981";
  if (score >= 0.2) return "#f59e0b";
  return "#6b7280";
}

// Distinct color per class for box outlines
const BOX_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7",
  "#06b6d4", "#ec4899", "#eab308", "#84cc16", "#f97316",
  "#8b5cf6", "#14b8a6", "#f43f5e", "#22c55e", "#0ea5e9",
];
function colorForClass(cls: string): string {
  let h = 0;
  for (let i = 0; i < cls.length; i++) h = (h * 31 + cls.charCodeAt(i)) >>> 0;
  return BOX_COLORS[h % BOX_COLORS.length];
}

function ImageWithBoxes({ url, boxes, imageSize }: {
  url: string;
  boxes: DetectionBox[];
  imageSize: [number, number] | null;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rendered, setRendered] = useState<{w: number; h: number} | null>(null);

  return (
    <div className="relative inline-block max-w-full">
      <img
        ref={imgRef}
        src={url}
        alt="PCB sample"
        onLoad={(e) => {
          const el = e.currentTarget;
          setRendered({ w: el.clientWidth, h: el.clientHeight });
        }}
        className="max-w-full max-h-[300px] object-contain rounded-md border border-border"
      />
      {rendered && imageSize && boxes.map((b, i) => {
        const sx = rendered.w / imageSize[0];
        const sy = rendered.h / imageSize[1];
        const left = b.box[0] * sx;
        const top = b.box[1] * sy;
        const width = (b.box[2] - b.box[0]) * sx;
        const height = (b.box[3] - b.box[1]) * sy;
        const color = colorForClass(b.class);
        return (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{ left, top, width, height,
                     border: `2px solid ${color}`,
                     boxShadow: `0 0 0 1px rgba(0,0,0,0.5)` }}
          >
            <div
              className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-bold rounded whitespace-nowrap"
              style={{ backgroundColor: color, color: "#000" }}
            >
              {b.class} {(b.score * 100).toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DetectModal({ result, onClose, onDetectAgain, loading }: DetectModalProps) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (!result && !loading) return null;

  const hasBoxes = result?.mlBoxes && result.mlBoxes.length > 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[90%] max-w-2xl panel-bg panel-border rounded-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ animation: "slideUp 0.3s ease-out" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-lg"
        >
          x
        </button>

        <h2 className="text-2xl font-bold text-primary mb-1">PCB Detection</h2>
        <p className="text-xs text-muted-foreground mb-5">
          {result?.mlModel ?? "Layla Vision \u00b7 CNN backend"}
        </p>

        {loading && (
          <div className="py-8 text-center">
            <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-3 text-sm text-muted-foreground">Running sliding-window detection...</p>
          </div>
        )}

        {!loading && result && (
          <>
            {result.mlImageUrl && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {hasBoxes ? `Detected Components (${result.mlBoxes!.length} boxes)` : "Image Analyzed"}
                </h3>
                <div className="rounded-md overflow-hidden bg-black/40 flex items-center justify-center p-2">
                  {hasBoxes ? (
                    <ImageWithBoxes
                      url={result.mlImageUrl}
                      boxes={result.mlBoxes!}
                      imageSize={result.mlImageSize ?? null}
                    />
                  ) : (
                    <img
                      src={result.mlImageUrl}
                      alt="PCB sample"
                      className="max-w-full max-h-[300px] object-contain rounded-md"
                    />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 text-center italic">
                  Source: {result.mlSource ?? "unknown"}
                </p>
              </div>
            )}

            {hasBoxes && (
              <div className="mb-5">
                {result.mlBoxes && result.mlBoxes.length > 0 && Math.max(...result.mlBoxes.map(b => b.score)) < 0.5 && (
              <div className="mb-3 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                <span className="font-bold">!</span> Low-confidence detections. Image may be out-of-distribution from FPIC training data.
              </div>
            )}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Box Predictions
                </h3>
                <div className="space-y-1 max-h-[180px] overflow-y-auto">
                  {result.mlBoxes!.slice(0, 12).map((b, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-secondary/30 border border-border text-[11px]">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: colorForClass(b.class) }} />
                      <span className="font-bold text-foreground">{b.class}</span>
                      <span className="text-muted-foreground">{b.class_full}</span>
                      <span className="ml-auto font-mono" style={{ color: scoreColor(b.score) }}>
                        {(b.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.mlPredictions && result.mlPredictions.length > 0 && !hasBoxes && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Vision: Component Likelihoods
                </h3>
                <div className="space-y-1.5">
                  {result.mlPredictions.slice(0, 8).map((p) => {
                    const pct = p.score * 100;
                    return (
                      <div key={p.class} className="px-2.5 py-1.5 rounded bg-secondary/30 border border-border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-foreground tracking-wider">
                            {p.class}
                            <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                              {decodeComponent(p.class)}
                            </span>
                          </span>
                          <span className="text-[11px] font-mono" style={{ color: scoreColor(p.score) }}>
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-1 rounded-full bg-black/40 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                               style={{ width: `${Math.max(2, pct)}%`, backgroundColor: scoreColor(p.score) }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                  <span>MobileNetV3-Small \u00b7 multi-label \u00b7 paper mAP 0.636</span>
                  {result.mlInferenceMs != null && (
                    <span className="font-mono">{result.mlInferenceMs.toFixed(0)} ms</span>
                  )}
                </div>
              </div>
            )}

            {result.groundTruth.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  On Board (Ground Truth)
                </h3>
                <div className="space-y-2">
                  {result.groundTruth.map(({ type, count }) => (
                    <div key={type} className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/50 border border-border">
                      <div className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold text-black"
                           style={{ backgroundColor: COMPONENT_COLOR[type] ?? "#888" }}>
                        {COMPONENT_LETTER[type] ?? "?"}
                      </div>
                      <span className="flex-1 text-sm font-medium text-foreground">{type}</span>
                      <span className="text-xs font-mono text-muted-foreground">x{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.circuits && result.circuits.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Detected Circuits
                </h3>
                <div className="space-y-2">
                  {result.circuits.map((c, i) => (
                    <div key={i} className="px-3 py-2 rounded-md bg-primary/10 border border-primary/30">
                      <div className="text-sm font-semibold text-primary">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{c.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.mlError && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  ML Status
                </h3>
                <p className="text-sm text-amber-500/80">{result.mlError}</p>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onDetectAgain} disabled={loading}
            className="flex-1 h-10 rounded-md bg-primary/15 hover:bg-primary/25 disabled:opacity-50 disabled:cursor-not-allowed border border-primary/40 text-primary text-sm font-semibold transition-colors">
            {loading ? "Detecting..." : "Detect Again"}
          </button>
          <button onClick={onClose}
            className="h-10 px-4 rounded-md bg-secondary hover:bg-secondary/80 border border-border text-foreground text-sm font-medium transition-colors">
            Close
          </button>
        </div>
      </div>

      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
