import { useState, useEffect, useCallback, useRef } from "react";
import { getNNStatus, getAlignmentCorrection, detectComponent, validatePlacement, startPretraining, startFinetuning, getTrainingStatus, pingNNServer } from "@/lib/nn";
import type { NNStatus, AlignmentResult, DetectionResult, ValidationResult, TrainingStatus } from "@/lib/nn";
export default function NNPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<NNStatus | null>(null);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { if (!open) return; pingNNServer().then(ok => { setOnline(ok); if (ok) getNNStatus().then(setStatus).catch(() => {}); }); }, [open]);
  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);
  const startPoll = useCallback(() => { if (pollRef.current) return; pollRef.current = setInterval(async () => { const s = await getTrainingStatus(); setTraining(s); if (!s.running) { clearInterval(pollRef.current!); pollRef.current = null; getNNStatus().then(setStatus); } }, 2000); }, []);
  const runAlign = useCallback(async () => { setBusy("align"); setError(null); try { setAlignment(await getAlignmentCorrection()); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, []);
  const runDetect = useCallback(async () => { setBusy("detect"); setError(null); try { setDetection(await detectComponent()); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, []);
  const runValidate = useCallback(async () => { setBusy("validate"); setError(null); try { setValidation(await validatePlacement()); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, []);
  const runPretrain = useCallback(async () => { setBusy("train"); setError(null); try { await startPretraining(200); startPoll(); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, [startPoll]);
  const runFinetune = useCallback(async () => { setBusy("fine"); setError(null); try { await startFinetuning(50); startPoll(); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, [startPoll]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-start p-4 pointer-events-none">
      <div className="pointer-events-auto w-[280px] rounded-xl border border-cyan-300/25 bg-gradient-to-b from-[#071a2e]/95 to-[#04101f]/95 shadow-[0_12px_28px_rgba(0,0,0,0.6)] flex flex-col gap-2 p-3 text-white">
        <div className="flex items-center justify-between"><div className="font-bold text-sm text-cyan-100">JEPA <span className="text-cyan-400">Vision</span></div><button type="button" onClick={onClose} className="text-white/40 hover:text-white/80 text-lg leading-none">x</button></div>
        <div className="flex items-center text-xs"><span className={["w-2 h-2 rounded-full mr-2", online ? "bg-emerald-400" : "bg-red-500"].join(" ")} /><span className={online ? "text-emerald-300" : "text-red-400"}>{online ? `${status?.phase ?? "ready"}` : "Offline"}</span></div>
        <div className="bg-black/30 rounded p-2"><p className="text-[10px] text-white/40 uppercase mb-1">Alignment</p>{alignment ? <div className="grid grid-cols-3 gap-1 text-center">{[["Theta",`${alignment.delta_theta_deg.toFixed(1)}deg`,Math.abs(alignment.delta_theta_deg)>5],["X",`${alignment.delta_x_mm.toFixed(2)}`,Math.abs(alignment.delta_x_mm)>0.3],["Y",`${alignment.delta_y_mm.toFixed(2)}`,Math.abs(alignment.delta_y_mm)>0.3]].map(([l,v,bad])=><div key={String(l)}><div className="text-[9px] text-white/30">{l}</div><div className={["font-mono text-xs font-bold",bad?"text-orange-400":"text-emerald-400"].join(" ")}>{v}</div></div>)}</div> : <p className="text-[10px] text-white/30 text-center">Not run</p>}<button type="button" onClick={runAlign} disabled={!online||busy!==null} className="mt-1.5 w-full text-[10px] font-semibold rounded py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 disabled:opacity-40">{busy==="align"?"Running...":"Run Alignment"}</button></div>
        <div className="bg-black/30 rounded p-2"><p className="text-[10px] text-white/40 uppercase mb-1">Detection</p>{detection?<p className="text-xs font-bold text-cyan-200">{detection.class_name} <span className="text-white/40 font-normal">{(detection.confidence*100).toFixed(0)}%</span></p>:<p className="text-[10px] text-white/30">Not run</p>}<button type="button" onClick={runDetect} disabled={!online||busy!==null} className="mt-1.5 w-full text-[10px] font-semibold rounded py-1 bg-white/5 text-white/60 border border-white/10 disabled:opacity-40">{busy==="detect"?"Running...":"Detect Component"}</button></div>
        <div className="bg-black/30 rounded p-2"><p className="text-[10px] text-white/40 uppercase mb-1">Validation</p>{validation?<div className="flex items-center gap-1.5"><span className={["w-2 h-2 rounded-full",validation.decision==="PASS"?"bg-emerald-400":"bg-red-500"].join(" ")}/><span className={["text-xs font-bold",validation.decision==="PASS"?"text-emerald-300":"text-red-400"].join(" ")}>{validation.decision}</span></div>:<p className="text-[10px] text-white/30">Not run</p>}<button type="button" onClick={runValidate} disabled={!online||busy!==null} className="mt-1.5 w-full text-[10px] font-semibold rounded py-1 bg-white/5 text-white/60 border border-white/10 disabled:opacity-40">{busy==="validate"?"Running...":"Validate"}</button></div>
        <div className="flex gap-1.5"><button type="button" onClick={runPretrain} disabled={!online||busy!==null||training?.running===true} className="flex-1 text-[10px] font-semibold rounded py-1 bg-black/30 text-white/40 border border-white/10 disabled:opacity-40">{busy==="train"?"...":"Pretrain"}</button><button type="button" onClick={runFinetune} disabled={!online||busy!==null||training?.running===true} className="flex-1 text-[10px] font-semibold rounded py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 disabled:opacity-40">{busy==="fine"?"...":"Finetune"}</button></div>
        {error && <p className="text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1">{error}</p>}
      </div>
    </div>
  );
}
