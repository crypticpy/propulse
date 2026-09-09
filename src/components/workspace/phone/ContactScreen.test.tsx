import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionReport } from "@/lib/map/decision";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";
import { ContactScreen } from "./ContactScreen";

const mocks = vi.hoisted(() => ({
  buildDecisionReport: vi.fn(),
  useActiveLocation: vi.fn(),
  useActiveStationGain: vi.fn(),
}));

// `buildDecisionReport` is #624's decision layer, owned by another agent —
// stub it and keep everything else (types, `DEFAULT_NEARBY_RADIUS_KM`,
// `formatUtcHm`) real.
vi.mock("@/lib/map/decision", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/map/decision")>();
  return { ...actual, buildDecisionReport: mocks.buildDecisionReport };
});
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.useActiveLocation,
}));
vi.mock("@/hooks/useActiveStationGain", () => ({
  useActiveStationGain: mocks.useActiveStationGain,
}));
// Solar data is irrelevant to this component's own logic (tone/TUNE come
// from the stubbed decision report and the roster); avoid pulling react-query
// into this file entirely.
vi.mock("@/hooks/useSolarData", () => ({
  useSolarFlux: () => ({ data: undefined }),
  useKIndex: () => ({ data: undefined }),
}));

const previousDX = useDXStore.getState();

function report(overrides: Partial<DecisionReport> = {}): DecisionReport {
  const evidence = { basis: "test", observedAt: null, fetchedAt: null };
  const end = {
    lat: 0,
    lon: 0,
    utcTime: "00:00",
    localMeanTime: "00:00",
    offsetHours: 0,
    sunriseUtc: null,
    sunsetUtc: null,
    polar: null,
    evidence,
  };
  return {
    generatedAt: "2026-09-08T00:00:00.000Z",
    almanac: {
      qth: end,
      target: end,
      greyline: { active: false, start: null, end: null, label: "No greyline", evidence },
    },
    pathMuf: null,
    nearby: { radiusKm: 500, count: 0, byBand: {}, hits: [], evidence },
    verdict: {
      line: "Workable now on 20m.",
      tone: "open",
      bestBand: "20m",
      wizardHref: "/dx",
      plannerHref: "/planner",
      evidence,
    },
    ...overrides,
  };
}

function spot(overrides: Partial<DXSpot>): DXSpot {
  return {
    id: overrides.id ?? "fixture",
    spotter: "W1AW",
    dx: "G4ABC",
    frequency: 14195,
    mode: "SSB",
    comment: "",
    time: new Date("2026-09-08T12:55:00Z"),
    band: "20m",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useDXStore.setState(previousDX, true);
  mocks.buildDecisionReport.mockReset().mockReturnValue(report());
  mocks.useActiveLocation.mockReset().mockReturnValue({
    id: "home",
    name: "Home",
    grid: "EM10",
    lat: 30,
    lon: -98,
    type: "home",
    createdAt: "",
  });
  mocks.useActiveStationGain.mockReset().mockReturnValue({
    antennaType: "dipole",
    systemLossDb: 0,
    txPowerWatts: 100,
    erpWatts: 100,
    physicsMode: "SSB",
  });
});

afterEach(() => {
  useDXStore.setState(previousDX, true);
});

describe("ContactScreen", () => {
  it("shows the empty state when no contact is selected", () => {
    render(<ContactScreen />);
    expect(screen.getByText("NO CONTACT SELECTED")).toBeTruthy();
    expect(mocks.buildDecisionReport).not.toHaveBeenCalled();
  });

  it("renders the verdict tone and one-sentence reason from the decision report", () => {
    mocks.buildDecisionReport.mockReturnValue(
      report({
        verdict: { ...report().verdict, tone: "closed", line: "Closed now." },
      }),
    );
    useOperatingStateStore.getState().setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: null,
      lon: null,
      spotId: "s1",
    });

    render(<ContactScreen />);

    expect(screen.getByText("CLOSED")).toBeTruthy();
    expect(screen.getByText("Closed now.")).toBeTruthy();
  });

  it("disables TUNE with a reason when no workspace on the roster published canTune", () => {
    useDXStore.setState({ spots: [spot({ id: "s1" })] });
    useOperatingStateStore.getState().setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: null,
      lon: null,
      spotId: "s1",
    });

    render(<ContactScreen />);

    const button = screen.getByRole("button", { name: /Tune:/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(
      screen.getByText("No workstation with a rig connected is on this session."),
    ).toBeTruthy();
  });

  it("disables TUNE with a reason when the target has no live spot to source a frequency from", () => {
    useOperatingStateStore.getState().registerWorkspace({
      workspaceId: "workstation-default",
      canvasType: "workstation",
      label: "Workstation",
      capabilities: { canTune: true, canCommand: true },
    });
    useOperatingStateStore.getState().setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: null,
      lon: null,
      spotId: "long-gone",
    });

    render(<ContactScreen />);

    const button = screen.getByRole("button", { name: /Tune:/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("No live frequency for this contact.")).toBeTruthy();
  });

  it("enables TUNE and posts a tune command naming the canTune workspace", () => {
    useOperatingStateStore.getState().registerWorkspace({
      workspaceId: "workstation-default",
      canvasType: "workstation",
      label: "Workstation",
      capabilities: { canTune: true, canCommand: true },
    });
    useDXStore.setState({ spots: [spot({ id: "s1", frequency: 14195, mode: "USB" })] });
    useOperatingStateStore.getState().setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: null,
      lon: null,
      spotId: "s1",
    });

    render(<ContactScreen />);

    const button = screen.getByRole("button", { name: "TUNE ON WORKSTATION" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);

    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "tune",
      workspaceId: "workstation-default",
      frequencyKHz: 14195,
      mode: "USB",
    });
  });
});
