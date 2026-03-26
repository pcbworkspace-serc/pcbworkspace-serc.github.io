import React from "react";

export default function JEPADemo({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="relative w-full max-w-4xl bg-[#0a0d14] border border-[#00a3ff]/30 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="bg-[#00a3ff] p-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-black rounded-lg flex items-center justify-center"><span className="text-[#00a3ff] font-black text-xs">JEPA</span></div>
            <div>
              <h2 className="text-black font-black text-lg leading-tight tracking-tighter uppercase">JEPA Vision Demo</h2>
              <p className="text-[9px] font-bold text-black/70 uppercase tracking-widest">Interactive Component Analysis</p>
            </div>
          </div>
          <button onClick={onClose} className="text-black/60 hover:text-black text-2xl font-bold">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="aspect-video bg-black rounded-xl border border-white/10 relative overflow-hidden flex items-center justify-center">
              <span className="bg-[#10b981] absolute top-3 left-3 text-black text-[8px] font-black px-2 py-0.5 rounded uppercase">Live Feed</span>
              <div className="text-white/20 font-black text-xs uppercase tracking-[0.3em]">Vision Stream</div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00a3ff]/10 to-transparent h-1/2 w-full animate-scan" />
            </div>
            <div className="space-y-4">
              <h3 className="text-[#00a3ff] font-black text-xs uppercase tracking-widest">Neural Status</h3>
              <div className="grid grid-cols-2 gap-3 text-white">
                <div className="bg-white/5 border border-white/10 p-3 rounded-lg"><p className="text-[8px] text-white/40 font-black uppercase">Confidence</p><p className="text-xl font-black">98.4%</p></div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-lg"><p className="text-[8px] text-white/40 font-black uppercase">Latency</p><p className="text-xl font-black text-[#10b981]">12ms</p></div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6">
            <h3 className="text-white/40 font-black text-[10px] uppercase tracking-widest mb-4">Manual Overrides</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {['Recalibrate', 'Capture', 'Run Align', 'Analyze'].map((btn, i) => (
                <button key={btn} className={`py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${i===2 ? 'bg-[#10b981]/20 border border-[#10b981]/30 text-[#10b981]' : i===3 ? 'bg-[#00a3ff]/20 border border-[#00a3ff]/30 text-[#00a3ff]' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'}`}>
                  {btn}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-black/40 border-t border-white/5 px-6 py-3 flex justify-between items-center">
          <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">SERC – Automated Assembly</span>
          <button onClick={onClose} className="px-6 py-2 bg-white text-black text-[10px] font-black rounded uppercase tracking-widest hover:bg-white/90 shadow-lg">Close Demo</button>
        </div>
      </div>
    </div>
  );
}