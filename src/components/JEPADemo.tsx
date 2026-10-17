import { useState, useEffect } from "react";

// An illustration of the planned sequence, not a recording: the arm isn't
// assembled, and nothing here has been measured. Each step says what will
// be measured instead of showing a number, so the demo can't be mistaken
// for SERC performance data.
const STEPS = [
  { id:1, title:"Board Scan", desc:"The top camera captures a frame of the board. The YOLOv8n + MobileNetV3 detector proposes and classifies parts, and a saved camera calibration maps pixels to board millimetres.", icon:"📷", color:"#00a3ff", detail:"To be measured: per-class detection precision and recall on held-out SERC boards. Not measured yet." },
  { id:2, title:"Arm Moves to Tray", desc:"The arm moves to the component tray. Inverse kinematics gives the joint angles for the pick position, and the planner drops any target outside the board or the arm's reach.", icon:"🦾", color:"#a855f7", detail:"To be measured: how accurately and repeatably the arm reaches a commanded position, once it is assembled." },
  { id:3, title:"Vacuum Pick", desc:"The nozzle descends and vacuum lifts the part. The nozzle, vacuum and pick confirmation are not built or tested yet.", icon:"⚡", color:"#f59e0b", detail:"To be measured: pick success rate for each part size." },
  { id:4, title:"Bottom Camera Analysis", desc:"The part is held over the bottom camera and the alignment path estimates its rotation and offset: a trained head (synthetic training data so far), with a classical computer-vision fallback.", icon:"🔍", color:"#10b981", detail:"To be measured: alignment error in degrees and mm on real frames labeled by people. Only synthetic-render numbers exist so far." },
  { id:5, title:"Correction Applied", desc:"The estimated correction is applied: the nozzle turns by Δθ and the arm shifts by Δx, Δy.", icon:"🧠", color:"#00d4ff", detail:"To be measured: the error that remains after the correction." },
  { id:6, title:"Placement", desc:"The arm descends and places the part on its pad.", icon:"🎯", color:"#22c55e", detail:"To be measured: end-to-end placement accuracy in mm and degrees, with confidence intervals. Not measured; the arm isn't assembled." },
  { id:7, title:"Placement Validation", desc:"The top camera captures the placed part and a validator flags missing, tombstoned or misaligned parts (trained on synthetic data so far).", icon:"✅", color:"#22c55e", detail:"To be measured: how often the validator's pass/fail call matches a person's on real placements." },
];

function ArmSVG({ step }: { step: number }) {
  const positions = [
    {bx:50,by:85,j1x:50,j1y:65,j2x:50,j2y:40,ex:50,ey:25},
    {bx:50,by:85,j1x:35,j1y:65,j2x:20,j2y:50,ex:15,ey:35},
    {bx:50,by:85,j1x:35,j1y:65,j2x:20,j2y:50,ex:15,ey:48},
    {bx:50,by:85,j1x:50,j1y:65,j2x:50,j2y:45,ex:50,ey:58},
    {bx:50,by:85,j1x:50,j1y:65,j2x:50,j2y:45,ex:50,ey:55},
    {bx:50,by:85,j1x:65,j1y:65,j2x:75,j2y:48,ex:78,ey:38},
    {bx:50,by:85,j1x:65,j1y:65,j2x:75,j2y:48,ex:78,ey:42},
  ];
  const p = positions[Math.min(step,6)];
  const color = STEPS[step]?.color ?? "#00a3ff";
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* PCB board */}
      <rect x="55" y="55" width="38" height="28" rx="2" fill="#0d4f25" stroke="#1a8a4a" strokeWidth="0.5"/>
      {[0,1,2].map(i=><line key={i} x1="57" y1={59+i*8} x2="91" y2={59+i*8} stroke="#c87533" strokeWidth="0.4" opacity="0.7"/>)}
      {[0,1,2,3].map(i=><line key={i} x1={60+i*9} y1="56" x2={60+i*9} y2="82" stroke="#c87533" strokeWidth="0.4" opacity="0.7"/>)}
      {/* Target pad */}
      <rect x="72" y="63" width="7" height="7" rx="0.5" fill={step>=5?"#22c55e":"#d4a84b"} stroke={color} strokeWidth="0.5" opacity="0.9"/>
      {step===6&&<text x="75.5" y="68.5" textAnchor="middle" fill="white" fontSize="4" fontWeight="bold">✓</text>}
      {/* Component tray */}
      <rect x="5" y="55" width="22" height="28" rx="2" fill="#1a1a2e" stroke="#334155" strokeWidth="0.4"/>
      <text x="16" y="73" textAnchor="middle" fill="#475569" fontSize="3.5" fontWeight="bold">TRAY</text>
      {[0,1].map(i=>[0,1,2].map(j=><rect key={`${i}${j}`} x={7+i*9} y={57+j*7} width="7" height="5" rx="0.5" fill={step===1&&i===0&&j===0?"#334155":"#1e40af"} stroke="#2563eb" strokeWidth="0.3"/>))}
      {/* Base */}
      <rect x="44" y="82" width="12" height="5" rx="1.5" fill="#374151"/>
      <circle cx={p.bx} cy={p.by} r="3" fill="#4b5563"/>
      {/* Arm segments */}
      <line x1={p.bx} y1={p.by} x2={p.j1x} y2={p.j1y} stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1={p.j1x} y1={p.j1y} x2={p.j2x} y2={p.j2y} stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round"/>
      <line x1={p.j2x} y1={p.j2y} x2={p.ex} y2={p.ey} stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Joints */}
      <circle cx={p.j1x} cy={p.j1y} r="2.5" fill={color}/>
      <circle cx={p.j2x} cy={p.j2y} r="2" fill={color}/>
      <circle cx={p.ex} cy={p.ey} r="1.5" fill="#f8fafc"/>
      {/* Nozzle */}
      <rect x={p.ex-2} y={p.ey} width="4" height="6" rx="1" fill={step===2||step===5||step===6?"#f59e0b":"#64748b"}/>
      {/* Vacuum effect */}
      {(step===2||step===5)&&<circle cx={p.ex} cy={p.ey+6} r="3" fill="none" stroke="#f59e0b" strokeWidth="0.5" opacity="0.6"><animate attributeName="r" values="3;6;3" dur="0.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0;0.6" dur="0.8s" repeatCount="indefinite"/></circle>}
      {/* JEPA scan beam */}
      {(step===3||step===4)&&<>
        <line x1={p.ex} y1={p.ey+6} x2="75.5" y2="66.5" stroke="#00ffcc" strokeWidth="0.4" strokeDasharray="1.5,1" opacity="0.8"><animate attributeName="opacity" values="0.8;0.2;0.8" dur="0.5s" repeatCount="indefinite"/></line>
        <circle cx={p.ex} cy={p.ey+3} r="4" fill="none" stroke="#00ffcc" strokeWidth="0.3"><animate attributeName="r" values="4;8;4" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0;0.7" dur="1s" repeatCount="indefinite"/></circle>
      </>}
      {/* Bottom camera */}
      <rect x="43" y="86" width="14" height="8" rx="1" fill="#1e293b" stroke="#334155" strokeWidth="0.4"/>
      <circle cx="50" cy="90" r="2.5" fill="#0ea5e9" opacity="0.8"/>
      {step===3&&<circle cx="50" cy="90" r="3" fill="none" stroke="#00ffcc" strokeWidth="0.4"><animate attributeName="r" values="3;7;3" dur="0.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite"/></circle>}
      <text x="50" y="97.5" textAnchor="middle" fill="#475569" fontSize="2.5" fontWeight="bold">CAM</text>
      {/* Correction arrow */}
      {step===4&&<><path d={`M ${p.ex+4} ${p.ey-2} Q ${p.ex+9} ${p.ey-7} ${p.ex+7} ${p.ey}`} fill="none" stroke="#f59e0b" strokeWidth="0.6"/><text x={p.ex+11} y={p.ey-5} fill="#f59e0b" fontSize="3" fontWeight="bold">Δθ</text></>}
    </svg>
  );
}

export default function JEPADemo({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    setProgress(0);
    const prog = setInterval(() => setProgress(p => { if (p >= 100) { clearInterval(prog); return 100; } return p + 100/35; }), 100);
    const adv = setTimeout(() => {
      setStep(s => { const n = s+1; if (n >= STEPS.length) { setPlaying(false); return 0; } return n; });
    }, 3500);
    return () => { clearInterval(prog); clearTimeout(adv); };
  }, [playing, step]);

  const goTo = (i: number) => { setPlaying(false); setProgress(0); setStep(i); };
  const cur = STEPS[step];

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#050d1a] border border-[#00a3ff]/30 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#00a3ff] to-[#0077cc] p-4 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-black/30 rounded-xl flex items-center justify-center"><span className="text-white font-black text-xs">JEPA</span></div>
            <div>
              <h2 className="text-white font-black text-lg leading-tight uppercase tracking-tight">JEPA Vision — Robot Demo</h2>
              <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Illustration of the planned sequence</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl font-bold">×</button>
        </div>

        <div className="px-5 py-2 text-[11px] text-amber-200 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
          This is an animation of how the system is meant to work, not a recording. The arm isn't assembled and none of
          these steps has been measured yet.
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-white/5 shrink-0">
          <div className="h-full bg-gradient-to-r from-[#00a3ff] to-[#00d4ff] transition-all duration-100" style={{width:`${progress}%`}}/>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left — arm animation */}
          <div className="w-[240px] shrink-0 border-r border-white/5 flex flex-col">
            <div className="flex-1 p-3">
              <ArmSVG step={step} />
            </div>
            <div className="px-3 pb-3">
              <div className="rounded-lg px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-widest border" style={{borderColor:`${cur.color}40`,backgroundColor:`${cur.color}15`,color:cur.color}}>
                {cur.icon} {step < 3 ? "MECHANICAL" : "VISION"}
              </div>
            </div>
          </div>

          {/* Right — info */}
          <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border text-white/40 border-white/10 bg-white/5">{step+1}/{STEPS.length}</span>
                <span className="text-2xl">{cur.icon}</span>
              </div>
              <h3 className="text-xl font-black text-white mb-1">{cur.title}</h3>
              <p className="text-sm text-white/65 leading-relaxed">{cur.desc}</p>
            </div>

            {/* Data readout */}
            <div className="rounded-xl border border-white/5 bg-black/40 p-4">
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-2">Evidence needed</p>
              <p className="font-mono text-sm leading-relaxed" style={{color:cur.color}}>{cur.detail}</p>
            </div>

            {/* Neural pipeline */}
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-2">Neural Network Pipeline</p>
              <div className="flex items-center gap-1">
                {["Camera","Encoder","Predictor","Head","Output"].map((n,i,arr)=>{
                  const active = step >= 3;
                  return (
                    <div key={n} className="flex items-center gap-1 flex-1">
                      <div className={`flex-1 rounded p-1.5 text-center border transition-all ${active?"border-[#00a3ff]/40 bg-[#00a3ff]/10":"border-white/5 bg-white/3"}`}>
                        <div className={`text-[9px] font-bold ${active?"text-[#00a3ff]":"text-white/20"}`}>{n}</div>
                      </div>
                      {i<arr.length-1&&<div className={`text-[9px] shrink-0 ${active?"text-[#00a3ff]":"text-white/10"}`}>→</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step validation result */}
            {step===6&&(
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="font-black text-white/80 text-sm">End of the planned sequence</p>
                <p className="text-[11px] text-white/50">No part has been placed or validated on hardware yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 shrink-0">
          <div className="flex gap-1.5 mr-2">
            {STEPS.map((_,i)=>(
              <button key={i} type="button" onClick={()=>goTo(i)} className={`rounded-full transition-all h-2 ${i===step?"w-5 bg-[#00a3ff]":"w-2 bg-white/20 hover:bg-white/40"}`}/>
            ))}
          </div>
          <button type="button" onClick={()=>goTo(Math.max(0,step-1))} disabled={step===0} className="px-3 py-1.5 text-[11px] font-semibold rounded border border-white/10 text-white/60 hover:bg-white/5 disabled:opacity-30">← Prev</button>
          <button type="button" onClick={()=>{if(playing){setPlaying(false);}else{setPlaying(true);}}} className={`px-4 py-1.5 text-[11px] font-bold rounded border transition-colors ${playing?"border-orange-400/30 bg-orange-500/10 text-orange-300":"border-[#00a3ff]/30 bg-[#00a3ff]/10 text-[#00a3ff]"}`}>{playing?"⏸ Pause":"▶ Auto-Play"}</button>
          <button type="button" onClick={()=>goTo(Math.min(STEPS.length-1,step+1))} disabled={step===STEPS.length-1} className="px-3 py-1.5 text-[11px] font-semibold rounded border border-white/10 text-white/60 hover:bg-white/5 disabled:opacity-30">Next →</button>
          <button type="button" onClick={()=>{setPlaying(false);goTo(0);}} className="ml-auto px-3 py-1.5 text-[11px] rounded border border-white/10 text-white/30 hover:bg-white/5">↺ Reset</button>
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-[11px] font-black rounded bg-white text-black hover:bg-white/90">Close</button>
        </div>
      </div>
    </div>
  );
}
