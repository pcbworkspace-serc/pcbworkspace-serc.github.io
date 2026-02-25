import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type SavedProject = {
  id: string;
  name: string;
  lastOpened: number;
};

type SavedFilesProps = {
  onOpenProject?: (projectId: string) => void;
};

const SAVED_PROJECTS_KEY = "savedProjects";

function loadSavedProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is { id?: unknown; name?: unknown; lastOpened?: unknown } => !!item)
      .map((item) => ({
        id:
          typeof item.id === "string"
            ? item.id
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
      }))
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export default function SavedFiles({ onOpenProject }: SavedFilesProps) {
  const [projects, setProjects] = useState<SavedProject[]>([]);

  useEffect(() => {
    const refresh = () => setProjects(loadSavedProjects());
    refresh();

    window.addEventListener("saved-projects-updated", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("saved-projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="panel-border panel-bg rounded-lg overflow-hidden w-[240px]">
      <div className="w-full min-h-[140px] bg-muted p-2">
        {projects.length === 0 ? (
          <div className="h-[140px] flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No saved files</span>
          </div>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject?.(project.id)}
                  className="w-full rounded-md border border-border bg-background/50 px-2 py-1 text-left hover:bg-background/70"
                >
                  <p className="text-sm font-semibold text-primary truncate">{project.name}</p>
                  <p className="text-xs text-primary/90">Last opened: {new Date(project.lastOpened).toLocaleString()}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between px-2 py-1">
        <p className="text-xs text-muted-foreground">Saved Files</p>
        <Link to="/saved-projects" className="text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
    </div>
  );
}