import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import LabelingPanel from "@/components/LabelingPanel";
import DetectModal from "@/components/DetectModal";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const okFetch = () => vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })));

function panel(overrides: Partial<Parameters<typeof LabelingPanel>[0]> = {}) {
  return render(
    <LabelingPanel imageUrl="blob:frame" frame={null} imageSize={[400, 200]} captureId="abc123"
      capturedBoardId={null} frameSource="camera" {...overrides} />,
  );
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("LabelingPanel", () => {
  it("won't label a dataset sample or a scene render", () => {
    panel({ frameSource: "sample" });
    expect(screen.getByText(/bundled dataset sample, so it is not labeled/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Labeler/)).toBeNull();
    cleanup();
    panel({ frameSource: "scene_render" });
    expect(screen.getByText(/3D scene render, so it is not labeled/)).toBeInTheDocument();
  });

  it("explains when the backend didn't capture the frame", () => {
    panel({ captureId: null });
    fireEvent.click(screen.getByText("Label part boxes"));
    expect(screen.getByText(/capture is off/)).toBeInTheDocument();
  });

  it("turns a drawn box into a human label in the saved image's pixels", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    panel();
    fill(/Labeler/, "jd");
    fill(/Board ID/, "B1");
    fireEvent.click(screen.getByText("Label part boxes"));

    const canvas = screen.getByTestId("box-canvas");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 10 });
    fireEvent.mouseMove(canvas, { clientX: 60, clientY: 50 });
    fireEvent.mouseUp(canvas, { clientX: 60, clientY: 50 });
    fireEvent.click(screen.getByText("Save 1 box label"));

    expect(await screen.findByText(/Saved as your label for capture abc123/)).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      kind: "detect", capture_id: "abc123", label_source: "human", labeler: "jd", board_id: "B1",
      ground_truth: { boxes: [{ class: "R", box: [40, 20, 120, 100] }] },
    });
  });

  it("needs an explicit 'no parts' confirmation to save an empty frame", () => {
    panel();
    fireEvent.click(screen.getByText("Label part boxes"));
    expect(screen.getByText("Save 0 box labels")).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/has no parts/));
    expect(screen.getByText("Save 0 box labels")).toBeEnabled();
  });

  it("doesn't send a label without a labeler", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);
    panel();
    fill(/Labeler/, "");
    fill(/Board ID/, "B1");
    fireEvent.click(screen.getByText("Label part boxes"));
    fireEvent.click(screen.getByLabelText(/has no parts/));
    fireEvent.click(screen.getByText("Save 0 box labels"));
    expect(await screen.findByText(/enter your name or initials/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns when the board id differs from the one recorded at capture", () => {
    panel({ capturedBoardId: "B1" });
    fill(/Board ID/, "B9");
    expect(screen.getByText(/captured as board B1/)).toBeInTheDocument();
  });
});

describe("DetectModal hides the model's answer while labeling", () => {
  it("removes predicted boxes once labeling starts", () => {
    render(
      <DetectModal loading={false} onClose={() => {}} onDetectAgain={() => {}} currentMethod="yolo_hybrid" onChangeMethod={() => {}}
        result={{
          groundTruth: [], circuits: [], nets: null, mlClass: null, mlConfidence: null, mlError: null,
          mlImageUrl: "blob:frame", mlImageSize: [400, 200], mlSource: "camera", mlFrameSource: "camera",
          mlCaptureId: "abc123", mlCaptureBoardId: null, mlFrame: null,
          mlBoxes: [{ box: [1, 2, 30, 40], box_norm: [0, 0, 0.1, 0.2], class: "R", class_full: "Resistor", score: 0.9 }],
        }} />,
    );
    expect(screen.getByText("Box Predictions")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Label part boxes"));
    expect(screen.queryByText("Box Predictions")).toBeNull();
    expect(screen.queryByText(/R 90%/)).toBeNull();
  });
});
