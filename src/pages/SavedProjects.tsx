import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearSession, getCurrentUserEmail, getSavedProjectsKey } from "@/lib/auth";

type Project = {
  id: string;
  name: string;
  lastOpened: number;
};

function loadProjects(): Project[] {
  const email = getCurrentUserEmail();
  if (!email) return [];

  try {
    const stored = localStorage.getItem(getSavedProjectsKey(email));
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
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
      .sort((a, b) => b.lastOpened - a.lastOpened);
  } catch {
    return [];
  }
}

function saveProjects(projects: Project[]) {
  const email = getCurrentUserEmail();
  if (!email) return;
  localStorage.setItem(getSavedProjectsKey(email), JSON.stringify(projects));
  window.dispatchEvent(new Event("saved-projects-updated"));
}

const SavedProjects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();
  const email = getCurrentUserEmail();

  useEffect(() => {
    const refresh = () => setProjects(loadProjects());
    refresh();

    window.addEventListener("saved-projects-updated", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("saved-projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const openProject = (project: Project) => {
    // Navigate back to editor and pass project id
    navigate("/", { state: { projectId: project.id } });
  };

  const deleteProject = (projectId: string) => {
    const updated = projects.filter((project) => project.id !== projectId);
    setProjects(updated);
    saveProjects(updated);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Link to="/">← Back to workspace</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <small>{email ?? ""}</small>
          <button
            type="button"
            onClick={() => {
              navigate("/login", { replace: true });
            }}
            style={{
              border: "1px solid #ddd",
              background: "#fff",
              borderRadius: 4,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Switch Account
          </button>
          <button
            type="button"
            onClick={() => {
              clearSession();
              navigate("/login", { replace: true });
            }}
            style={{
              border: "1px solid #ddd",
              background: "#fff",
              borderRadius: 4,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Logout
          </button>
        </div>
      </div>
      <h1 style={{ marginBottom: 14 }}>Saved Projects</h1>

      {projects.length === 0 ? (
        <p>No saved projects yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {projects.map((project) => (
            <li
              key={project.id}
              style={{
                marginBottom: 10,
                border: "1px solid #ddd",
                borderRadius: 6,
                padding: 10,
                background: "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => openProject(project)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    cursor: "pointer",
                    border: "none",
                    padding: 0,
                    background: "transparent",
                  }}
                >
                  <strong style={{ color: "hsl(var(--primary))", fontSize: 16 }}>{project.name}</strong>
                  <br />
                  <small style={{ color: "hsl(var(--primary))" }}>Last opened: {new Date(project.lastOpened).toLocaleString()}</small>
                </button>
                <button
                  type="button"
                  onClick={() => deleteProject(project.id)}
                  style={{
                    border: "1px solid #ddd",
                    background: "#fff",
                    borderRadius: 4,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SavedProjects;