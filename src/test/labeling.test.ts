import { describe, it, expect } from "vitest";
import {
  alignmentFromClicks, boxFromCorners, buildFeedbackPayload, captureFields, getCaptureSessionId,
  isLabelableSource, newSessionId, setBoardId, toImagePixels,
} from "@/lib/labeling";

describe("which frames can be labeled", () => {
  it("only camera photos and uploads", () => {
    expect(isLabelableSource("camera")).toBe(true);
    expect(isLabelableSource("upload")).toBe(true);
    expect(isLabelableSource("sample")).toBe(false);
    expect(isLabelableSource("scene_render")).toBe(false);
    expect(isLabelableSource(null)).toBe(false);
  });

  it("renders and dataset samples never carry board or session ids", () => {
    setBoardId("B1");
    expect(captureFields("scene_render")).toEqual({ frame_source: "scene_render" });
    expect(captureFields("sample")).toEqual({ frame_source: "sample" });
    expect(captureFields("camera")).toEqual({ frame_source: "camera", board_id: "B1", session_id: getCaptureSessionId() });
  });

  it("omits the board id until one is entered", () => {
    setBoardId("");
    expect(captureFields("upload")).toEqual({ frame_source: "upload", session_id: getCaptureSessionId() });
  });

  it("starts a new capture session when the board changes", () => {
    setBoardId("B1");
    const first = getCaptureSessionId();
    setBoardId(" B1 ");
    expect(getCaptureSessionId()).toBe(first);
    setBoardId("B2");
    expect(getCaptureSessionId()).not.toBe(first);
  });

  it("session ids are timestamped and unique per draw", () => {
    const t = new Date("2026-10-16T14:03:22Z");
    expect(newSessionId(t, () => 0.5)).toBe("2026-10-16-14-03-22-7fffff");
    expect(newSessionId(t, () => 0.1)).not.toBe(newSessionId(t, () => 0.2));
  });
});

describe("geometry", () => {
  it("maps displayed points to the saved image's pixels and clamps to it", () => {
    expect(toImagePixels({ x: 50, y: 25 }, { w: 200, h: 100 }, [800, 400])).toEqual({ x: 200, y: 100 });
    expect(toImagePixels({ x: -5, y: 130 }, { w: 200, h: 100 }, [800, 400])).toEqual({ x: 0, y: 400 });
  });

  it("normalizes a box dragged in any direction", () => {
    expect(boxFromCorners({ x: 30, y: 5 }, { x: 10, y: 25 })).toEqual([10, 5, 30, 25]);
  });

  it("alignment from clicks uses the /nn/align convention", () => {
    // pin 1 left of center: the part's axis points +x, angle 0
    expect(alignmentFromClicks({ x: 25, y: 10 }, { x: 15, y: 10 }, [40, 20]))
      .toEqual({ delta_theta_deg: 0, delta_x_px: 5, delta_y_px: 0 });
    // pin 1 above center on screen: axis points down, +90 (clockwise on screen)
    expect(alignmentFromClicks({ x: 20, y: 10 }, { x: 20, y: 0 }, [40, 20]).delta_theta_deg).toBe(90);
    // pin 1 right of center: 180
    expect(alignmentFromClicks({ x: 20, y: 10 }, { x: 30, y: 10 }, [40, 20]).delta_theta_deg).toBe(180);
    expect(alignmentFromClicks({ x: 10, y: 14 }, { x: 0, y: 4 }, [40, 20]))
      .toEqual({ delta_theta_deg: 45, delta_x_px: -10, delta_y_px: 4 });
  });

  it("refuses two clicks on the same spot", () => {
    expect(() => alignmentFromClicks({ x: 5, y: 5 }, { x: 5.2, y: 5 }, [10, 10])).toThrow(/pin-1/);
  });
});

describe("feedback payload", () => {
  const label = { kind: "detect" as const, captureId: "abc123", groundTruth: { boxes: [{ class: "R", box: [1, 2, 3, 4] as [number, number, number, number] }] } };

  it("is always a named human label with a board id", () => {
    expect(buildFeedbackPayload(label, "  jd ", " B7 ")).toEqual({
      kind: "detect", capture_id: "abc123", ground_truth: label.groundTruth,
      label_source: "human", labeler: "jd", board_id: "B7",
    });
  });

  it("refuses an anonymous label, a missing board or an uncaptured frame", () => {
    expect(() => buildFeedbackPayload(label, " ", "B7")).toThrow(/labeler/);
    expect(() => buildFeedbackPayload(label, "jd", "")).toThrow(/board id/);
    expect(() => buildFeedbackPayload({ ...label, captureId: "" }, "jd", "B7")).toThrow(/not captured/);
  });
});
