import PCBWorkspace from "@/components/PCBWorkspace";
import Inventory from "@/components/Inventory";
import CameraFeed from "@/components/CameraFeed";
import SavedFiles from "@/components/SavedFiles";
import { useEffect } from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearSession, getCurrentUserEmail, getRecentsKey, getSavedProjectsKey } from "@/lib/auth";

type RecentFile = {
  name: string;
  openedAt: number; // epoch ms
};

type BoardItem = {
  type: string;
  x: number;
  y: number;
};

type SavedProject = {
  id: string;
  name: string;
  lastOpened: number;
  snapshot?: {
    schemaVersion?: number;
    savedAt: string;
    note: string;
    projectId: string;
    projectName: string;
    recentFiles: RecentFile[];
    boardItems?: BoardItem[];
  };
};

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
    return parsed
      .filter((x): x is RecentFile => !!x && typeof x.name === "string" && typeof x.openedAt === "number")
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function loadSavedProjects(): SavedProject[] {
  const email = getCurrentUserEmail();
  if (!email) return [];

  try {
    const raw = localStorage.getItem(getSavedProjectsKey(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is { id?: unknown; name?: unknown; lastOpened?: unknown; snapshot?: SavedProject["snapshot"] } => !!item)
      .map((item) => ({
        id:
          typeof item.id === "string"
            ? item.id
            : typeof item.snapshot?.projectId === "string"
              ? item.snapshot.projectId
              : `${typeof item.name === "string" ? item.name : "untitled"}-${
                  typeof item.lastOpened === "number" ? item.lastOpened : Number(item.lastOpened) || 0
                }`,
        name: typeof item.name === "string" ? item.name : "Untitled Project",
        lastOpened:
          typeof item.lastOpened === "number"
            ? item.lastOpened
            : typeof item.lastOpened === "string"
              ? Number(item.lastOpened) || Date.now()
              : Date.now(),
        snapshot:
          item.snapshot && typeof item.snapshot === "object"
            ? {
                schemaVersion:
                  typeof item.snapshot.schemaVersion === "number" ? item.snapshot.schemaVersion : 1,
                savedAt: typeof item.snapshot.savedAt === "string" ? item.snapshot.savedAt : new Date().toISOString(),
                note: typeof item.snapshot.note === "string" ? item.snapshot.note : "",
                projectId:
                  typeof item.snapshot.projectId === "string"
                    ? item.snapshot.projectId
                    : typeof item.id === "string"
                      ? item.id
                      : "",
                projectName:
                  typeof item.snapshot.projectName === "string"
                    ? item.snapshot.projectName
                    : typeof item.name === "string"
                      ? item.name
                      : "Untitled Project",
                recentFiles: Array.isArray(item.snapshot.recentFiles)
                  ? item.snapshot.recentFiles.filter(
                      (x): x is RecentFile => !!x && typeof x.name === "string" && typeof x.openedAt === "number",
                    )
                  : [],
                boardItems: parseBoardItems(item.snapshot.boardItems),
              }
            : undefined,
      }))
      .sort((a, b) => b.lastOpened - a.lastOpened);
  } catch {
    return [];
  }
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
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseBoardItems(value: unknown): BoardItem[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (item): item is BoardItem =>
      !!item &&
      typeof (item as { type?: unknown }).type === "string" &&
      typeof (item as { x?: unknown }).x === "number" &&
      typeof (item as { y?: unknown }).y === "number",
  );
}

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [boardItems, setBoardItems] = useState<BoardItem[]>([]);
  const email = getCurrentUserEmail();

  useEffect(() => {
    const normalized = loadSavedProjects();
    saveProjects(normalized);
  }, []);

  useEffect(() => {
    const projectId = (location.state as { projectId?: string } | null)?.projectId;
    if (!projectId) return;

    const project = loadSavedProjects().find((item) => item.id === projectId);
    if (!project) return;

    const restoredItems = parseBoardItems(project.snapshot?.boardItems);
    setBoardItems(restoredItems);

    const updatedRecents = [{ name: `${project.name}.json`, openedAt: Date.now() }, ...loadRecents()].slice(0, MAX_RECENTS);
    if (email) {
      localStorage.setItem(getRecentsKey(email), JSON.stringify(updatedRecents));
    }
    alert(`Opened project: ${project.name}`);
    navigate("/", { replace: true, state: null });
  }, [location.state, navigate, email]);

  const handleSaveProject = () => {
    const timestamp = Date.now();
    const defaultName = `pcb-project-${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}`;
    const providedName = window.prompt("Enter file name", defaultName);
    if (providedName === null) return;

    const projectName = providedName.trim() || defaultName;
    const newProject: SavedProject = {
      id: String(timestamp),
      name: projectName,
      lastOpened: timestamp,
    };

    const updatedRecents = [{ name: `${projectName}.json`, openedAt: timestamp }, ...loadRecents()].slice(0, MAX_RECENTS);
    if (email) {
      localStorage.setItem(getRecentsKey(email), JSON.stringify(updatedRecents));
    }

    const projectSnapshot = {
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      note: "Replace this snapshot with real PCB workspace state",
      projectId: newProject.id,
      projectName: newProject.name,
      recentFiles: updatedRecents,
      boardItems,
    };

    const existing = loadSavedProjects();
    const updatedProjects = [{ ...newProject, snapshot: projectSnapshot }, ...existing.filter((item) => item.id !== newProject.id)];
    saveProjects(updatedProjects);

    const downloadName = projectName.endsWith(".json") ? projectName : `${projectName}.json`;
    downloadJson(downloadName, projectSnapshot);
  };

  const handleImportProject = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result ?? "{}")) as {
            projectId?: unknown;
            projectName?: unknown;
            savedAt?: unknown;
            note?: unknown;
            recentFiles?: unknown;
            boardItems?: unknown;
            savedProjects?: unknown;
          };

          if (Array.isArray(parsed.savedProjects)) {
            const importedProjects: SavedProject[] = parsed.savedProjects
              .filter((item): item is { id?: unknown; name?: unknown; lastOpened?: unknown; snapshot?: unknown } => !!item)
              .map((item) => {
                const id =
                  typeof item.id === "string"
                    ? item.id
                    : `${typeof item.name === "string" ? item.name : "untitled"}-${
                        typeof item.lastOpened === "number" ? item.lastOpened : Number(item.lastOpened) || Date.now()
                      }`;
                const name = typeof item.name === "string" ? item.name : "Untitled Project";
                const lastOpened =
                  typeof item.lastOpened === "number"
                    ? item.lastOpened
                    : typeof item.lastOpened === "string"
                      ? Number(item.lastOpened) || Date.now()
                      : Date.now();

                const snapshotObj =
                  item.snapshot && typeof item.snapshot === "object"
                    ? (item.snapshot as {
                        schemaVersion?: unknown;
                        savedAt?: unknown;
                        note?: unknown;
                        projectId?: unknown;
                        projectName?: unknown;
                        recentFiles?: unknown;
                        boardItems?: unknown;
                      })
                    : undefined;

                return {
                  id,
                  name,
                  lastOpened,
                  snapshot: snapshotObj
                    ? {
                        schemaVersion: typeof snapshotObj.schemaVersion === "number" ? snapshotObj.schemaVersion : 2,
                        savedAt: typeof snapshotObj.savedAt === "string" ? snapshotObj.savedAt : new Date(lastOpened).toISOString(),
                        note: typeof snapshotObj.note === "string" ? snapshotObj.note : "Imported from backup",
                        projectId: typeof snapshotObj.projectId === "string" ? snapshotObj.projectId : id,
                        projectName: typeof snapshotObj.projectName === "string" ? snapshotObj.projectName : name,
                        recentFiles: Array.isArray(snapshotObj.recentFiles)
                          ? snapshotObj.recentFiles.filter(
                              (x): x is RecentFile =>
                                !!x && typeof (x as { name?: unknown }).name === "string" && typeof (x as { openedAt?: unknown }).openedAt === "number",
                            )
                          : [],
                        boardItems: parseBoardItems(snapshotObj.boardItems),
                      }
                    : {
                        schemaVersion: 2,
                        savedAt: new Date(lastOpened).toISOString(),
                        note: "Imported from backup",
                        projectId: id,
                        projectName: name,
                        recentFiles: [],
                        boardItems: [],
                      },
                };
              });

            const mergedById = new Map<string, SavedProject>();
            loadSavedProjects().forEach((project) => mergedById.set(project.id, project));
            importedProjects.forEach((project) => mergedById.set(project.id, project));

            const mergedProjects = Array.from(mergedById.values()).sort((a, b) => b.lastOpened - a.lastOpened);
            saveProjects(mergedProjects);

            const importedRecents = Array.isArray(parsed.recentFiles)
              ? parsed.recentFiles.filter(
                  (x): x is RecentFile => !!x && typeof (x as { name?: unknown }).name === "string" && typeof (x as { openedAt?: unknown }).openedAt === "number",
                )
              : [];

            if (importedRecents.length > 0) {
              if (email) {
                localStorage.setItem(getRecentsKey(email), JSON.stringify(importedRecents.slice(0, MAX_RECENTS)));
              }
            }

            const mostRecent = mergedProjects[0];
            if (mostRecent?.snapshot?.boardItems) {
              setBoardItems(parseBoardItems(mostRecent.snapshot.boardItems));
            }

            alert(`Imported backup: ${importedProjects.length} project(s)`);
            return;
          }

          const timestamp = Date.now();
          const importedName =
            typeof parsed.projectName === "string"
              ? parsed.projectName
              : file.name.replace(/\.json$/i, "") || "Imported Project";
          const importedId =
            typeof parsed.projectId === "string" && parsed.projectId.trim().length > 0
              ? parsed.projectId
              : `${importedName}-${timestamp}`;

          const importedSnapshot = {
            schemaVersion: 2,
            savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(timestamp).toISOString(),
            note: typeof parsed.note === "string" ? parsed.note : "Imported from JSON",
            projectId: importedId,
            projectName: importedName,
            recentFiles: Array.isArray(parsed.recentFiles)
              ? parsed.recentFiles.filter(
                  (x): x is RecentFile => !!x && typeof (x as { name?: unknown }).name === "string" && typeof (x as { openedAt?: unknown }).openedAt === "number",
                )
              : [],
            boardItems: parseBoardItems(parsed.boardItems),
          };

          const importedProject: SavedProject = {
            id: importedId,
            name: importedName,
            lastOpened: timestamp,
            snapshot: importedSnapshot,
          };

          const updated = [importedProject, ...loadSavedProjects().filter((p) => p.id !== importedId)];
          saveProjects(updated);
          setBoardItems(importedSnapshot.boardItems ?? []);
          alert(`Imported project: ${importedName}`);
        } catch {
          alert("Could not import this JSON file.");
        }
      };

      reader.readAsText(file);
    };

    input.click();
  };

  const handleExportAll = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      savedProjects: loadSavedProjects(),
      recentFiles: loadRecents(),
    };

    downloadJson(`pcbworkspace-backup-${Date.now()}.json`, payload);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden relative">
      {/* Left Sidebar */}
      <div className="flex flex-col gap-3 p-3 w-[240px] shrink-0">
        {/* Title */}
        <div className="flex items-center gap-2">
          <img src="/serc-robot-transparent.png" alt="SERC Robot" className="h-36 w-36 object-contain" />
          <div>
            <h1 className="font-bold text-2xl leading-tight text-black">Mini MEE</h1>
            <p className="text-sm font-semibold text-black">Be My Engineer!</p>
          </div>
        </div>

        <CameraFeed />
        <Inventory />
      </div>

      {/* Main Workspace */}
      <div className="flex-1 p-3 pl-0">
        <div
          className="panel-border rounded-lg h-full flex flex-col overflow-hidden"
          style={{ backgroundColor: "hsla(220, 50%, 8%, 0.9)" }}
        >
          <h3 className="text-primary font-bold text-center py-2 text-sm border-b border-border">PCB Workspace</h3>
          <div className="flex-1">
            <PCBWorkspace items={boardItems} onItemsChange={setBoardItems} />
          </div>
        </div>
      </div>

      {/* Bottom-right: Saved files + Save Project */}
      <div className="absolute bottom-3 right-3 z-50">
        <div className="flex flex-row gap-2 items-end">
          <button
            type="button"
            onClick={handleExportAll}
            className="h-16 w-16 rounded-md border border-white/25 bg-white/5 hover:bg-white/10 transition-colors p-2 flex items-center justify-center text-center"
            title="Export All"
          >
            <span className="text-[10px] font-semibold text-white/90 leading-tight">Export</span>
          </button>
          <button
            type="button"
            onClick={handleImportProject}
            className="h-16 w-16 rounded-md border border-white/25 bg-white/5 hover:bg-white/10 transition-colors p-2 flex items-center justify-center text-center"
            title="Import Project"
          >
            <span className="text-[10px] font-semibold text-white/90 leading-tight">Import</span>
          </button>
          <button
            type="button"
            onClick={handleSaveProject}
            className="h-16 w-16 rounded-md border border-dashed border-white/25 bg-transparent hover:bg-white/5 transition-colors p-2 flex items-center justify-center text-center"
            title="Save Project"
          >
            <span className="text-[10px] font-semibold text-white/80 leading-tight">Save Project</span>
          </button>
          <SavedFiles
            onOpenProject={(projectId) => {
              navigate("/", { state: { projectId } });
            }}
          />
        </div>
      </div>

      {/* Logo */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <span className="text-xs text-primary/90 max-w-[180px] truncate">{email ?? ""}</span>
        <button
          type="button"
          onClick={() => {
            navigate("/login", { replace: true });
          }}
          className="text-xs rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10 transition-colors"
        >
          Switch Account
        </button>
        <button
          type="button"
          onClick={() => {
            clearSession();
            navigate("/login", { replace: true });
          }}
          className="text-xs rounded border border-primary/40 px-2 py-1 text-primary hover:bg-primary/10 transition-colors"
        >
          Logout
        </button>
        <a
          href="https://spaceroboticscreations.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
        >
          SERC ↗
        </a>
      </div>
    </div>
  );
};

export default Index;