import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ModuleExchangePanel from "./ModuleExchangePanel";
import { previewExchange, runExchangeSimulation } from "@/lib/moduleExchange";

vi.mock("@/lib/moduleExchange", () => ({
  scenarios: ["nominal", "power_loss"], demoRequest: (scenario: string) => ({ scenario }),
  previewExchange: vi.fn(), runExchangeSimulation: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("requires preview and confirmation, and clears them when the scenario changes", async () => {
  vi.mocked(previewExchange).mockResolvedValue({ plan_id: "p1", stages: ["capture", "release"] } as never);
  render(<ModuleExchangePanel />);
  expect(screen.queryByRole("button", { name: "Run simulation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Preview exchange" }));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Run simulation" })).not.toBeDisabled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "power_loss" } });
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(runExchangeSimulation).not.toHaveBeenCalled();
});

it("shows a fault as a stopped simulation and requires approval again", async () => {
  vi.mocked(previewExchange).mockResolvedValue({ plan_id: "p1", stages: ["capture"] } as never);
  vi.mocked(runExchangeSimulation).mockResolvedValue({ success: false, fault: "power_loss",
    continuous_restraint: true, trace: [] } as never);
  render(<ModuleExchangePanel />);
  fireEvent.click(screen.getByRole("button", { name: "Preview exchange" }));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
  await waitFor(() => expect(screen.getByText("Simulation stopped: power_loss")).toBeInTheDocument());
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(screen.getByText(/no hardware commands/)).toBeInTheDocument();
});
