import { afterEach, describe, expect, it, vi } from "vitest";
import { demoRequest, previewExchange, runExchangeSimulation } from "./moduleExchange";

afterEach(() => vi.unstubAllGlobals());

describe("module exchange API", () => {
  it("previews through the backend and keeps simulation labeling", async () => {
    const plan = { ...demoRequest("nominal"), plan_id: "p1", stages: ["capture"],
      mode: "simulation", hardware_executed: false };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, plan }) });
    vi.stubGlobal("fetch", fetch);
    expect(await previewExchange(demoRequest("nominal"))).toEqual(plan);
    expect(fetch.mock.calls[0][0]).toContain("/exchange/plan");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(demoRequest("nominal"));
  });
  it("never sends an unapproved request", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(runExchangeSimulation(demoRequest("nominal"), "p1", false)).rejects.toThrow("Approve");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a stale plan and preserves backend error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false,
      json: async () => ({ ok: false, error: "Plan changed; preview and approve again" }) }));
    await expect(runExchangeSimulation(demoRequest("power_loss"), "p1", true)).rejects.toThrow("Plan changed");
  });
  it("rejects responses that claim hardware execution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
      plan: { plan_id: "p1", stages: [], mode: "hardware", hardware_executed: true } }) }));
    await expect(previewExchange(demoRequest("nominal"))).rejects.toThrow("simulation");
  });
  it("returns a faulted simulation as a result rather than physical success", async () => {
    const result = { ok: true, plan_id: "p1", mode: "simulation", hardware_executed: false,
      state: "faulted", success: false, fault: "power_loss", trace: [] };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetch);
    expect(await runExchangeSimulation(demoRequest("power_loss"), "p1", true)).toEqual(result);
    expect(JSON.parse(fetch.mock.calls[0][1].body).approved).toBe(true);
  });
});
