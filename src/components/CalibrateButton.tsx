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
        title={calibrated ? "Camera & workspace calibrated â€” click to re-run" : "Calibrate camera and workspace"}
        className={`absolute bottom-1 left-1 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow ${
          calibrated
            ? "bg-black/70 text-emerald-300 hover:bg-black/90"
            : "bg-yellow-400 text-black hover:bg-yellow-300"
        }`}
      >
        <span className="text-[12px] leading-none">âš™</span>
      </button>
      <CalibrationModal open={showCalib} onOpenChange={setShowCalib} />
    </>
  );
}