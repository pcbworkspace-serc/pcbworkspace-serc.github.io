import PCBWorkspace from "@/components/PCBWorkspace";
import Inventory from "@/components/Inventory";
import CameraFeed from "@/components/CameraFeed";
import RobotPanel from "@/components/RobotPanel";
import SampleDropdown from "@/components/SampleDropdown";
import CalibrateButton from "@/components/CalibrateButton";
import JEPADemo from "@/components/JEPADemo";
import NNPanel from "@/components/NNPanel";
import DetectModal from "@/components/DetectModal";
import Minimap2D from "@/components/Minimap2D";
import RobotConnect from "@/components/RobotConnect";
import TeachMode from "@/components/TeachMode";
import RobotStatus from "@/components/RobotStatus";
import { installSerialRecorder } from "@/lib/teach";
import { installRobotStateListener } from "@/lib/robot_state";
import { getMultiLabelDetection, getDetectBoxesByMethod, wakeBackend, type ClassPrediction, type DetectionBox, type DetectionMethod } from "@/lib/nn";
import { grabCameraFrame } from "@/components/CameraFeed";
import { captureScene } from "@/components/PCBWorkspace";
import { detectCircuitBlocks, type CircuitBlock } from "@/lib/circuits";
import { type Wire, type PinRef, type NetAnalysis, analyzeNets, makeWireId } from "@/lib/wires";
import { getPins } from "@/lib/pins";
import { downloadBOM } from "@/lib/bom";
import PCBRobot from "@/components/PCBRobot";
import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession, getCurrentUserEmail, getRecentsKey, getSavedProjectsKey } from "@/lib/auth";

type BoardItem = { type: string; x: number; y: number; rotation_deg?: number };
type RecentFile = { name: string; openedAt: number };
type SavedProject = { id: string; name: string; lastOpened: number; snapshot?: { schemaVersion?: number; savedAt: string; note: string; projectId: string; projectName: string; recentFiles: RecentFile[]; boardItems?: BoardItem[]; }; };

const MAX_RECENTS = 6;
const MAX_SAVED_PROJECTS = 20;
const PCB_PHYSICAL_MM = { width: 62, height: 42 };
const SCENE_MM_PER_UNIT = 10.0;

function getSavedProjectsKey2(email: string) { return `pcbworkspace.savedProjects.v2:${email.trim().toLowerCase()}`; }
function getRecentsKey2(email: string) { return `pcbworkspace.recentFiles.v2:${email.trim().toLowerCase()}`; }

function loadRecents(email: string): RecentFile[] {
  try { const raw = localStorage.getItem(getRecentsKey2(email)); if (!raw) return []; const p = JSON.parse(raw); if (!Array.isArray(p)) return []; return p.filter((x: any) => x?.name && x?.openedAt).sort((a: any,b: any)=>b.openedAt-a.openedAt).slice(0,MAX_RECENTS); } catch { return []; }
}
function loadSavedProjects(email: string): SavedProject[] {
  try { const raw = localStorage.getItem(getSavedProjectsKey2(email)); if (!raw) return []; const p = JSON.parse(raw); if (!Array.isArray(p)) return []; return p.sort((a: any,b: any)=>b.lastOpened-a.lastOpened); } catch { return []; }
}
function saveProjects(email: string, projects: SavedProject[]) {
  localStorage.setItem(getSavedProjectsKey2(email), JSON.stringify(projects.slice(0,MAX_SAVED_PROJECTS)));
  window.dispatchEvent(new Event("saved-projects-updated"));
}
function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function parseBoardItems(value: unknown): BoardItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item: any) => item?.type && typeof item.x==="number" && typeof item.y==="number");
}
function itemToMm(item: BoardItem) {
  return {
    x_mm: +(item.x * SCENE_MM_PER_UNIT + PCB_PHYSICAL_MM.width / 2).toFixed(3),
    y_mm: +(item.y * SCENE_MM_PER_UNIT + PCB_PHYSICAL_MM.height / 2).toFixed(3),
  };
}

const Icon = {
  Save: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>),
  Import: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  Export: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>),
};

const Index = () => {
  const [boardItems, setBoardItems] = useState<BoardItem[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [wireMode, setWireMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<PinRef | null>(null);

  // Sprint 4: lifted minimap UI state (so the 3D scene can cross-probe)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"pcb" | "sch">("pcb");
  const [unit, setUnit] = useState<"mm" | "in" | "mil">("mm");
  const [collapsed, setCollapsed] = useState(false);

  // Sprint 5: install LeRobot serial recorder once
  useEffect(() => {
    installSerialRecorder();
    installRobotStateListener();
    wakeBackend();
  }, []);

  const handlePinClick = (ref: PinRef) => {
    if (!pendingPin) { setPendingPin(ref); return; }
    if (pendingPin.componentIndex === ref.componentIndex && pendingPin.pinName === ref.pinName) {
      setPendingPin(null); return;
    }
    const newWire: Wire = {
      id: makeWireId(),
      fromComponent: pendingPin.componentIndex, fromPin: pendingPin.pinName,
      toComponent: ref.componentIndex, toPin: ref.pinName,
    };
    setWires((prev) => [...prev, newWire]);
    setPendingPin(null);
  };
  const [detectMethod, setDetectMethod] = useState<DetectionMethod>("yolo_hybrid");
  const [showDemo, setShowDemo] = useState(false);
  const navigate = useNavigate();

  const handleRotateComponent = (index: number) => {
    setBoardItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, rotation_deg: (((item.rotation_deg ?? 0) + 90) % 360) }
          : item,
      ),
    );
  };

  const handleDeleteComponent = (index: number) => {
    setWires((prev) =>
      prev
        .filter((w) => w.fromComponent !== index && w.toComponent !== index)
        .map((w) => ({
          ...w,
          fromComponent: w.fromComponent > index ? w.fromComponent - 1 : w.fromComponent,
          toComponent:   w.toComponent   > index ? w.toComponent   - 1 : w.toComponent,
        })),
    );
    setBoardItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex(null);
  };

  const handleNudgeComponent = (index: number, dxMm: number, dyMm: number) => {
    const halfW = (PCB_PHYSICAL_MM.width  / 2) / SCENE_MM_PER_UNIT;
    const halfH = (PCB_PHYSICAL_MM.height / 2) / SCENE_MM_PER_UNIT;
    const dxScene = dxMm / SCENE_MM_PER_UNIT;
    const dyScene = dyMm / SCENE_MM_PER_UNIT;
    setBoardItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          x: Math.max(-halfW, Math.min(halfW, item.x + dxScene)),
          y: Math.max(-halfH, Math.min(halfH, item.y + dyScene)),
        };
      }),
    );
  };

  const [detectOpen, setDetectOpen] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectResult, setDetectResult] = useState<{
    groundTruth: { type: string; count: number }[];
    circuits: CircuitBlock[];
    nets: NetAnalysis | null;
    mlClass: string | null;
    mlConfidence: number | null;
    mlError: string | null;
    mlPredictions: ClassPrediction[] | null;
    mlModel: string | null;
    mlInferenceMs: number | null;
    mlSource: string | null;
    mlImageUrl?: string | null;
    mlBoxes?: DetectionBox[] | null;
    mlImageSize?: [number, number] | null;
    mlMethod?: DetectionMethod | null;
    mlMethodError?: string | null;
  } | null>(null);

  const lastDetectionRef = useRef<{ frame: Blob | null; source: string; imageUrl: string | null }>({
    frame: null, source: "", imageUrl: null,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const runDetectionWith = async (frame: Blob | null, source: string, imageUrl: string | null, method: DetectionMethod) => {
    lastDetectionRef.current = { frame, source, imageUrl };
    setDetectOpen(true);
    setDetectLoading(true);
    setDetectResult(null);
    const counts: Record<string, number> = {};
    for (const item of boardItems) counts[item.type] = (counts[item.type] || 0) + 1;
    const groundTruth = Object.entries(counts).map(([type, count]) => ({ type, count }));
    const circuits = detectCircuitBlocks(boardItems);
    let mlPredictions: ClassPrediction[] | null = null;
    let mlModel: string | null = null;
    let mlInferenceMs: number | null = null;
    let mlError: string | null = null;
    try {
      const ml = await getMultiLabelDetection(frame);
      mlPredictions = ml.predictions; mlModel = ml.model; mlInferenceMs = ml.inference_ms;
    } catch (e) {
      mlError = e instanceof Error ? e.message : 'Detection failed';
    }
    let mlBoxes: DetectionBox[] | null = null;
    let mlImageSize: [number, number] | null = null;
    let mlMethod: DetectionMethod | null = null;
    let mlMethodError: string | null = null;
    if (frame) {
      try {
        const bx = await getDetectBoxesByMethod(frame, method);
        mlBoxes = bx.boxes; mlImageSize = bx.image_size;
        mlMethod = (bx.method as DetectionMethod) ?? method;
      } catch (e) {
        mlMethodError = e instanceof Error ? e.message : 'Box detection failed';
        mlMethod = method;
      }
    }
    setDetectResult({
      groundTruth, circuits, nets: null,
      mlClass: null, mlConfidence: null, mlError,
      mlPredictions, mlModel, mlInferenceMs,
      mlSource: source, mlImageUrl: imageUrl, mlBoxes, mlImageSize,
      mlMethod, mlMethodError,
    });
    setDetectLoading(false);
  };

  const runDetection = async () => {
    let frame: Blob | null = null;
    let source = 'no image';
    try { frame = await grabCameraFrame(); if (frame) source = 'camera'; } catch {}
    if (!frame) {
      try { frame = await captureScene(); if (frame) source = '3D scene'; } catch {}
    }
    const url = frame ? URL.createObjectURL(frame) : null;
    await runDetectionWith(frame, source, url, detectMethod);
  };

  const runDetectionOnFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    await runDetectionWith(file, 'uploaded image', url, detectMethod);
  };

  const rerunWithMethod = (method: DetectionMethod) => {
    setDetectMethod(method);
    const last = lastDetectionRef.current;
    if (last.frame) runDetectionWith(last.frame, last.source, last.imageUrl, method);
    else runDetection();
  };

  const mapItems = useMemo(() => {
    return boardItems.map((item) => {
      const { x_mm, y_mm } = itemToMm(item);
      const rotRad = ((item.rotation_deg ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);
      const pins = getPins(item.type).map((p) => {
        const lx = p.position[0];
        const lz = p.position[2];
        const rx = lx * cos - lz * sin;
        const rz = lx * sin + lz * cos;
        return {
          name: p.name,
          x_mm: x_mm + rx * SCENE_MM_PER_UNIT,
          y_mm: y_mm + rz * SCENE_MM_PER_UNIT,
        };
      });
      return {
        type: item.type,
        rotation_deg: item.rotation_deg ?? 0,
        x_mm, y_mm, pins,
      };
    });
  }, [boardItems]);

  const handleExportRobotJob = () => {
    if (boardItems.length === 0) {
      alert("Place at least one component before exporting a robot job.");
      return;
    }
    const counters: Record<string, number> = {};
    const componentExport = boardItems.map((item, idx) => {
      counters[item.type] = (counters[item.type] || 0) + 1;
      const prefix = item.type[0] ?? "X";
      const id = `${prefix}${counters[item.type]}`;
      const { x_mm, y_mm } = itemToMm(item);
      return {
        id, type: item.type, x_mm, y_mm,
        rotation_deg: item.rotation_deg ?? 0,
        pickup_order: idx + 1,
      };
    });
    const nets = wires.map((w) => ({
      id: w.id,
      from: { component_id: componentExport[w.fromComponent]?.id ?? null, pin: w.fromPin },
      to:   { component_id: componentExport[w.toComponent]?.id ?? null, pin: w.toPin },
    }));
    const job = {
      schemaVersion: 1, machineType: "scara", units: "mm",
      generatedAt: new Date().toISOString(),
      pcb: {
        width_mm: PCB_PHYSICAL_MM.width,
        height_mm: PCB_PHYSICAL_MM.height,
        origin: "bottom_left",
        note: `Conversion factor: ${SCENE_MM_PER_UNIT} mm/scene-unit. Calibrate against your bench before running.`,
      },
      components: componentExport,
      nets,
    };
    downloadJson(`pcb-robot-job-${Date.now()}.json`, job);
  };

  const handleExportBOM = () => {
    if (boardItems.length === 0) {
      alert("Place at least one component before exporting a BOM.");
      return;
    }
    downloadBOM(boardItems);
  };

  const email = getCurrentUserEmail() ?? "";

  const handleSaveProject = () => {
    const timestamp = Date.now();
    const defaultName = `pcb-project-${new Date(timestamp).toISOString().replace(/[:.]/g,"-")}`;
    const providedName = window.prompt("Enter file name", defaultName);
    if (providedName === null) return;
    const projectName = providedName.trim() || defaultName;
    const updatedRecents = [{name:`${projectName}.json`,openedAt:timestamp},...loadRecents(email)].slice(0,MAX_RECENTS);
    localStorage.setItem(getRecentsKey2(email), JSON.stringify(updatedRecents));
    const snapshot = {schemaVersion:2,savedAt:new Date().toISOString(),note:"PCB workspace state",projectId:String(timestamp),projectName,recentFiles:updatedRecents,boardItems};
    const existing = loadSavedProjects(email);
    saveProjects(email,[{id:String(timestamp),name:projectName,lastOpened:timestamp,snapshot},...existing.filter(p=>p.id!==String(timestamp))]);
    downloadJson(projectName.endsWith(".json")?projectName:`${projectName}.json`,snapshot);
  };

  const handleImport = () => {
    const input = document.createElement("input"); input.type="file"; input.accept=".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result??"{}")) as any;
          const timestamp = Date.now();
          const importedName = parsed.projectName ?? file.name.replace(/\.json$/i,"") ?? "Imported";
          const importedId = parsed.projectId ?? `${importedName}-${timestamp}`;
          const snapshot = {schemaVersion:2,savedAt:parsed.savedAt??new Date(timestamp).toISOString(),note:"Imported",projectId:importedId,projectName:importedName,recentFiles:[],boardItems:parseBoardItems(parsed.boardItems)};
          saveProjects(email,[{id:importedId,name:importedName,lastOpened:timestamp,snapshot},...loadSavedProjects(email).filter(p=>p.id!==importedId)]);
          setBoardItems(snapshot.boardItems);
          alert(`Imported: ${importedName}`);
        } catch { alert("Could not import this JSON file."); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExport = () => {
    downloadJson(`pcbworkspace-backup-${Date.now()}.json`,{exportedAt:new Date().toISOString(),schemaVersion:1,savedProjects:loadSavedProjects(email),recentFiles:loadRecents(email)});
  };

  const floatIconBtn = "h-8 w-8 flex items-center justify-center rounded text-primary/80 hover:text-primary hover:bg-primary/15 transition-colors";

  return (
    <div className="h-screen w-screen flex overflow-hidden relative bg-black">
      {showDemo && <JEPADemo onClose={() => setShowDemo(false)} />}

      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-end gap-2 px-4 py-2 bg-black/60 border-b border-white/5">
        <span className="text-xs font-semibold text-white mr-2">{email}</span>
        <button type="button" onClick={() => navigate("/login", { replace: true })} className="text-xs rounded border border-white/40 px-2 py-1 text-white hover:bg-white/10 transition-colors">Switch Account</button>
        <button type="button" onClick={() => { clearSession(); navigate("/login", { replace: true }); }} className="text-xs rounded border border-white/40 px-2 py-1 text-white hover:bg-white/10 transition-colors">Logout</button>
        <a href="https://spaceroboticscreations.com/" target="_blank" rel="noopener noreferrer" className="text-[#00d4ff] text-xs font-bold opacity-70 hover:opacity-100 transition-opacity">SERC ↗</a>
        <TeachMode />
        <RobotConnect />
      </div>

      <div className="w-[230px] shrink-0 flex flex-col gap-3 p-3 pt-12" style={{background:"linear-gradient(to bottom, hsl(195,100%,50%), hsl(210,100%,40%))"}}>
        <div className="flex items-center gap-2 mt-1">
          <img src={`${import.meta.env.BASE_URL}serc-robot-transparent.png`} alt="SERC Robot" className="h-28 w-28 object-contain drop-shadow-lg" />
          <div>
            <h1 className="text-3xl text-black leading-tight tracking-tight">Mini MEE</h1>
            <p className="text-[11px] font-semibold text-black/70">Be My Engineer!</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
          <div className="relative"><CameraFeed /><CalibrateButton /></div>
          <div className="bg-black/20 rounded-xl p-3 border border-black/10">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-black font-black text-[10px] uppercase tracking-widest">JEPA Vision</h3>
              <span className="text-[8px] bg-black text-[#00a3ff] px-1.5 py-0.5 rounded font-black">LIVE</span>
            </div>
            <NNPanel />
            <button type="button" onClick={() => setShowDemo(true)} className="mt-2 w-full py-2 bg-black text-[#00a3ff] text-[10px] font-black rounded uppercase tracking-widest hover:bg-black/80 transition-colors">Open Demo</button>
          </div>
          <Inventory />
          <RobotPanel />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 pt-10">
        <div className="flex-1 p-3 pt-1 min-h-0">
          <div className="h-full rounded-xl border border-primary/30 overflow-hidden flex flex-col" style={{backgroundColor:"hsla(220,70%,10%,0.9)"}}>
            <div className="text-center py-1.5 border-b border-primary/20">
              <span className="text-primary font-black text-[11px] tracking-widest uppercase">PCB Workspace</span>
            </div>
            <div className="flex-1 relative">
              <PCBWorkspace
                items={boardItems}
                onItemsChange={setBoardItems}
                wires={wires}
                wireMode={wireMode}
                pendingPin={pendingPin}
                onPinClick={handlePinClick}
                selectedIndex={selectedIndex}
              />

              <div className="absolute top-3 right-3 z-30 flex gap-0.5 bg-black/80 border border-primary/30 rounded-lg p-1 shadow-2xl backdrop-blur-sm">
                <button type="button" onClick={handleSaveProject} className={floatIconBtn} title="Save Project"><Icon.Save /></button>
                <button type="button" onClick={handleImport} className={floatIconBtn} title="Import a project JSON"><Icon.Import /></button>
                <button type="button" onClick={handleExport} className={floatIconBtn} title="Export all projects backup"><Icon.Export /></button>
              </div>

              <Minimap2D
                items={mapItems}
                wires={wires}
                pcbWidthMm={PCB_PHYSICAL_MM.width}
                pcbHeightMm={PCB_PHYSICAL_MM.height}
                selectedIndex={selectedIndex}
                onSelect={setSelectedIndex}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                unit={unit}
                onUnitChange={setUnit}
                collapsed={collapsed}
                onCollapsedChange={setCollapsed}
                onExport={handleExportRobotJob}
                onExportBOM={handleExportBOM}
                onRotate={handleRotateComponent}
                onDelete={handleDeleteComponent}
                onNudge={handleNudgeComponent}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-3 pb-3 justify-end items-center">
          <button type="button" onClick={() => { setWireMode(!wireMode); setPendingPin(null); }} className={`h-10 px-4 rounded-md border transition-colors text-[11px] font-semibold ${wireMode ? "border-amber-400 bg-amber-400/20 text-amber-300" : "border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary"}`}>{wireMode ? "Wire: ON" : "Wire Mode"}</button>
          <button type="button" onClick={runDetection} className="h-10 px-4 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors text-[11px] font-semibold text-primary">Detect</button>
          <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) runDetectionOnFile(f); e.target.value = ""; }} />
          <SampleDropdown onPickSample={runDetectionOnFile} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="h-10 px-4 rounded-md border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-[11px] font-semibold text-amber-400">Upload PCB</button>
        </div>
      </div>

      <div className="w-[280px] shrink-0 flex flex-col pt-10 border-l border-primary/20" style={{backgroundColor:"hsla(220,70%,8%,0.97)"}}>
        <PCBRobot boardItems={mapItems} />
      </div>

      {detectOpen && (
        <DetectModal
          result={detectResult}
          loading={detectLoading}
          onClose={() => setDetectOpen(false)}
          onDetectAgain={runDetection}
          currentMethod={detectMethod}
          onChangeMethod={rerunWithMethod}
        />
      )}

      <RobotStatus />
    </div>
  );
};

export default Index;
