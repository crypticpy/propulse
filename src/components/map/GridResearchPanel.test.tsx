import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridResearchPanel } from "./GridResearchPanel";

const mocks = vi.hoisted(() => ({ useHamQTHLookup: vi.fn(), useGridResearch: vi.fn() }));

vi.mock("@/hooks/useHamQTHLookup", () => ({ useHamQTHLookup: mocks.useHamQTHLookup }));
vi.mock("@/hooks/useGridResearch", () => ({ useGridResearch: mocks.useGridResearch }));

describe("GridResearchPanel initialCallsign", () => {
  beforeEach(() => {
    mocks.useGridResearch.mockReturnValue({
      grid: "EM10",
      entity: null,
      distance: null,
      bearing: null,
      activity: { total: 0, byBand: {}, byMode: {}, recentCallsigns: [] },
      bestTime: null,
      isLoading: false,
      isValidGrid: true,
      homeGrid: null,
    });
    mocks.useHamQTHLookup.mockReturnValue({
      external: { name: "Test Operator", grid: "GG66", country: "Brazil", qth: "Sao Paulo" },
      local: undefined,
      loading: false,
      externalError: undefined,
      localError: undefined,
    });
  });

  it("opens directly to the normalized operator and retains profile actions", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <GridResearchPanel
        visible
        grid="EM10"
        initialCallsign="py2abc"
        onAction={onAction}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByText("PY2ABC")).toBeTruthy();
    expect(screen.getByText("Operator")).toBeTruthy();
    expect(screen.getByText("Test Operator")).toBeTruthy();
    expect(screen.getByText("Brazil")).toBeTruthy();
    expect(mocks.useHamQTHLookup).toHaveBeenCalledWith("PY2ABC");
    await user.click(screen.getByRole("button", { name: "Target" }));
    expect(onAction).toHaveBeenCalledWith("setTarget", {
      kind: "callsign",
      callsign: "PY2ABC",
      grid: "GG66",
    });
    await user.click(screen.getByRole("button", { name: "Back to grid view" }));
    expect(screen.getByText("Grid Research")).toBeTruthy();
    expect(screen.getByText("EM10")).toBeTruthy();
  });

  it("routes grid and newly selected operator watches to their visible subject", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    mocks.useGridResearch.mockReturnValue({
      grid: "EM10",
      entity: null,
      distance: null,
      bearing: null,
      activity: {
        total: 1,
        byBand: { "20m": 1 },
        byMode: { FT8: 1 },
        recentCallsigns: ["K1ABC"],
      },
      bestTime: null,
      isLoading: false,
      isValidGrid: true,
      homeGrid: null,
    });

    render(
      <GridResearchPanel
        visible
        grid="EM10"
        initialCallsign="PY2ABC"
        onAction={onAction}
        onClose={() => {}}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: "Back to grid view" }),
    );
    await user.click(screen.getByRole("button", { name: "Watch" }));
    expect(onAction).toHaveBeenLastCalledWith("watch", {
      kind: "grid",
      grid: "EM10",
    });

    await user.click(
      screen.getByRole("button", { name: "View details for K1ABC" }),
    );
    await user.click(await screen.findByRole("button", { name: "Watch" }));
    expect(onAction).toHaveBeenLastCalledWith("watch", {
      kind: "callsign",
      callsign: "K1ABC",
      grid: "GG66",
    });
  });
});
