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
        title={calibrated ? "Camera and workspace calibrated - click to re-run" : "Calibrate camera and workspace"}
        className={`absolute top-1 right-1 z-10 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider transition-colors shadow ${
          calibrated
            ? "bg-black/70 text-emerald-300 hover:bg-black/90"
            : "bg-yellow-400 text-black hover:bg-yellow-300"
        }`}
      >
        {calibrated ? "CAL OK" : "CAL"}
      </button>
      <CalibrationModal open={showCalib} onOpenChange={setShowCalib} />
    </>
  );
}