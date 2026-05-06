import { useState, useEffect } from "react";
import { getNNStatus, getAlignmentCorrection, getDetection, getValidation, pingNNServer } from "@/lib/nn";
import type { NNStatus, AlignmentResult, DetectionResult, ValidationResult } from "@/lib/nn";

type Tab = "align" | "detect" | "validate";

export default function NNPanel() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [tab, setTab] = useState<Tab>("align");
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) pingNNServer().then(setOnline);
  }, [open]);

  const runAlign = async () => {
    setBusy(true);
    const res = await getAlignmentCorrection();
    setAlignment(res);
    setBusy(false);
  };

  const runDetect = async () => {
    setBusy(true);
    const res = await getDetection();
    setDetection(res);
    setBusy(false);
  };

  const runValidate = async () => {
    setBusy(true);
    const res = await getValidation();
    setValidation(res);
    setBusy(false);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[300]">
        <button onClick={() => setOpen(true)} className="rounded-full px-5 py-2.5 text-[10px] font-black border border-[#00a3ff]/40 bg-[#00a3ff] text-black hover:bg-[#00a3ff]/90 shadow-2xl transition-all uppercase tracking-widest">
          Ask Layla
        </button>
      </div>

      {open && (
        <div className="fixed bottom-20 right-6 z-[300] w-[320px]">
          <div className="rounded-xl border border-white/10 bg-[#0a192f]/95 backdrop-blur-md shadow-2xl p-4 font-sans">
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-[11px] text-[#00a3ff] uppercase tracking-tighter">Layla <span className="text-white/80">Neural Engine</span></div>
              <button onClick={() => setOpen(false)} className="text-white/20 hover:text-white/80 text-xl">×</button>
            </div>

            <div className="flex items-center text-[10px] mb-4 font-bold uppercase tracking-wide">
              <span className={`w-2 h-2 rounded-full mr-2 ${online ? "bg-[#10b981] animate-pulse" : "bg-red-500"}`} />
              <span className={online ? "text-[#10b981]" : "text-red-400"}>{online ? "System Ready" : "System Offline"}</span>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-black/30 rounded-lg p-1 mb-3">
              {(["align", "detect", "validate"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded transition-all
                    ${tab === t ? "bg-[#00a3ff] text-black" : "text-white/40 hover:text-white/70"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="bg-black/40 rounded-lg p-3 border border-white/5">

              {/* ALIGN */}
              {tab === "align" && (
                <>
                  <p className="text-[9px] font-black text-white/40 uppercase mb-2 tracking-widest">Alignment Vector</p>
                  {alignment ? (
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      {[['Theta', alignment.delta_theta_deg.toFixed(1) + '°'], ['X', alignment.delta_x_mm.toFixed(2)], ['Y', alignment.delta_y_mm.toFixed(2)]].map(([label, val]) => (
                        <div key={label} className="bg-white/5 rounded py-1.5">
                          <div className="text-[8px] text-white/30 font-bold uppercase">{label}</div>
                          <div className="text-[#10b981] font-mono text-[11px] font-black">{val}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-[10px] text-white/20 text-center py-2 italic">Waiting for input...</p>}
                  <button onClick={runAlign} disabled={!online || busy} className="w-full text-[10px] font-black rounded py-2 bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 uppercase tracking-widest disabled:opacity-20 transition-all">
                    {busy ? "Calculating..." : "Run Alignment"}
                  </button>
                </>
              )}

              {/* DETECT */}
              {tab === "detect" && (
                <>
                  <p className="text-[9px] font-black text-white/40 uppercase mb-2 tracking-widest">Component Detection</p>
                  {detection ? (
                    <div className="mb-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-black text-[#00a3ff]">{detection.class_name}</span>
                        <span className="text-[10px] text-[#10b981] font-mono">{(detection.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 text-center">
                        {["cx","cy","w","h"].map((label, i) => (
                          <div key={label} className="bg-white/5 rounded py-1">
                            <div className="text-[7px] text-white/30 uppercase">{label}</div>
                            <div className="text-[9px] font-mono text-white/60">{detection.bbox[i].toFixed(3)}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[8px] text-white/20 text-right">{detection.inference_ms} ms</p>
                    </div>
                  ) : <p className="text-[10px] text-white/20 text-center py-2 italic">Waiting for input...</p>}
                  <button onClick={runDetect} disabled={!online || busy} className="w-full text-[10px] font-black rounded py-2 bg-[#00a3ff]/20 text-[#00a3ff] border border-[#00a3ff]/30 uppercase tracking-widest disabled:opacity-20 transition-all">
                    {busy ? "Detecting..." : "Run Detection"}
                  </button>
                </>
              )}

              {/* VALIDATE */}
              {tab === "validate" && (
                <>
                  <p className="text-[9px] font-black text-white/40 uppercase mb-2 tracking-widest">Quality Validation</p>
                  {validation ? (
                    <div className="mb-3 space-y-2">
                      <div className={`text-center py-2 rounded-lg font-black text-lg tracking-widest
                        ${validation.decision === "PASS" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-red-500/20 text-red-400"}`}>
                        {validation.decision}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        {[["Pass", validation.pass_prob], ["Fail", validation.fail_prob]].map(([label, prob]) => (
                          <div key={label as string} className="bg-white/5 rounded py-1">
                            <div className="text-[7px] text-white/30 uppercase">{label as string}</div>
                            <div className="text-[10px] font-mono text-white/70">{((prob as number) * 100).toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[8px] text-white/20 text-right">{validation.inference_ms} ms</p>
                    </div>
                  ) : <p className="text-[10px] text-white/20 text-center py-2 italic">Waiting for input...</p>}
                  <button onClick={runValidate} disabled={!online || busy} className="w-full text-[10px] font-black rounded py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 uppercase tracking-widest disabled:opacity-20 transition-all">
                    {busy ? "Validating..." : "Run Validation"}
                  </button>
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}
