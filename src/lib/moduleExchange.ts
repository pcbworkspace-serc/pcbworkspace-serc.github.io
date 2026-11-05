const BASE = (import.meta.env.VITE_NN_URL as string | undefined) || "http://localhost:5000";

export const scenarios = ["nominal", "missing_grasp", "source_stuck",
  "destination_unlatched", "stale_feedback", "power_loss"] as const;
export type Scenario = typeof scenarios[number];
export type ExchangeRequest = {
  module_id: "dummy_module";
  source_id: "demo_source";
  destination_id: "demo_destination";
  scenario: Scenario;
};
export type ExchangePlan = ExchangeRequest & {
  plan_id: string;
  mode: "simulation";
  registry_version: string;
  stages: string[];
  limitations: string[];
  hardware_executed: false;
};
export type ExchangeResult = {
  ok: true;
  mode: "simulation";
  hardware_executed: false;
  plan_id: string;
  state: "completed" | "faulted";
  success: boolean;
  fault: string | null;
  continuous_restraint: boolean;
  trace: { stage: string; action: string; source_retained: boolean;
    gripper_retained: boolean; destination_retained: boolean;
    destination_seated: boolean; feedback_kind: "synthetic" }[];
};

export function demoRequest(scenario: Scenario): ExchangeRequest {
  return { module_id: "dummy_module", source_id: "demo_source",
    destination_id: "demo_destination", scenario };
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${BASE}/exchange/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || "Exchange request failed");
    return data;
  } finally { clearTimeout(timeout); }
}

function requireSimulation(value: { mode?: unknown; hardware_executed?: unknown }) {
  if (value.mode !== "simulation" || value.hardware_executed !== false) {
    throw new Error("Expected an explicitly labeled simulation response");
  }
}

export async function previewExchange(request: ExchangeRequest): Promise<ExchangePlan> {
  const data = await post("plan", request);
  const plan = data.plan as ExchangePlan;
  if (!plan || !Array.isArray(plan.stages) || !plan.plan_id) throw new Error("Invalid exchange preview");
  requireSimulation(plan);
  return plan;
}

export async function runExchangeSimulation(request: ExchangeRequest, planId: string,
  approved: boolean): Promise<ExchangeResult> {
  if (approved !== true) throw new Error("Approve the preview before simulating");
  const result = await post("simulate", { request, plan_id: planId, approved: true }) as unknown as ExchangeResult;
  requireSimulation(result);
  if (result.plan_id !== planId || !Array.isArray(result.trace)) throw new Error("Invalid simulation result");
  return result;
}
