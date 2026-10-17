import { useEffect, useRef, useState } from "react";
import { COMPONENT_FULL_NAMES, getAlignmentCorrection, submitHumanLabel, type AlignmentResult } from "@/lib/nn";
import {
  alignmentFromClicks, boxFromCorners, buildFeedbackPayload, describeSource, getBoardId,
  getCaptureSessionId, getLabeler, isLabelableSource, setBoardId, setLabeler, toImagePixels,
  type FrameSource, type HumanLabel, type LabeledBox, type Point,
} from "@/lib/labeling";

/**
 * Lets a person label a captured frame for the backend's held-out
 * evaluation (vision_eval.py). Labels start blank and the model's own
 * output stays hidden while labeling: the evaluator refuses labels that
 * copy the model, and seeing its answer first biases the labeler.
 */

const CLASS_CODES = Object.keys(COMPONENT_FULL_NAMES);
const MIN_DRAG_PX = 3;

type Mode = "closed" | "boxes" | "align";
type Status = { ok: boolean; text: string } | null;

function pointIn(e: React.MouseEvent, el: Element): Point & { w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
}

function useSubmit() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (label: HumanLabel, labeler: string, board: string) => {
    let payload;
    try {
      payload = buildFeedbackPayload(label, labeler, board);
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    }
    setBusy(true);
    const res = await submitHumanLabel(payload);
    setBusy(false);
    setStatus(res.ok
      ? { ok: true, text: `Saved as your label for capture ${label.captureId}. Submitting again replaces it.` }
      : { ok: false, text: `Not saved: ${res.error}` });
    return res.ok;
  };
  return { status, busy, submit };
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return <p className={`text-[11px] mt-2 ${status.ok ? "text-emerald-400" : "text-amber-400"}`}>{status.text}</p>;
}

// ── detection: draw one box per part ────────────────────────────────────

export function BoxLabeler({ imageUrl, imageSize, captureId, labeler, board }: {
  imageUrl: string;
  imageSize: [number, number];
  captureId: string;
  labeler: string;
  board: string;
}) {
  const [boxes, setBoxes] = useState<LabeledBox[]>([]);
  const [cls, setCls] = useState("R");
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number } | null>(null);
  const [emptyConfirmed, setEmptyConfirmed] = useState(false);
  const { status, busy, submit } = useSubmit();

  const onDown = (e: React.MouseEvent) => {
    const p = pointIn(e, e.currentTarget);
    setDisplay({ w: p.w, h: p.h });
    setDrag({ a: p, b: p });
  };
  const onMove = (e: React.MouseEvent) => {
    if (drag) setDrag({ a: drag.a, b: pointIn(e, e.currentTarget) });
  };
  const onUp = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = pointIn(e, e.currentTarget);
    setDrag(null);
    if (Math.abs(p.x - drag.a.x) < MIN_DRAG_PX || Math.abs(p.y - drag.a.y) < MIN_DRAG_PX) return;
    const size = { w: p.w, h: p.h };
    const a = toImagePixels(drag.a, size, imageSize);
    const b = toImagePixels(p, size, imageSize);
    setBoxes((prev) => [...prev, { class: cls, box: boxFromCorners(a, b) }]);
  };

  const toDisplay = (box: LabeledBox["box"]) => {
    if (!display) return null;
    const sx = display.w / imageSize[0];
    const sy = display.h / imageSize[1];
    return { left: box[0] * sx, top: box[1] * sy, width: (box[2] - box[0]) * sx, height: (box[3] - box[1]) * sy };
  };

  const canSubmit = boxes.length > 0 || emptyConfirmed;

  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Drag a tight box around every part you can see, then set its class. Parts cut off at the edge count too.
      </p>
      <label className="text-[11px] text-muted-foreground mr-2">Class for the next box</label>
      <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class for the next box"
        className="mb-2 bg-secondary/50 border border-border rounded px-1 py-0.5 text-[11px] text-foreground">
        {CLASS_CODES.map((c) => <option key={c} value={c}>{c} — {COMPONENT_FULL_NAMES[c]}</option>)}
      </select>
      <div className="relative inline-block max-w-full select-none">
        <img src={imageUrl} alt="Frame to label" draggable={false}
          className="max-w-full max-h-[360px] object-contain rounded-md border border-border" />
        <div data-testid="box-canvas" className="absolute inset-0 cursor-crosshair"
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => setDrag(null)}>
          {boxes.map((b, i) => {
            const s = toDisplay(b.box);
            return s && (
              <div key={i} className="absolute border-2 border-emerald-400 pointer-events-none" style={s}>
                <span className="absolute -top-4 left-0 text-[9px] font-bold bg-emerald-400 text-black px-1 rounded">{b.class}</span>
              </div>
            );
          })}
          {drag && (
            <div className="absolute border-2 border-dashed border-sky-400 pointer-events-none" style={{
              left: Math.min(drag.a.x, drag.b.x), top: Math.min(drag.a.y, drag.b.y),
              width: Math.abs(drag.b.x - drag.a.x), height: Math.abs(drag.b.y - drag.a.y),
            }} />
          )}
        </div>
      </div>

      <div className="space-y-1 my-2 max-h-[140px] overflow-y-auto">
        {boxes.map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <select value={b.class} aria-label={`Class of box ${i + 1}`}
              onChange={(e) => setBoxes((prev) => prev.map((x, j) => j === i ? { ...x, class: e.target.value } : x))}
              className="bg-secondary/50 border border-border rounded px-1 text-foreground">
              {CLASS_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="font-mono text-muted-foreground">[{b.box.map((v) => v.toFixed(0)).join(", ")}] px</span>
            <button type="button" onClick={() => setBoxes((prev) => prev.filter((_, j) => j !== i))}
              className="ml-auto text-amber-400 hover:text-amber-300">remove</button>
          </div>
        ))}
      </div>

      {boxes.length === 0 && (
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
          <input type="checkbox" checked={emptyConfirmed} onChange={(e) => setEmptyConfirmed(e.target.checked)} />
          I checked this frame and it has no parts
        </label>
      )}
      <button type="button" disabled={!canSubmit || busy}
        onClick={() => submit({ kind: "detect", captureId, groundTruth: { boxes } }, labeler, board)}
        className="h-8 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold disabled:opacity-40">
        {busy ? "Saving..." : `Save ${boxes.length} box label${boxes.length === 1 ? "" : "s"}`}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

// ── alignment: crop one part, then click its center and pin-1 end ───────

async function cropBlob(frame: Blob, box: [number, number, number, number]): Promise<Blob> {
  const bitmap = await createImageBitmap(frame);
  try {
    const [x1, y1, x2, y2] = box.map(Math.round);
    const canvas = document.createElement("canvas");
    canvas.width = x2 - x1;
    canvas.height = y2 - y1;
    canvas.getContext("2d")!.drawImage(bitmap, x1, y1, x2 - x1, y2 - y1, 0, 0, x2 - x1, y2 - y1);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!out) throw new Error("could not crop the frame");
    return out;
  } finally {
    bitmap.close?.();
  }
}

export function AlignLabeler({ imageUrl, frame, frameSource, labeler, board }: {
  imageUrl: string;
  frame: Blob;
  frameSource: FrameSource;
  labeler: string;
  board: string;
}) {
  const [drag, setDrag] = useState<{ a: Point; b: Point } | null>(null);
  const [crop, setCrop] = useState<{ url: string; size: [number, number]; result: AlignmentResult } | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  const [clicks, setClicks] = useState<Point[]>([]);
  const [polarity, setPolarity] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { status, busy, submit } = useSubmit();

  useEffect(() => () => { if (crop) URL.revokeObjectURL(crop.url); }, [crop]);

  const natural = (p: Point, size: { w: number; h: number }) => {
    const img = imgRef.current!;
    return toImagePixels(p, size, [img.naturalWidth, img.naturalHeight]);
  };

  const onUp = async (e: React.MouseEvent) => {
    if (!drag) return;
    const p = pointIn(e, e.currentTarget);
    setDrag(null);
    if (Math.abs(p.x - drag.a.x) < MIN_DRAG_PX || Math.abs(p.y - drag.a.y) < MIN_DRAG_PX) return;
    const box = boxFromCorners(natural(drag.a, p), natural(p, p));
    setCropError(null);
    try {
      const blob = await cropBlob(frame, box);
      // sent unresized so the crop the backend saves matches what is clicked below
      const result = await getAlignmentCorrection(blob, frameSource, false);
      setClicks([]);
      setRevealed(false);
      setCrop({ url: URL.createObjectURL(blob), size: [Math.round(box[2]) - Math.round(box[0]), Math.round(box[3]) - Math.round(box[1])], result });
    } catch (err) {
      setCropError(err instanceof Error ? err.message : String(err));
    }
  };

  // show the crop large enough to click precisely
  const scale = crop ? Math.min(8, 320 / crop.size[0], 240 / crop.size[1]) : 1;
  const onCropClick = (e: React.MouseEvent) => {
    if (!crop || clicks.length >= 2) return;
    const p = pointIn(e, e.currentTarget);
    setClicks((prev) => [...prev, toImagePixels(p, { w: p.w, h: p.h }, crop.size)]);
  };

  let gt: ReturnType<typeof alignmentFromClicks> | null = null;
  let gtError: string | null = null;
  if (crop && clicks.length === 2) {
    try { gt = alignmentFromClicks(clicks[0], clicks[1], crop.size); } catch (err) { gtError = (err as Error).message; }
  }

  const onSave = async () => {
    if (!crop?.result.capture_id || !gt) return;
    const ok = await submit({ kind: "align", captureId: crop.result.capture_id,
      groundTruth: { ...gt, polarity_visible: polarity } }, labeler, board);
    if (ok) setRevealed(true);
  };

  const r = crop?.result;
  return (
    <div>
      {!crop && (
        <>
          <p className="text-[11px] text-muted-foreground mb-2">Drag a box around one part. It is cropped and sent to /nn/align as its own frame.</p>
          <div className="relative inline-block max-w-full select-none">
            <img ref={imgRef} src={imageUrl} alt="Frame to crop" draggable={false}
              className="max-w-full max-h-[360px] object-contain rounded-md border border-border" />
            <div data-testid="crop-canvas" className="absolute inset-0 cursor-crosshair"
              onMouseDown={(e) => { const p = pointIn(e, e.currentTarget); setDrag({ a: p, b: p }); }}
              onMouseMove={(e) => drag && setDrag({ a: drag.a, b: pointIn(e, e.currentTarget) })}
              onMouseUp={onUp} onMouseLeave={() => setDrag(null)}>
              {drag && (
                <div className="absolute border-2 border-dashed border-sky-400 pointer-events-none" style={{
                  left: Math.min(drag.a.x, drag.b.x), top: Math.min(drag.a.y, drag.b.y),
                  width: Math.abs(drag.b.x - drag.a.x), height: Math.abs(drag.b.y - drag.a.y),
                }} />
              )}
            </div>
          </div>
          {cropError && <p className="text-[11px] text-amber-400 mt-2">{cropError}</p>}
        </>
      )}

      {crop && !crop.result.capture_id && (
        <p className="text-[11px] text-amber-400">
          The backend did not save this crop (capture is off: start it with CAPTURE_TRAINING_DATA=1), so it can't be labeled.
        </p>
      )}

      {crop && crop.result.capture_id && (
        <>
          <p className="text-[11px] text-muted-foreground mb-2">
            {clicks.length === 0 ? "Click the center of the part." :
             clicks.length === 1 ? "Now click the pin-1 / polarity end of the part's long axis (either end if it has no mark)." :
             "Both points set."}
          </p>
          <div data-testid="align-crop" onClick={onCropClick} className="relative inline-block cursor-crosshair select-none"
            style={{ width: crop.size[0] * scale, height: crop.size[1] * scale }}>
            <img src={crop.url} alt="Part crop" draggable={false} className="w-full h-full [image-rendering:pixelated]" />
            {clicks.map((c, i) => (
              <div key={i} className={`absolute w-2 h-2 -ml-1 -mt-1 rounded-full pointer-events-none ${i === 0 ? "bg-emerald-400" : "bg-sky-400"}`}
                style={{ left: c.x * scale, top: c.y * scale }} />
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground my-2">
            <input type="checkbox" checked={polarity} onChange={(e) => setPolarity(e.target.checked)} />
            This part has a visible polarity / pin-1 mark
          </label>
          {gt && (
            <p className="text-[11px] font-mono text-foreground mb-2">
              Your label: θ {gt.delta_theta_deg.toFixed(1)}°, Δx {gt.delta_x_px.toFixed(1)} px, Δy {gt.delta_y_px.toFixed(1)} px
            </p>
          )}
          {gtError && <p className="text-[11px] text-amber-400 mb-2">{gtError}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={!gt || busy} onClick={onSave}
              className="h-8 px-3 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold disabled:opacity-40">
              {busy ? "Saving..." : "Save alignment label"}
            </button>
            <button type="button" onClick={() => setClicks([])} className="h-8 px-3 rounded-md border border-border text-xs text-muted-foreground">Redo clicks</button>
            <button type="button" onClick={() => setCrop(null)} className="h-8 px-3 rounded-md border border-border text-xs text-muted-foreground">Crop another part</button>
          </div>
          <StatusLine status={status} />
          {revealed && r && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Model on this crop ({r.method ?? "unknown method"}):{" "}
              {r.available === false ? `no answer (${r.reason})` :
                `θ ${r.delta_theta_deg.toFixed(1)}°, Δx ${r.delta_x_px?.toFixed(1)} px, Δy ${r.delta_y_px?.toFixed(1)} px`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── panel ───────────────────────────────────────────────────────────────

export default function LabelingPanel({ imageUrl, frame, imageSize, captureId, capturedBoardId, frameSource, onLabelingChange }: {
  imageUrl: string | null;
  frame: Blob | null;
  imageSize: [number, number] | null;
  captureId: string | null;
  /** board id recorded with this frame's capture, if one was set then */
  capturedBoardId: string | null;
  frameSource: FrameSource | null;
  onLabelingChange?: (active: boolean) => void;
}) {
  const [mode, setModeState] = useState<Mode>("closed");
  const [labeler, setLabelerState] = useState(getLabeler());
  const [board, setBoardState] = useState(capturedBoardId || getBoardId());
  const [session, setSession] = useState(getCaptureSessionId());
  const boardMismatch = !!capturedBoardId && board.trim() !== "" && board.trim() !== capturedBoardId;

  const setMode = (m: Mode) => {
    setModeState(m);
    onLabelingChange?.(m !== "closed");
  };

  if (!imageUrl) return null;
  if (!isLabelableSource(frameSource)) {
    return (
      <p className="text-[11px] text-muted-foreground mb-5">
        Evaluation labels are only collected for camera photos or uploads of real SERC boards. This frame is a{" "}
        {describeSource(frameSource)}, so it is not labeled.
      </p>
    );
  }

  return (
    <div className="mb-5 rounded-md border border-border p-3 bg-secondary/20">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label for evaluation</h3>
        {mode !== "closed" && (
          <button type="button" onClick={() => setMode("closed")} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">
            done
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">
        Your labels are the ground truth SERC's accuracy is measured against. Label only what you can see in the photo;
        the model's output is hidden while you do.
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2 text-[11px]">
        <label className="flex flex-col gap-0.5 text-muted-foreground">Labeler (name or initials)
          <input value={labeler} onChange={(e) => { setLabelerState(e.target.value); setLabeler(e.target.value); }}
            className="bg-secondary/50 border border-border rounded px-1.5 py-1 text-foreground" />
        </label>
        <label className="flex flex-col gap-0.5 text-muted-foreground">Board ID (this and later captures)
          <input value={board} onChange={(e) => {
            setBoardState(e.target.value);
            setBoardId(e.target.value);
            setSession(getCaptureSessionId());
          }} className="bg-secondary/50 border border-border rounded px-1.5 py-1 text-foreground" />
        </label>
      </div>
      {boardMismatch && (
        <p className="text-[11px] text-amber-400 mb-2">
          This frame was captured as board {capturedBoardId}. Labels saved as {board.trim()} will be rejected;
          set the board ID before detecting, then capture again.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground mb-3 font-mono">capture session {session}</p>

      {mode === "closed" && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode("boxes")}
            className="h-8 px-3 rounded-md bg-primary/15 border border-primary/40 text-primary text-xs font-semibold">Label part boxes</button>
          <button type="button" onClick={() => setMode("align")} disabled={!frame}
            className="h-8 px-3 rounded-md bg-primary/15 border border-primary/40 text-primary text-xs font-semibold disabled:opacity-40">Label one part's alignment</button>
        </div>
      )}
      {mode === "boxes" && (
        !captureId ? (
          <p className="text-[11px] text-amber-400">
            The backend did not save this frame (capture is off: start it with CAPTURE_TRAINING_DATA=1), so it can't be labeled.
          </p>
        ) : !imageSize ? (
          <p className="text-[11px] text-amber-400">The backend did not report the saved image size, so boxes can't be placed.</p>
        ) : (
          <BoxLabeler imageUrl={imageUrl} imageSize={imageSize} captureId={captureId} labeler={labeler} board={board} />
        )
      )}
      {mode === "align" && frame && frameSource && (
        <AlignLabeler imageUrl={imageUrl} frame={frame} frameSource={frameSource} labeler={labeler} board={board} />
      )}
    </div>
  );
}
