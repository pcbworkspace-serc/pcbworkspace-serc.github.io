import { useCallback, useRef, useState } from "react";
import { usePCBModel, Prediction } from "@/hooks/usePCBModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SAMPLES = [
  { label: "Sample A", path: "/samples/pcb_sample_1.png" },
  { label: "Sample B", path: "/samples/pcb_sample_2.png" },
  { label: "Sample C", path: "/samples/pcb_sample_3.png" },
];

const PROB_THRESHOLD = 0.15;

export default function PCBDetector() {
  const { loading, ready, error, meta, predict } = usePCBModel();
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const runOnUrl = useCallback(
    async (url: string) => {
      setBusy(true);
      setErrorMsg(null);
      setPredictions(null);
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image failed to load"));
        });
        const preds = await predict(img);
        setPredictions(preds);
        setCurrentImage(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
      } finally {
        setBusy(false);
      }
    },
    [predict]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      runOnUrl(url);
    },
    [runOnUrl]
  );

  const topPredictions = predictions
    ? predictions.filter((p) => p.prob >= PROB_THRESHOLD).slice(0, 10)
    : [];

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle>PCB Component Detector</CardTitle>
        <CardDescription>
          Multi-label classifier (MobileNetV3-Small, 25 classes).
          Upload a PCB patch or try a sample.
          {meta && (
            <span className="ml-1 text-xs opacity-70">
              val mAP {(meta.val_mAP * 100).toFixed(1)}% · macro-F1{" "}
              {(meta.val_macro_f1 * 100).toFixed(1)}%
            </span>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && <p className="text-sm opacity-70">Loading model...</p>}
        {error && (
          <p className="text-sm text-red-500">
            Model failed to load: {error}
          </p>
        )}

        {ready && (
          <>
            <div className="flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <Button
                  key={s.path}
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => runOnUrl(s.path)}
                >
                  {s.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {currentImage && (
              <div className="flex justify-center">
                <img
                  src={currentImage}
                  alt="PCB input"
                  className="max-h-64 rounded border"
                />
              </div>
            )}

            {busy && <p className="text-sm opacity-70">Running inference...</p>}
            {errorMsg && (
              <p className="text-sm text-red-500">Error: {errorMsg}</p>
            )}

            {topPredictions.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  Top predictions (prob &ge; {(PROB_THRESHOLD * 100).toFixed(0)}%)
                </p>
                <div className="space-y-1">
                  {topPredictions.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="w-32 truncate font-mono">
                        {p.name}
                      </span>
                      <div className="relative h-2 flex-1 rounded bg-muted">
                        <div
                          className="absolute inset-y-0 left-0 rounded bg-primary"
                          style={{ width: `${Math.min(100, p.prob * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right tabular-nums">
                        {(p.prob * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {predictions && topPredictions.length === 0 && !busy && (
              <p className="text-sm opacity-70">
                No predictions above threshold.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
