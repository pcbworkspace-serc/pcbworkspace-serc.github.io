/**
 * CalibrateButton — small overlay button that opens the calibration wizard.
 *
 * Designed to be placed inside (or right next to) your existing CameraFeed
 * component. It does NOT modify CameraFeed — it just wraps a button and
 * the modal in one tiny component.
 *
 * Usage in Index.tsx (replace `<CameraFeed />` with this two-element block):
 *
 *   <div className="relative">
 *     <CameraFeed />
 *     <CalibrateButton />
 *   </div>
 *
 * The button sits absolutely-positioned in the top-right corner of the
 * camera view. The calibration modal uses grabCameraFrame() from your
 * existing CameraFeed to get the frozen frame.
 */
import { useState } from "react";
import CalibrationModal from "@/components/CalibrationModal";
import { useRobotStatus } from "@/hooks/useRobotStatus";

export default function CalibrateButton() {
  const [showCalib, setShowCalib] = useState(false);
  const { data: status } = useRobotStatus();
  const calibrated = !!status?.calibrated.camera && !!status?.calibrated.workspace;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowCalib(true)}
        title={calibrated ? "Re-calibrate camera and workspace" : "Calibration required before placing parts"}
        className={`absolute top-1 left-1 z-10 text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest transition-colors shadow ${
          calibrated
            ? "bg-black/70 text-[#00d4ff] hover:bg-black/90"
            : "bg-yellow-400 text-black hover:bg-yellow-300"
        }`}
      >
        {calibrated ? "Calibrated" : "Calibrate"}
      </button>
      <CalibrationModal open={showCalib} onOpenChange={setShowCalib} />
    </>
  );
}
