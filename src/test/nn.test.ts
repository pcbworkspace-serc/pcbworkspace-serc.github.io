import { afterEach, describe, it, expect, vi } from "vitest";
import { getAlignmentCorrection, getDetectBoxes, submitHumanLabel } from "@/lib/nn";
import { getCaptureSessionId, setBoardId } from "@/lib/labeling";

type FetchCall = [string, RequestInit];
const callOf = (m: ReturnType<typeof vi.fn>, i = 0) => m.mock.calls[i] as unknown as FetchCall;

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("alignment never invents a correction", () => {
  it("reports unreachable instead of random numbers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("network down"))));
    const r = await getAlignmentCorrection();
    expect(r).toEqual({ delta_theta_deg: 0, delta_x_mm: null, delta_y_mm: null, available: false, reason: "alignment backend unreachable" });
  });

  it("passes the backend's reason through on an error status", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ available: false, reason: "no image provided" }, 400)));
    const r = await getAlignmentCorrection();
    expect(r.available).toBe(false);
    expect(r.reason).toBe("no image provided");
  });

  it("keeps the capture id of a frame the model couldn't align", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ available: false, reason: "no component contour found in frame", capture_id: "c1" })));
    const r = await getAlignmentCorrection(new Blob(["x"]), "camera");
    expect(r).toMatchObject({ available: false, capture_id: "c1" });
  });
});

describe("frames carry capture tags", () => {
  const formOf = (fetchMock: ReturnType<typeof vi.fn>) => callOf(fetchMock)[1].body as FormData;

  it("camera frames send board, session and source", async () => {
    setBoardId("B3");
    const fetchMock = vi.fn(() => json({ boxes: [], image_size: [10, 10], model: "m", inference_ms: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await getDetectBoxes(new Blob(["x"], { type: "image/png" }), "camera");
    const form = formOf(fetchMock);
    expect(form.get("frame_source")).toBe("camera");
    expect(form.get("board_id")).toBe("B3");
    expect(form.get("session_id")).toBe(getCaptureSessionId());
  });

  it("scene renders send only their source", async () => {
    setBoardId("B3");
    const fetchMock = vi.fn(() => json({ boxes: [], image_size: [10, 10], model: "m", inference_ms: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await getDetectBoxes(new Blob(["x"], { type: "image/png" }), "scene_render");
    const form = formOf(fetchMock);
    expect(form.get("frame_source")).toBe("scene_render");
    expect(form.get("board_id")).toBeNull();
    expect(form.get("session_id")).toBeNull();
  });
});

describe("submitHumanLabel", () => {
  it("posts JSON to /nn/feedback and surfaces the backend's refusal", async () => {
    const fetchMock = vi.fn(() => json({ ok: false, error: "board_id 'B2' conflicts with 'B1' recorded at capture time" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    const res = await submitHumanLabel({ kind: "detect", capture_id: "c1" });
    expect(callOf(fetchMock)[0]).toMatch(/\/nn\/feedback$/);
    expect(JSON.parse(callOf(fetchMock)[1].body as string)).toEqual({ kind: "detect", capture_id: "c1" });
    expect(res).toEqual({ ok: false, error: "board_id 'B2' conflicts with 'B1' recorded at capture time" });
  });
});
