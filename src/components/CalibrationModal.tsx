/**
 * Calibration wizard.
 *
 * Uses the existing CameraFeed's grabCameraFrame() to capture a frozen
 * frame for the user to click PCB corners on. This way:
 *   - The browser owns the camera (your existing setup)
 *   - The same frame your JEPA Vision pipeline sees is what we calibrate against
 *   - No need for Flask to also own a USB camera
 *
 * Phase 1 — Camera calibration: click 4 PCB corners (BL→BR→TR→TL) in
 * a frozen frame. Backend computes a 3×3 homography (camera pixels → PCB-mm).
 *
 * Phase 2 — Workspace calibration: jog the nozzle to each of the same
 * 4 corners and capture. Backend computes a rigid 2D transform
 * (PCB-mm → robot base frame mm).
 */
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { robotClient } from "@/lib/robotClient";
import { useRobotStatus } from "@/hooks/useRobotStatus";
import { PCB_WIDTH_MM, PCB_HEIGHT_MM } from "@/lib/robotConfig";
import { useToast } from "@/hooks/use-toast";
import { grabCameraFrame } from "@/components/CameraFeed";

const CORNER_NAMES = ["bottom-left", "bottom-right", "top-right", "top-left"] as const;
const PCB_CORNERS: [number, number][] = [
  [0, 0],
  [PCB_WIDTH_MM, 0],
  [PCB_WIDTH_MM, PCB_HEIGHT_MM],
  [0, PCB_HEIGHT_MM],
];

type Phase = "camera" | "workspace" | "done";

interface CalibrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CalibrationModal({ open, onOpenChange }: CalibrationModalProps) {
  const [phase, setPhase] = useState<Phase>("camera");
  const [cornerIdx, setCornerIdx] = useState(0);
  const [pixelPts, setPixelPts] = useState<[number, number][]>([]);
  const [robotPts, setRobotPts] = useState<[number, number, number][]>([]);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { data: status } = useRobotStatus({ enabled: open });
  const { toast } = useToast();

  // When the modal opens (or comes back to camera phase), grab a frozen
  // frame from your existing CameraFeed component.
  useEffect(() => {
    if (!open || phase !== "camera") return;
    let cancel = false;
    let createdUrl: string | null = null;

    setBusy(true);
    grabCameraFrame()
      .then((blob) => {
        if (cancel) return;
        if (!blob) {
          toast({
            title: "No camera frame available",
            description: "Make sure the camera in the sidebar is showing a Live Feed before calibrating.",
            variant: "destructive",
          });
          setBusy(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        createdUrl = url;
        setFrameUrl(url);
        setBusy(false);
      })
      .catch((e) => {
        if (cancel) return;
        toast({
          title: "Couldn't capture frame",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        setBusy(false);
      });

    return () => {
      cancel = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, phase, toast]);

  // Reset everything when the modal closes
  useEffect(() => {
    if (!open) {
      setPhase("camera");
      setCornerIdx(0);
      setPixelPts([]);
      setRobotPts([]);
      setFrameUrl(null);
    }
  }, [open]);

  const handleImgLoad = () => {
    const img = imgRef.current;
    if (img) setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (phase !== "camera" || !imgNatural) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const u = ((e.clientX - rect.left) / rect.width) * imgNatural.w;
    const v = ((e.clientY - rect.top) / rect.height) * imgNatural.h;
    const newPts = [...pixelPts, [u, v] as [number, number]];
    setPixelPts(newPts);

    if (newPts.length === 4) {
      setBusy(true);
      try {
        await robotClient.calibrateCamera(newPts, PCB_CORNERS);
        setPhase("workspace");
        setCornerIdx(0);
        toast({ title: "Camera calibrated", description: "Now jog the nozzle to each PCB corner." });
      } catch (err) {
        toast({
          title: "Camera calibration failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
        setPixelPts([]);
      } finally {
        setBusy(false);
      }
    } else {
      setCornerIdx(newPts.length);
    }
  };

  const handleCaptureCorner = async () => {
    if (phase !== "workspace") return;
    const xyz = status?.current_xyz;
    let captured: [number, number, number];
    if (xyz) {
      captured = xyz;
    } else {
      const txt = window.prompt(
        `Backend has no current XYZ. Enter robot position at "${CORNER_NAMES[cornerIdx]}" corner (mm, comma-separated):`,
      );
      if (!txt) return;
      const parts = txt.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length !== 3 || parts.some(Number.isNaN)) {
        toast({ title: "Bad input", description: "Need three numbers", variant: "destructive" });
        return;
      }
      captured = [parts[0], parts[1], parts[2]];
    }
    const next = [...robotPts, captured];
    setRobotPts(next);

    if (next.length === 4) {
      setBusy(true);
      try {
        await robotClient.calibrateWorkspace(PCB_CORNERS, next);
        setPhase("done");
        toast({ title: "Workspace calibrated", description: "Robot is ready to place parts." });
      } catch (err) {
        toast({
          title: "Workspace calibration failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
        setRobotPts([]);
      } finally {
        setBusy(false);
      }
    } else {
      setCornerIdx(next.length);
    }
  };

  const stepTitle =
    phase === "camera"
      ? "Step 1 of 2: Camera calibration"
      : phase === "workspace"
      ? "Step 2 of 2: Workspace calibration"
      : "Calibration complete";

  const stepBody =
    phase === "camera"
      ? `Click the ${CORNER_NAMES[cornerIdx]} corner of the PCB in the camera image.`
      : phase === "workspace"
      ? `Manually jog the nozzle to the ${CORNER_NAMES[cornerIdx]} corner of the PCB, then click Capture.`
      : "Both calibrations are saved. Drag a part onto the 3D PCB to command the robot.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{stepTitle}</DialogTitle>
          <DialogDescription>{stepBody}</DialogDescription>
        </DialogHeader>

        {phase === "camera" && frameUrl && (
          <div className="relative">
            <img
              ref={imgRef}
              src={frameUrl}
              alt="Top camera frame"
              onLoad={handleImgLoad}
              onClick={handleImageClick}
              className="w-full max-h-[60vh] object-contain cursor-crosshair select-none border border-border rounded"
              draggable={false}
            />
            {imgRef.current && imgNatural && pixelPts.map(([u, v], i) => {
              const rect = imgRef.current!.getBoundingClientRect();
              const dispX = (u / imgNatural.w) * rect.width;
              const dispY = (v / imgNatural.h) * rect.height;
              return (
                <div
                  key={i}
                  className="absolute w-3 h-3 rounded-full bg-yellow-400 border-2 border-black -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ left: dispX, top: dispY }}
                />
              );
            })}
          </div>
        )}

        {phase === "camera" && !frameUrl && !busy && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No camera frame yet. Make sure the sidebar camera shows "Live Feed".
          </div>
        )}

        {phase === "workspace" && (
          <div className="space-y-3">
            <div className="text-sm">
              Captured corners:&nbsp;
              <span className="font-mono">{robotPts.length} / 4</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Current robot position:&nbsp;
              {status?.current_xyz ? (
                <span className="font-mono">
                  X {status.current_xyz[0].toFixed(1)} &nbsp;
                  Y {status.current_xyz[1].toFixed(1)} &nbsp;
                  Z {status.current_xyz[2].toFixed(1)}
                </span>
              ) : (
                <span className="text-yellow-500">unknown — type manually when prompted</span>
              )}
            </div>
            <Button onClick={handleCaptureCorner} disabled={busy} className="w-full">
              Capture {CORNER_NAMES[cornerIdx]}
            </Button>
          </div>
        )}

        {phase === "done" && (
          <div className="text-sm text-muted-foreground">
            Calibration data saved to the backend. You can close this window.
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {phase === "done" ? "Close" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
