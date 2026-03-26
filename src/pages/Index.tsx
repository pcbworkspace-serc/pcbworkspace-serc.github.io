import PCBWorkspace from "@/components/PCBWorkspace";
import Inventory from "@/components/Inventory";
import CameraFeed from "@/components/CameraFeed";
import SavedFiles from "@/components/SavedFiles";
import JEPADemo from "@/components/JEPADemo";
import NNPanel from "@/components/NNPanel";
import PCBRobot from "@/components/PCBRobot";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession, getCurrentUserEmail } from "@/lib/auth";

const Index = () => {
  const [boardItems, setBoardItems] = useState<any[]>([]);
  const [showDemo, setShowDemo] = useState(false);
  const [showRobot, setShowRobot] = useState(true);
  const navigate = useNavigate();
  const email = getCurrentUserEmail();

  return (
    <div className="h-screen w-screen flex overflow-hidden relative">
      {showDemo && <JEPADemo onClose={() => setShowDemo(false)} />}

      {/* Top nav bar */}
      <div className="absolute top-0 right-0 z-50 flex items-center gap-2 px-4 py-2">
        <span className="text-xs text-primary/90 max-w-[200px] truncate">{email ?? ""}</span>
        <button type="button" onClick={() => navigate("/login", { replace: true })} className="text-xs rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10 transition-colors">Switch Account</button>
        <button type="button" onClick={() => { clearSession(); navigate("/login", { replace: true }); }} className="text-xs rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10 transition-colors">Logout</button>
        <a href="https://spaceroboticscreations.com/" target="_blank" rel="noopener noreferrer" className="text-primary text-xs font-bold opacity-70 hover:opacity-100 transition-opacity">SERC ↗</a>
        <button type="button" onClick={() => setShowRobot(v => !v)} className="text-xs rounded border border-primary/40 px-3 py-1 text-primary hover:bg-primary/10 transition-colors font-semibold">{showRobot ? "Hide Robot" : "Show Robot"}</button>
      </div>

      {/* Left sidebar — blue */}
      <div className="w-[240px] shrink-0 flex flex-col gap-4 p-4 pt-3" style={{background:"linear-gradient(to bottom, hsl(195,100%,50%), hsl(210,100%,40%))"}}>
        <div className="flex items-center gap-3 mt-1">
          <img src="/serc-robot-transparent.png" alt="SERC Robot" className="h-20 w-20 object-contain drop-shadow-lg" />
          <div>
            <h1 className="font-black text-2xl text-black leading-tight">Mini MEE</h1>
            <p className="text-[11px] font-bold text-black/70">Be My Engineer!</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
          <CameraFeed />
          <div className="bg-black/20 rounded-xl p-3 border border-black/10">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-black font-black text-[10px] uppercase tracking-widest">JEPA Vision</h3>
              <span className="text-[8px] bg-black text-[#00a3ff] px-1.5 py-0.5 rounded font-black">LIVE</span>
            </div>
            <NNPanel />
            <button type="button" onClick={() => setShowDemo(true)} className="mt-2 w-full py-1.5 bg-black text-[#00a3ff] text-[10px] font-black rounded uppercase tracking-widest hover:bg-black/80 transition-colors">Open Demo</button>
          </div>
          <Inventory />
        </div>
        <div className="bg-black text-white text-[10px] font-black px-3 py-2 rounded border border-white/10 uppercase tracking-widest text-center">Educational Version</div>
      </div>

      {/* Center — PCB board */}
      <div className="flex-1 flex flex-col min-w-0 pt-10">
        <div className="flex-1 p-3 pt-1">
          <div className="h-full rounded-xl border border-primary/30 overflow-hidden flex flex-col" style={{backgroundColor:"hsla(220,70%,10%,0.9)"}}>
            <div className="text-center py-1.5 border-b border-primary/20">
              <span className="text-primary font-black text-[11px] tracking-widest uppercase">PCB Workspace</span>
            </div>
            <div className="flex-1">
              <PCBWorkspace items={boardItems} onItemsChange={setBoardItems} />
            </div>
          </div>
        </div>
        {/* Bottom buttons */}
        <div className="flex gap-2 px-3 pb-3 justify-end">
          <SavedFiles onOpenProject={() => {}} />
          <button type="button" className="h-12 px-4 rounded-md border border-white/25 bg-white/5 hover:bg-white/10 transition-colors text-[11px] font-semibold text-white/90">Export</button>
          <button type="button" className="h-12 px-4 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors text-[11px] font-semibold text-primary">Save Project</button>
        </div>
      </div>

      {/* Right — PCB Robot chat panel */}
      {showRobot && (
        <div className="w-[320px] shrink-0 flex flex-col pt-10 border-l border-primary/20" style={{backgroundColor:"hsla(220,70%,8%,0.97)"}}>
          <PCBRobot />
        </div>
      )}
    </div>
  );
};

export default Index;
