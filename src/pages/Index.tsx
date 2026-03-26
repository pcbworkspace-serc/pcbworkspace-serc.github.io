import PCBWorkspace from "@/components/PCBWorkspace";
import Inventory from "@/components/Inventory";
import CameraFeed from "@/components/CameraFeed";
import SavedFiles from "@/components/SavedFiles";
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearSession, getCurrentUserEmail, getRecentsKey, getSavedProjectsKey } from "@/lib/auth";
import JEPADemo from "@/components/JEPADemo";
import { getNNStatus, getAlignmentCorrection, detectComponent, validatePlacement, startPretraining, startFinetuning, getTrainingStatus, pingNNServer } from "@/lib/nn";
import type { NNStatus, AlignmentResult, DetectionResult, ValidationResult, TrainingStatus } from "@/lib/nn";

type RecentFile = { name: string; openedAt: number };
type BoardItem = { type: string; x: number; y: number };
type SavedProject = { id: string; name: string; lastOpened: number; snapshot?: { schemaVersion?: number; savedAt: string; note: string; projectId: string; projectName: string; recentFiles: RecentFile[]; boardItems?: BoardItem[]; }; };

const MAX_RECENTS = 6;
const MAX_SAVED_PROJECTS = 20;

function loadRecents(): RecentFile[] {
  const email = getCurrentUserEmail();
  if (!email) return [];
  try {
    const raw = localStorage.getItem(getRecentsKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is RecentFile => !!x && typeof x.name === "string" && typeof x.openedAt === "number").sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_RECENTS);
  } catch { return []; }
}

function loadSavedProjects(): SavedProject[] {
  const email = getCurrentUserEmail();
  if (!email) return [];
  try {
    const raw = localStorage.getItem(getSavedProjectsKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is { id?: unknown; name?: unknown; lastOpened?: unknown; snapshot?: SavedProject["snapshot"] } => !!item).map((item) => ({ id: typeof item.id === "string" ? item.id : `untitled-${Date.now()}`, name: typeof item.name === "string" ? item.name : "Untitled Project", lastOpened: typeof item.lastOpened === "number" ? item.lastOpened : Date.now(), snapshot: item.snapshot && typeof item.snapshot === "object" ? { schemaVersion: typeof item.snapshot.schemaVersion === "number" ? item.snapshot.schemaVersion : 1, savedAt: typeof item.snapshot.savedAt === "string" ? item.snapshot.savedAt : new Date().toISOString(), note: typeof item.snapshot.note === "string" ? item.snapshot.note : "", projectId: typeof item.snapshot.projectId === "string" ? item.snapshot.projectId : "", projectName: typeof item.snapshot.projectName === "string" ? item.snapshot.projectName : "Untitled", recentFiles: Array.isArray(item.snapshot.recentFiles) ? item.snapshot.recentFiles.filter((x): x is RecentFile => !!x && typeof x.name === "string" && typeof x.openedAt === "number") : [], boardItems: parseBoardItems(item.snapshot.boardItems) } : undefined })).sort((a, b) => b.lastOpened - a.lastOpened);
  } catch { return []; }
}

function saveProjects(projects: SavedProject[]) {
  const email = getCurrentUserEmail();
  if (!email) return;
  localStorage.setItem(getSavedProjectsKey(email), JSON.stringify(projects.slice(0, MAX_SAVED_PROJECTS)));
  window.dispatchEvent(new Event("saved-projects-updated"));
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function parseBoardItems(value: unknown): BoardItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BoardItem => !!item && typeof (item as { type?: unknown }).type === "string" && typeof (item as { x?: unknown }).x === "number" && typeof (item as { y?: unknown }).y === "number");
}

function JEPAVisionPanel() {
  const [showDemo, setShowDemo] = useState(false);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<NNStatus | null>(null);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pingNNServer().then(ok => { setOnline(ok); if (ok) getNNStatus().then(setStatus).catch(() => {}); });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const startPoll = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const s = await getTrainingStatus(); setTraining(s);
      if (!s.running) { clearInterval(pollRef.current!); pollRef.current = null; getNNStatus().then(setStatus); }
    }, 2000);
  }, []);

  const runAlign = useCallback(async () => { setBusy("align"); setError(null); try { setAlignment(await getAlignmentCorrection()); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, []);
  const runDetect = useCallback(async () => { setBusy("detect"); setError(null); try { setDetection(await detectComponent()); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, []);
  const runValidate = useCallback(async () => { setBusy("validate"); setError(null); try { setValidation(await validatePlacement()); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, []);
  const runPretrain = useCallback(async () => { setBusy("train"); setError(null); try { await startPretraining(200); startPoll(); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, [startPoll]);
  const runFinetune = useCallback(async () => { setBusy("fine"); setError(null); try { await startFinetuning(50); startPoll(); } catch (e) { setError(String(e)); } finally { setBusy(null); } }, [startPoll]);

  return (
    <div className="panel-border panel-bg rounded-lg p-3 w-[260px] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><h3 className="text-primary font-bold text-sm">JEPA Vision</h3><button type="button" onClick={()=>setShowDemo(true)} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 hover:bg-cyan-500/20 transition-colors">Demo</button></div>
        {showDemo && <JEPADemo onClose={()=>setShowDemo(false)} />}`n      <span className={["w-2 h-2 rounded-full", online ? "bg-emerald-400" : "bg-red-500"].join(" ")} />
      </div>
      <p className={["text-[10px]", online ? "text-emerald-400" : "text-red-400"].join(" ")}>
        {online ? `${status?.phase ?? "ready"} · ${status?.parameters ? (status.parameters / 1e6).toFixed(1) + "M params" : ""}` : "Offline — run flask_server.py"}
      </p>
      <div className="bg-black/30 rounded p-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Alignment</p>
        {alignment ? (
          <div className="grid grid-cols-3 gap-1 text-center">
            {[["Theta", `${alignment.delta_theta_deg.toFixed(1)}deg`, Math.abs(alignment.delta_theta_deg) > 5], ["X", `${alignment.delta_x_mm.toFixed(2)}mm`, Math.abs(alignment.delta_x_mm) > 0.3], ["Y", `${alignment.delta_y_mm.toFixed(2)}mm`, Math.abs(alignment.delta_y_mm) > 0.3]].map(([l, v, bad]) => (
              <div key={String(l)}><div className="text-[9px] text-muted-foreground">{l}</div><div className={["font-mono text-xs font-bold", bad ? "text-orange-400" : "text-emerald-400"].join(" ")}>{v}</div></div>
            ))}
          </div>
        ) : <p className="text-[10px] text-muted-foreground text-center">Not run yet</p>}
        <button type="button" onClick={runAlign} disabled={!online || busy !== null} className="mt-1.5 w-full text-[10px] font-semibold rounded py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors">
          {busy === "align" ? "Running..." : "Run Alignment"}
        </button>
      </div>
      <div className="bg-black/30 rounded p-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Detection</p>
        {detection ? <p className="text-xs font-bold text-primary">{detection.class_name} <span className="text-muted-foreground font-normal">{(detection.confidence * 100).toFixed(0)}%</span></p> : <p className="text-[10px] text-muted-foreground">Not run yet</p>}
        <button type="button" onClick={runDetect} disabled={!online || busy !== null} className="mt-1.5 w-full text-[10px] font-semibold rounded py-1 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-40 transition-colors">
          {busy === "detect" ? "Running..." : "Detect Component"}
        </button>
      </div>
      <div className="bg-black/30 rounded p-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Placement</p>
        {validation ? (
          <div className="flex items-center gap-1.5">
            <span className={["w-2 h-2 rounded-full shrink-0", validation.decision === "PASS" ? "bg-emerald-400" : "bg-red-500"].join(" ")} />
            <span className={["text-xs font-bold", validation.decision === "PASS" ? "text-emerald-400" : "text-red-400"].join(" ")}>{validation.decision}</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{(validation.pass_prob * 100).toFixed(0)}%</span>
          </div>
        ) : <p className="text-[10px] text-muted-foreground">Not run yet</p>}
        <button type="button" onClick={runValidate} disabled={!online || busy !== null} className="mt-1.5 w-full text-[10px] font-semibold rounded py-1 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 disabled:opacity-40 transition-colors">
          {busy === "validate" ? "Running..." : "Validate Placement"}
        </button>
      </div>
      {training?.running && (
        <div className="bg-black/30 rounded p-2">
          <p className="text-[10px] text-muted-foreground mb-1">{training.phase} {training.epoch}/{training.total_epochs}</p>
          <div className="w-full bg-white/10 rounded-full h-1.5">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-primary to-emerald-400 transition-all" style={{ width: `${Math.round((training.epoch / Math.max(1, training.total_epochs)) * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="flex gap-1.5">
        <button type="button" onClick={runPretrain} disabled={!online || busy !== null || training?.running === true} className="flex-1 text-[10px] font-semibold rounded py-1 bg-black/30 text-muted-foreground border border-white/10 hover:bg-white/5 disabled:opacity-40 transition-colors">
          {busy === "train" ? "..." : "Pretrain"}
        </button>
        <button type="button" onClick={runFinetune} disabled={!online || busy !== null || training?.running === true} className="flex-1 text-[10px] font-semibold rounded py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
          {busy === "fine" ? "..." : "Finetune"}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400 bg-red-900/20 rounded px-2 py-1 break-words">{error}</p>}
    </div>
  );
}

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [boardItems, setBoardItems] = useState<BoardItem[]>([]);
  const email = getCurrentUserEmail();

  useEffect(() => { saveProjects(loadSavedProjects()); }, []);

  useEffect(() => {
    const projectId = (location.state as { projectId?: string } | null)?.projectId;
    if (!projectId) return;
    const project = loadSavedProjects().find((item) => item.id === projectId);
    if (!project) return;
    setBoardItems(parseBoardItems(project.snapshot?.boardItems));
    const updatedRecents = [{ name: `${project.name}.json`, openedAt: Date.now() }, ...loadRecents()].slice(0, MAX_RECENTS);
    if (email) localStorage.setItem(getRecentsKey(email), JSON.stringify(updatedRecents));
    alert(`Opened project: ${project.name}`);
    navigate("/", { replace: true, state: null });
  }, [location.state, navigate, email]);

  const handleSaveProject = () => {
    const timestamp = Date.now();
    const defaultName = `pcb-project-${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}`;
    const providedName = window.prompt("Enter file name", defaultName);
    if (providedName === null) return;
    const projectName = providedName.trim() || defaultName;
    const updatedRecents = [{ name: `${projectName}.json`, openedAt: timestamp }, ...loadRecents()].slice(0, MAX_RECENTS);
    if (email) localStorage.setItem(getRecentsKey(email), JSON.stringify(updatedRecents));
    const projectSnapshot = { schemaVersion: 2, savedAt: new Date().toISOString(), note: "PCB workspace state", projectId: String(timestamp), projectName, recentFiles: updatedRecents, boardItems };
    saveProjects([{ id: String(timestamp), name: projectName, lastOpened: timestamp, snapshot: projectSnapshot }, ...loadSavedProjects().filter((item) => item.id !== String(timestamp))]);
    downloadJson(projectName.endsWith(".json") ? projectName : `${projectName}.json`, projectSnapshot);
  };

  const handleImportProject = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result ?? "{}")) as { projectId?: unknown; projectName?: unknown; savedAt?: unknown; note?: unknown; recentFiles?: unknown; boardItems?: unknown };
          const timestamp = Date.now();
          const importedName = typeof parsed.projectName === "string" ? parsed.projectName : file.name.replace(/\.json$/i, "") || "Imported Project";
          const importedId = typeof parsed.projectId === "string" && parsed.projectId.trim().length > 0 ? parsed.projectId : `${importedName}-${timestamp}`;
          const importedSnapshot = { schemaVersion: 2, savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(timestamp).toISOString(), note: typeof parsed.note === "string" ? parsed.note : "Imported", projectId: importedId, projectName: importedName, recentFiles: [], boardItems: parseBoardItems(parsed.boardItems) };
          saveProjects([{ id: importedId, name: importedName, lastOpened: timestamp, snapshot: importedSnapshot }, ...loadSavedProjects().filter((p) => p.id !== importedId)]);
          setBoardItems(importedSnapshot.boardItems ?? []);
          alert(`Imported: ${importedName}`);
        } catch { alert("Could not import this JSON file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportAll = () => {
    downloadJson(`pcbworkspace-backup-${Date.now()}.json`, { exportedAt: new Date().toISOString(), schemaVersion: 1, savedProjects: loadSavedProjects(), recentFiles: loadRecents() });
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden relative">
      <div className="flex flex-col gap-3 p-3 w-[280px] shrink-0 overflow-y-auto scrollbar-hide">
        <div className="flex items-center gap-2">
          <img src="/serc-robot-transparent.png" alt="SERC Robot" className="h-40 w-40 object-contain" />
          <div>
            <h1 className="font-bold text-2xl leading-tight text-black">Mini MEE</h1>
            <p className="text-sm font-semibold text-black">Be My Engineer!</p>
          </div>
        </div>
        <CameraFeed />
        <JEPAVisionPanel />
        <Inventory />
        <div className="mt-auto pt-2">
          <span className="rounded border border-white/40 bg-black/85 px-3 py-1 text-sm font-bold tracking-wide text-white shadow-lg">Educational Version</span>
        </div>
      </div>
      <div className="flex-1 p-3 pl-0">
        <div className="panel-border rounded-lg h-full flex flex-col overflow-hidden" style={{ backgroundColor: "hsla(220, 50%, 8%, 0.9)" }}>
          <h3 className="text-primary font-bold text-center py-2 text-sm border-b border-border">PCB Workspace</h3>
          <div className="flex-1"><PCBWorkspace items={boardItems} onItemsChange={setBoardItems} /></div>
        </div>
      </div>
      <div className="absolute bottom-3 right-3 z-50">
        <div className="flex flex-row gap-2 items-end">
          <button type="button" onClick={handleExportAll} className="h-16 w-16 rounded-md border border-white/25 bg-white/5 hover:bg-white/10 transition-colors p-2 flex items-center justify-center" title="Export All"><span className="text-[10px] font-semibold text-white/90 leading-tight">Export</span></button>
          <button type="button" onClick={handleImportProject} className="h-16 w-16 rounded-md border border-white/25 bg-white/5 hover:bg-white/10 transition-colors p-2 flex items-center justify-center" title="Import Project"><span className="text-[10px] font-semibold text-white/90 leading-tight">Import</span></button>
          <button type="button" onClick={handleSaveProject} className="h-16 w-16 rounded-md border border-dashed border-white/25 bg-transparent hover:bg-white/5 transition-colors p-2 flex items-center justify-center" title="Save Project"><span className="text-[10px] font-semibold text-white/80 leading-tight">Save Project</span></button>
          <SavedFiles onOpenProject={(projectId) => { navigate("/", { state: { projectId } }); }} />
        </div>
      </div>
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="text-xs text-primary/90 max-w-[180px] truncate">{email ?? ""}</span>
        <button type="button" onClick={() => navigate("/login", { replace: true })} className="text-xs rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10 transition-colors">Switch Account</button>
        <button type="button" onClick={() => { clearSession(); navigate("/login", { replace: true }); }} className="text-xs rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10 transition-colors">Logout</button>
        <a href="https://spaceroboticscreations.com/" target="_blank" rel="noopener noreferrer" className="text-primary text-xs font-bold opacity-70 hover:opacity-100 transition-opacity">SERC</a>
      </div>
    </div>
  );
};

export default Index;





