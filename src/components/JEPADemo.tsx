import { useState, useEffect, useRef, useCallback } from "react";
type DemoStep = { id: number; title: string; subtitle: string; phase: "scan"|"pick"|"align"|"correct"|"place"|"validate"; armX: number; armY: number; correction: { theta: number; dx: number; dy: number } | null; validation: "none"|"pass"|"fail"; jepaActive: boolean; explanation: string; };
const STEPS: DemoStep[] = [
  { id:0, title:"Step 1 — Board Scan", subtitle:"Top camera captures PCB", phase:"scan", armX:50, armY:20, correction:null, validation:"none", jepaActive:false, explanation:"The top camera captures a frame of the PCB board. JEPA's ComponentDetector analyzes the image to find fiducial markers and map component pad locations — no manual calibration needed." },
  { id:1, title:"Step 2 — Component Pick", subtitle:"Arm moves to tray", phase:"pick", armX:20, armY:40, correction:null, validation:"none", jepaActive:false, explanation:"The arm moves to the component tray. The vacuum nozzle picks up the part. The pressure sensor confirms a successful pick — if no pressure change is detected, the pick is retried automatically." },
  { id:2, title:"Step 3 — Bottom Camera", subtitle:"JEPA analyzes component orientation", phase:"align", armX:50, armY:55, correction:null, validation:"none", jepaActive:true, explanation:"The arm flies the component over the bottom camera. JEPA's AlignmentCorrector processes the video stream and predicts the rotation and XY offset needed — working in embedding space, not raw pixels, so it is robust to lighting changes." },
  { id:3, title:"Step 4 — JEPA Correction", subtitle:"Neural network computes correction", phase:"correct", armX:50, armY:55, correction:{theta:12.4,dx:0.18,dy:-0.09}, validation:"none", jepaActive:true, explanation:"JEPA outputs the correction vector: rotate 12.4 degrees, shift X by 0.18mm, shift Y by -0.09mm. The NEMA 8 hollow shaft motor applies the rotation. The arm controller adjusts XY. All within 25ms." },
  { id:4, title:"Step 5 — Placement", subtitle:"Corrected component placed on pad", phase:"place", armX:72, armY:45, correction:{theta:0,dx:0,dy:0}, validation:"none", jepaActive:false, explanation:"With corrections applied, the arm places the component on the target pad. The vacuum releases. A 150ms settle delay ensures vibrations decay before the final camera check." },
  { id:5, title:"Step 6 — Validation", subtitle:"JEPA checks placement result", phase:"validate", armX:72, armY:45, correction:null, validation:"pass", jepaActive:true, explanation:"JEPA PlacementValidator compares pre and post placement top camera frames. By comparing embeddings not pixels, it detects tombstoning, misalignment, wrong components, and missing placements. Result: PASS." },
];
function ArmSVG({ step }: { step: DemoStep }) {
  const bx=50, by=90, sx=50, sy=70, ex=step.armX, ey=step.armY+20, wx=step.armX+5, wy=step.armY+35;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="40" y="55" width="45" height="30" rx="1" fill="#0d4f25" stroke="#1a8a4a" strokeWidth="0.5"/>
      {[0,1,2,3].map(i=><line key={i} x1="42" y1={58+i*6} x2="83" y2={58+i*6} stroke="#c87533" strokeWidth="0.3" opacity="0.5"/>)}
      {[0,1,2,3,4].map(i=><line key={i} x1={45+i*8} y1="56" x2={45+i*8} y2="84" stroke="#c87533" strokeWidth="0.3" opacity="0.5"/>)}
      <rect x="68" y="62" width="6" height="6" rx="0.5" fill={step.validation==="pass"?"#22c55e":step.validation==="fail"?"#ef4444":"#d4a84b"} stroke={step.jepaActive?"#00ffcc":"#d4a84b"} strokeWidth="0.5"/>
      <rect x="5" y="60" width="18" height="20" rx="1" fill="#1a1a2e" stroke="#334155" strokeWidth="0.3"/>
      <text x="14" y="73" textAnchor="middle" fill="#64748b" fontSize="3">TRAY</text>
      <rect x="46" y="87" width="8" height="4" rx="1" fill="#334155"/>
      <line x1={bx} y1={by} x2={sx} y2={sy} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1={ex} y1={ey} x2={wx} y2={wy} stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round"/>
      <circle cx={sx} cy={sy} r="1.5" fill="#0ea5e9"/>
      <circle cx={ex} cy={ey} r="1.2" fill="#0ea5e9"/>
      <circle cx={wx} cy={wy} r="1" fill="#38bdf8"/>
      <rect x={wx-1.5} y={wy} width="3" height="5" rx="0.5" fill={step.phase==="pick"||step.phase==="place"?"#f59e0b":"#64748b"}/>
      {step.jepaActive&&<circle cx={wx} cy={wy+3} r="3" fill="none" stroke="#00ffcc" strokeWidth="0.3"><animate attributeName="r" values="3;7;3" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="indefinite"/></circle>}
      {step.validation!=="none"&&<text x="71" y="67" textAnchor="middle" fill={step.validation==="pass"?"#22c55e":"#ef4444"} fontSize="5">{step.validation==="pass"?"V":"X"}</text>}
      <rect x="42" y="88" width="8" height="5" rx="0.5" fill="#1e293b" stroke="#334155" strokeWidth="0.3"/>
      <circle cx="46" cy="90.5" r="1.5" fill="#0ea5e9" opacity="0.7"/>
      {step.jepaActive&&step.phase==="align"&&<circle cx="46" cy="90.5" r="2" fill="none" stroke="#00ffcc" strokeWidth="0.3"><animate attributeName="r" values="2;6;2" dur="0.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite"/></circle>}
    </svg>
  );
}
export default function JEPADemo({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [prog, setProg] = useState(0);
  const intRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const progRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const step = STEPS[cur];
  const stopAll = useCallback(()=>{ if(intRef.current){clearInterval(intRef.current);intRef.current=null;} if(progRef.current){clearInterval(progRef.current);progRef.current=null;} },[]);
  const play = useCallback(()=>{ stopAll(); setProg(0); setPlaying(true); progRef.current=setInterval(()=>setProg(p=>p>=100?100:p+100/35),100); intRef.current=setInterval(()=>{ setCur(p=>{ const n=p+1; if(n>=STEPS.length){stopAll();setPlaying(false);setProg(0);return 0;} setProg(0);return n; }); },3500); },[stopAll]);
  const goTo = useCallback((i:number)=>{ stopAll();setPlaying(false);setProg(0);setCur(i); },[stopAll]);
  useEffect(()=>()=>stopAll(),[stopAll]);
  const phaseColor: Record<string,string> = { scan:"text-blue-300 bg-blue-500/10 border-blue-400/20", pick:"text-yellow-300 bg-yellow-500/10 border-yellow-400/20", align:"text-cyan-300 bg-cyan-500/10 border-cyan-400/20", correct:"text-orange-300 bg-orange-500/10 border-orange-400/20", place:"text-green-300 bg-green-500/10 border-green-400/20", validate:"text-emerald-300 bg-emerald-500/10 border-emerald-400/20" };
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-[680px] max-w-[95vw] max-h-[90vh] rounded-xl border border-cyan-400/20 bg-[#050d1a] shadow-[0_0_60px_rgba(0,200,255,0.1)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div><h2 className="text-sm font-bold text-cyan-300 tracking-wider">JEPA VISION — INTERACTIVE DEMO</h2><p className="text-[10px] text-white/40">How the robot arm uses neural networks for precision PCB placement</p></div>
          <button type="button" onClick={onClose} className="text-white/30 hover:text-white/80 text-xl leading-none">x</button>
        </div>
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-[200px] shrink-0 border-r border-white/5 flex flex-col">
            <div className="flex-1 p-2"><ArmSVG step={step}/></div>
            <div className="px-3 pb-3"><div className={["rounded px-2 py-1 text-center text-[10px] font-bold uppercase tracking-widest border",step.jepaActive?"bg-cyan-500/10 border-cyan-400/30 text-cyan-300":"bg-white/5 border-white/10 text-white/40"].join(" ")}>{step.jepaActive?"JEPA ACTIVE":"MECHANICAL"}</div></div>
          </div>
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-cyan-400/60 bg-cyan-400/5 border border-cyan-400/10 rounded px-1.5 py-0.5">{cur+1}/{STEPS.length}</span>
                <span className={["text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",phaseColor[step.phase]].join(" ")}>{step.phase}</span>
              </div>
              <h3 className="text-base font-bold text-white">{step.title}</h3>
              <p className="text-[11px] text-white/50">{step.subtitle}</p>
            </div>
            <div className="rounded-lg bg-white/3 border border-white/5 p-3"><p className="text-[11px] text-white/70 leading-relaxed">{step.explanation}</p></div>
            <div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mb-1.5">Neural Network Pipeline</p>
              <div className="flex items-center gap-1">
                {[{l:"Camera",s:"Input",a:true},{l:"Encoder",s:"ViT",a:step.jepaActive},{l:"Predictor",s:"4-layer",a:step.jepaActive&&step.phase==="align"},{l:"Head",s:step.phase==="validate"?"Validator":step.phase==="align"||step.phase==="correct"?"Aligner":"Detector",a:step.jepaActive},{l:"Output",s:step.correction?`${step.correction.theta.toFixed(1)}deg`:step.validation!=="none"?step.validation.toUpperCase():"---",a:step.jepaActive}].map((n,i,arr)=>(
                  <div key={n.l} className="flex items-center gap-1 flex-1">
                    <div className={["flex-1 rounded p-1 text-center transition-all duration-500",n.a?"bg-cyan-500/20 border border-cyan-400/40":"bg-black/20 border border-white/5"].join(" ")}>
                      <div className={["text-[9px] font-bold",n.a?"text-cyan-300":"text-white/30"].join(" ")}>{n.l}</div>
                      <div className={["text-[8px]",n.a?"text-cyan-400/70":"text-white/20"].join(" ")}>{n.s}</div>
                    </div>
                    {i<arr.length-1&&<div className={["text-[8px] shrink-0",n.a?"text-cyan-400":"text-white/10"].join(" ")}>&gt;</div>}
                  </div>
                ))}
              </div>
            </div>
            {step.correction&&(step.correction.theta!==0||step.correction.dx!==0)&&(
              <div className="rounded-lg bg-orange-500/5 border border-orange-400/20 p-3">
                <p className="text-[9px] text-orange-400/60 uppercase tracking-widest mb-2">JEPA Correction Vector</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[["Theta",`${step.correction.theta>0?"+":""}${step.correction.theta.toFixed(1)} deg`,Math.abs(step.correction.theta)>0],["Dx",`${step.correction.dx>0?"+":""}${step.correction.dx.toFixed(2)}mm`,Math.abs(step.correction.dx)>0],["Dy",`${step.correction.dy>0?"+":""}${step.correction.dy.toFixed(2)}mm`,Math.abs(step.correction.dy)>0]].map(([l,v,active])=>(
                    <div key={String(l)} className="rounded bg-black/30 p-1.5">
                      <div className="text-[9px] text-white/30">{l}</div>
                      <div className={["font-mono text-sm font-bold",active?"text-orange-300":"text-white/20"].join(" ")}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {step.validation!=="none"&&(
              <div className={["rounded-lg p-3 border",step.validation==="pass"?"bg-emerald-500/10 border-emerald-400/30":"bg-red-500/10 border-red-400/30"].join(" ")}>
                <div className="flex items-center gap-2">
                  <span className={["text-2xl",step.validation==="pass"?"text-emerald-400":"text-red-400"].join(" ")}>{step.validation==="pass"?"V":"X"}</span>
                  <div><p className={["font-bold text-sm",step.validation==="pass"?"text-emerald-300":"text-red-300"].join(" ")}>Placement {step.validation==="pass"?"PASSED":"FAILED"}</p><p className="text-[10px] text-white/40">{step.validation==="pass"?"Component correctly placed within tolerance":"Misalignment detected — retry triggered"}</p></div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="h-0.5 bg-white/5"><div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-100" style={{width:`${prog}%`}}/></div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5">
          <div className="flex gap-1.5 mr-2">{STEPS.map((s,i)=><button key={s.id} type="button" onClick={()=>goTo(i)} className={["rounded-full transition-all",i===cur?"bg-cyan-400 w-4 h-2":"bg-white/20 hover:bg-white/40 w-2 h-2"].join(" ")}/>)}</div>
          <button type="button" onClick={()=>goTo(Math.max(0,cur-1))} disabled={cur===0} className="px-3 py-1.5 text-[11px] font-semibold rounded border border-white/10 text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors">Prev</button>
          <button type="button" onClick={()=>playing?(stopAll(),setPlaying(false)):play()} className={["px-4 py-1.5 text-[11px] font-bold rounded border transition-colors",playing?"border-orange-400/30 bg-orange-500/10 text-orange-300":"border-cyan-400/30 bg-cyan-500/10 text-cyan-300"].join(" ")}>{playing?"Pause":"Auto-Play"}</button>
          <button type="button" onClick={()=>goTo(Math.min(STEPS.length-1,cur+1))} disabled={cur===STEPS.length-1} className="px-3 py-1.5 text-[11px] font-semibold rounded border border-white/10 text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors">Next</button>
          <button type="button" onClick={()=>{stopAll();setCur(0);setPlaying(false);setProg(0);}} className="ml-auto px-3 py-1.5 text-[11px] font-semibold rounded border border-white/10 text-white/30 hover:bg-white/5 transition-colors">Reset</button>
        </div>
      </div>
    </div>
  );
}
