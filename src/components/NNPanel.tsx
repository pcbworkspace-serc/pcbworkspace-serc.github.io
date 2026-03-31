import { useState, useEffect, useCallback } from "react";
import { getNNStatus, getAlignmentCorrection, pingNNServer } from "@/lib/nn";
import type { NNStatus, AlignmentResult } from "@/lib/nn";

export default function NNPanel() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
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

  return (
    <>
      <div className="fixed bottom-24 left-64 z-[300]">
        <button onClick={() => setOpen(true)} className="rounded-full px-5 py-2.5 text-[10px] font-black border border-[#00a3ff]/40 bg-[#00a3ff] text-black hover:bg-[#00a3ff]/90 shadow-2xl transition-all uppercase tracking-widest">
          Run Alignment
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
            <div className="bg-black/40 rounded-lg p-3 border border-white/5">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
