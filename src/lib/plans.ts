// Sprint 11 — Plan library.
//
// Save useful VLA plans as named templates for one-click replay. Lives in
// localStorage so it survives reloads but is per-browser, not per-user.
//
// Workflow:
//   1. Type an instruction → VLA generates a plan → execute
//   2. If it worked well, click "Save as template" → give it a name
//   3. Later, open the Plans popover → click the template → executes immediately
//      (no LLM round-trip, no camera frame, no token cost)

import type { VLAAction } from "./vla";

const LS_KEY = "pcb.savedPlans.v1";
const MAX_PLANS = 30;

export interface SavedPlan {
  id: string;
  name: string;
  instruction: string;     // what the user originally typed
  actions: VLAAction[];    // the plan Claude generated
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

function readAll(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedPlan[];
  } catch {
    return [];
  }
}

function writeAll(plans: SavedPlan[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(plans.slice(0, MAX_PLANS)));
}

export function listSavedPlans(): SavedPlan[] {
  return readAll().sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export function savePlan(name: string, instruction: string, actions: VLAAction[]): SavedPlan {
  const cleanName = name.trim().slice(0, 60);
  const now = Date.now();
  const plan: SavedPlan = {
    id: `plan_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName || `Plan ${new Date(now).toLocaleString()}`,
    instruction,
    actions,
    createdAt: now,
    lastUsedAt: now,
    useCount: 0,
  };
  // De-dupe by name — replacing an existing plan with the same name
  const filtered = readAll().filter((p) => p.name !== plan.name);
  writeAll([plan, ...filtered]);
  return plan;
}

export function deletePlan(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function markPlanUsed(id: string): void {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], lastUsedAt: Date.now(), useCount: all[idx].useCount + 1 };
  writeAll(all);
}

export function getPlan(id: string): SavedPlan | null {
  return readAll().find((p) => p.id === id) ?? null;
}

export function clearAllPlans(): void {
  localStorage.removeItem(LS_KEY);
}

// Browser console access
if (typeof window !== "undefined") {
  (window as any).__listPlans = listSavedPlans;
  (window as any).__clearPlans = clearAllPlans;
}
