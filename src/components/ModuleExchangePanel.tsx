import { useState } from "react";
import { demoRequest, previewExchange, runExchangeSimulation, scenarios,
  type ExchangePlan, type ExchangeResult, type Scenario } from "@/lib/moduleExchange";

export default function ModuleExchangePanel() {
  const [scenario, setScenario] = useState<Scenario>("nominal");
  const [plan, setPlan] = useState<ExchangePlan | null>(null);
  const [approved, setApproved] = useState(false);
  const [result, setResult] = useState<ExchangeResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true); setError(""); setPlan(null); setResult(null); setApproved(false);
    try { setPlan(await previewExchange(demoRequest(scenario))); }
    catch (e) { setError(e instanceof Error ? e.message : "Preview failed"); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!plan || !approved || busy) return;
    setBusy(true); setError(""); setResult(null);
    try { setResult(await runExchangeSimulation(demoRequest(scenario), plan.plan_id, approved)); }
    catch (e) { setError(e instanceof Error ? e.message : "Simulation failed"); }
    finally { setBusy(false); setApproved(false); }
  }

  return <section className="bg-black/20 rounded-xl p-3 border border-black/10 text-black text-xs" aria-label="Module exchange simulation">
    <h3 className="font-black uppercase tracking-wide text-[10px]">Module exchange</h3>
    <p className="my-2 font-semibold">Simulation only · no hardware commands</p>
    <p className="mb-2">Dummy module: source rack → destination slot. All feedback is synthetic.</p>
    <label className="block mb-2">Test scenario
      <select aria-label="Test scenario" className="block w-full mt-1 rounded p-1 bg-white text-black"
        value={scenario} disabled={busy} onChange={e => {
          setScenario(e.target.value as Scenario); setPlan(null); setResult(null); setApproved(false); setError("");
        }}>
        {scenarios.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>
    </label>
    <button type="button" disabled={busy} onClick={preview}
      className="bg-black text-cyan-300 rounded px-2 py-1 disabled:opacity-40">Preview exchange</button>
    {plan && <div className="mt-2 space-y-2">
      <p>{plan.stages.map(s => s.replace(/_/g, " ")).join(" → ")}</p>
      <p>No motion, collision, force or gravity validation.</p>
      <label className="flex gap-2 items-start"><input type="checkbox" checked={approved} disabled={busy}
        onChange={e => setApproved(e.target.checked)} />I approve this simulated exchange.</label>
      <button type="button" disabled={busy || !approved} onClick={run}
        className="bg-black text-cyan-300 rounded px-2 py-1 disabled:opacity-40">Run simulation</button>
    </div>}
    {busy && <p role="status" className="mt-2">Working…</p>}
    {error && <p role="alert" className="mt-2 font-semibold">{error}</p>}
    {result && <div className="mt-2" role="status">
      <p className="font-bold">{result.success ? "Simulation completed" : `Simulation stopped: ${result.fault}`}</p>
      <p>Simulated continuous restraint: {result.continuous_restraint ? "maintained" : "lost"}</p>
      <ol className="mt-2 space-y-1 max-h-48 overflow-auto">
        {result.trace.map((row, i) => <li key={i} className="border-t border-black/10 pt-1">
          {row.action.replace(/_/g, " ")}
          <span className="block text-[10px]">Holders: {[row.source_retained && "source", row.gripper_retained && "gripper",
            row.destination_retained && "destination"].filter(Boolean).join(", ") || "none"}</span>
        </li>)}
      </ol>
    </div>}
  </section>;
}
