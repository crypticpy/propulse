import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EngineComparisonStrip } from "./EngineComparisonStrip";
import { bandFrequencyStepClassifier } from "@/lib/hamclock/engineComparison";
import type { EngineReading } from "@/lib/hamclock/engineComparison";
import { BestBandReport } from "./BestBandReport";
import { MufReport } from "./MufReport";
import { MufTile } from "../tiles/MufTile";
import { useProfileStore } from "@/stores/profileStore";

const mocks = vi.hoisted(() => ({
  verdicts: vi.fn(),
  activity: vi.fn(),
  location: vi.fn(),
  sfi: vi.fn(),
  mufSeries: vi.fn(),
  kIndex: vi.fn(),
  solarFlux: vi.fn(),
  stationCast: vi.fn(),
  nowCast: vi.fn(),
  target: vi.fn(),
  timeOffset: vi.fn(),
  setCenterLocation: vi.fn(),
  setFlashPoint: vi.fn(),
  reliability: vi.fn(),
  setBandFocus: vi.fn(),
  setSpotFilters: vi.fn(),
}));

vi.mock("@/hooks/useBandVerdicts", () => ({ useBandVerdicts: mocks.verdicts }));
vi.mock("@/hooks/useBandActivity", () => ({ useBandActivity: mocks.activity }));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/hooks/useMUFData", () => ({
  useCurrentSFI: mocks.sfi,
  useMUFHourlySeries: mocks.mufSeries,
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: mocks.kIndex,
  useSolarFlux: mocks.solarFlux,
}));
vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: mocks.stationCast,
}));
vi.mock("@/hooks/useNowCastBandPredictions", () => ({
  useNowCastBandPredictions: mocks.nowCast,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      timeOffset: mocks.timeOffset(),
      target: mocks.target(),
      setCenterLocation: mocks.setCenterLocation,
      setFlashPoint: mocks.setFlashPoint,
      spotFilters: { bands: [] },
      setSpotFilters: mocks.setSpotFilters,
    }),
}));
vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: (selector: (state: unknown) => unknown) =>
    selector({
      reliability: mocks.reliability(),
      setBandFocus: mocks.setBandFocus,
    }),
}));

/** Austin, TX — the QTH shared by every fixture below. At 18Z with SFI 140
 * this is a known point (19.9 MHz MUF, top band 17m) already pinned by
 * `wallTiles.test.tsx`, so the same instant is reused here for a MUF that
 * needs no re-derivation to assert against. */
const AUSTIN = {
  id: "home",
  name: "Austin",
  grid: "EM10dg",
  lat: 30.27,
  lon: -97.74,
  timezone: "America/Chicago",
  type: "home" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const LONDON = { lat: 51.5, lon: -0.13, name: "London", grid: "IO91wm" };

function bandEntry(overrides: {
  band: string;
  stable: "hot" | "verified" | "stirring" | "forecast" | "closed";
  physicsOpen: boolean;
  physicsScore: number;
  obs20m: number;
  reporters20m: number;
  surprise: boolean;
}) {
  return {
    band: overrides.band,
    stable: overrides.stable,
    result: {
      scopeId: "regional:NA",
      band: overrides.band,
      evaluation: {
        state: overrides.stable,
        surprise: overrides.surprise,
        physicsOpen: overrides.physicsOpen,
        verified: overrides.stable === "verified" || overrides.stable === "hot",
        trend: "flat",
        why: [],
      },
      inputs: {
        physicsScore: overrides.physicsScore,
        obs20m: overrides.obs20m,
        reporters20m: overrides.reporters20m,
        count10mRecent: 0,
        count10mPrior: 0,
      },
      counts: {
        count60m: overrides.obs20m * 2,
        sourceCounts60m: { dxcluster: 3, rbn: 5, pskreporter: 0 },
        modeObs20m: {},
      },
      at: Date.now(),
    },
  };
}

const NO_NOWCAST = {
  enabled: true,
  visible: true,
  available: false,
  personalized: false,
  pending: false,
  capabilityError: null,
  predictions: new Map(),
  stationEnvelopes: new Map(),
  errors: new Map(),
  requestedCount: 0,
  failedCount: 0,
  partial: false,
  fallbackBands: [],
  staleInputBands: [],
  nowcastBands: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
  mocks.location.mockReturnValue(AUSTIN);
  mocks.sfi.mockReturnValue(140);
  mocks.mufSeries.mockReturnValue(null);
  mocks.kIndex.mockReturnValue({ data: [{ kp_index: 2 }], isLoading: false });
  mocks.solarFlux.mockReturnValue({ data: [{ flux: 140 }], isLoading: false });
  mocks.stationCast.mockReturnValue({
    location: { grid: AUSTIN.grid, lat: AUSTIN.lat, lon: AUSTIN.lon },
    locationSource: "active_location",
    chain: null,
    hasConfiguredChain: false,
    deriveEnvelope: () => null,
  });
  mocks.nowCast.mockReturnValue(NO_NOWCAST);
  mocks.target.mockReturnValue(null);
  mocks.timeOffset.mockReturnValue(0);
  mocks.reliability.mockReturnValue({
    mode: "FT8",
    powerWatts: 100,
    antennaType: "dipole",
  });
  mocks.activity.mockReturnValue({
    data: Object.assign(new Map(), { fetchedAt: Date.now() }),
    isPending: false,
    isError: false,
  });
  mocks.verdicts.mockReturnValue({
    bands: [],
    ready: true,
    scope: { id: "regional:NA", label: "North America", type: "regional" },
    activityScope: { type: "regional", continent: "NA" },
  });
});

describe("EngineComparisonStrip (HW-56)", () => {
  const classify = bandFrequencyStepClassifier("20m", 2);

  it("shows an honest label per unavailable engine and never borrows another engine's value", () => {
    const physics: EngineReading = {
      value: "18.0 MHz",
      comparable: { kind: "number", value: 18, unit: "MHz" },
      state: "ok",
    };
    const nowcast: EngineReading = {
      value: "—",
      comparable: { kind: "none" },
      state: "unavailable",
    };
    const observed: EngineReading = {
      value: "—",
      comparable: { kind: "none" },
      state: "unavailable",
    };
    const { container } = render(
      <EngineComparisonStrip
        subject="20M"
        physics={physics}
        nowcast={nowcast}
        observed={observed}
        classify={classify}
      />,
    );
    // Both the decorative columns and their sr-only table twin carry the
    // same honest labels — never a shared generic "NO DATA".
    expect(screen.getAllByText("MODEL OFF")).toHaveLength(2);
    expect(screen.getAllByText("NO SPOTS")).toHaveLength(2);
    expect(screen.getAllByText("18.0 MHz")).toHaveLength(2);
    // Fewer than two comparable readings: the strip must say so, not guess.
    expect(container.querySelector(".hcr-enginestrip-word")?.textContent).toBe(
      "NO COMPARISON",
    );
  });

  it("states AGREE/SPLIT/DISAGREE with a reason, and carries an sr-only twin of every column", () => {
    const physics: EngineReading = {
      value: "18.0 MHz",
      comparable: { kind: "number", value: 18, unit: "MHz" },
      state: "ok",
    };
    const nowcast: EngineReading = {
      value: "18.5 MHz",
      comparable: { kind: "number", value: 18.5, unit: "MHz" },
      state: "ok",
    };
    const observed: EngineReading = {
      value: "12 SPOTS",
      comparable: { kind: "verdict", verdict: "open" },
      state: "ok",
    };
    const { container } = render(
      <EngineComparisonStrip
        subject="20M"
        physics={physics}
        nowcast={nowcast}
        observed={observed}
        classify={classify}
      />,
    );
    expect(["AGREE", "SPLIT", "DISAGREE"]).toContain(
      container.querySelector(".hcr-enginestrip-word")?.textContent,
    );
    const srTable = container.querySelector("table.sr-only");
    expect(srTable).toBeTruthy();
    // 1 header row + 3 engine rows + 1 verdict row.
    expect(within(srTable as HTMLElement).getAllByRole("row")).toHaveLength(5);
  });
});

describe("MufTile opens MufReport, not the shared forecast report (HW-57)", () => {
  it("opens a report with PATH and HOPS tabs instead of the 24h reliability matrix", async () => {
    const user = userEvent.setup();
    render(<MufTile />);
    await user.click(
      screen.getByRole("button", { name: /Open the propagation report/ }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("tab", { name: "PATH" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "HOPS" })).toBeTruthy();
    expect(dialog.querySelector(".hcr-matrix")).toBeNull();
  });
});

describe("MufReport engine strip and hops (HW-57)", () => {
  it("reads MODEL OFF and NO SPOTS when no target and no ladder entry back the other two engines", () => {
    render(<MufReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    // Each label appears twice: once in the visible strip, once in its
    // sr-only table twin.
    expect(within(dialog).getAllByText("MODEL OFF")).toHaveLength(2);
    expect(within(dialog).getAllByText("NO SPOTS")).toHaveLength(2);
    // The physics column is never unavailable once SFI and a QTH exist.
    expect(within(dialog).queryAllByText("NO DATA")).toHaveLength(0);
  });

  it("derives the observed reading from the highest ladder band with recent spots, independent of the physics-implied band", () => {
    // Physics resolves to 17m for this fixture (see the Austin comment
    // above). 15m has more recent activity than 17m -- the observed column
    // must report 15m's activity, not silently fall back to 17m's lower
    // count just because that happens to be the physics band.
    mocks.verdicts.mockReturnValue({
      bands: [
        bandEntry({
          band: "17m",
          stable: "stirring",
          physicsOpen: true,
          physicsScore: 0.6,
          obs20m: 3,
          reporters20m: 2,
          surprise: false,
        }),
        bandEntry({
          band: "15m",
          stable: "verified",
          physicsOpen: true,
          physicsScore: 0.7,
          obs20m: 9,
          reporters20m: 5,
          surprise: false,
        }),
      ],
      ready: true,
      scope: { id: "regional:NA", label: "North America", type: "regional" },
      activityScope: { type: "regional", continent: "NA" },
    });

    render(<MufReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("9 OBS/20 MIN").length).toBeGreaterThan(
      0,
    );
    expect(within(dialog).queryAllByText("3 OBS/20 MIN")).toHaveLength(0);
  });

  it("marks NowCast and observed unavailable as TIME SHIFTED when the map's time machine is offset from real time", () => {
    mocks.timeOffset.mockReturnValue(6);
    mocks.nowCast.mockReturnValue({
      ...NO_NOWCAST,
      available: true,
      predictions: new Map([
        [
          "17m",
          {
            core_probability: 0.8,
            personalized_probability: 0.8,
            confidence: 0.9,
          },
        ],
      ]),
    });
    mocks.verdicts.mockReturnValue({
      bands: [
        bandEntry({
          band: "17m",
          stable: "verified",
          physicsOpen: true,
          physicsScore: 0.8,
          obs20m: 9,
          reporters20m: 5,
          surprise: false,
        }),
      ],
      ready: true,
      scope: { id: "regional:NA", label: "North America", type: "regional" },
      activityScope: { type: "regional", continent: "NA" },
    });

    render(<MufReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("TIME SHIFTED").length).toBe(4);
    // The physics reading -- the one actually evaluated at the shifted
    // instant -- stays live rather than getting swept into "unavailable".
    expect(within(dialog).queryAllByText("NO DATA")).toHaveLength(0);
  });

  it("prompts for a target instead of rendering an empty HOPS tab", async () => {
    const user = userEvent.setup();
    render(<MufReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "HOPS" }));
    expect(
      within(dialog).getByText("Pick a target on the map to trace a path."),
    ).toBeTruthy();
  });

  it("lists hops once a target is set and flashes the clicked hop's reflection point on the map", async () => {
    mocks.target.mockReturnValue(LONDON);
    const user = userEvent.setup();
    render(<MufReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "HOPS" }));

    const rows = within(dialog).queryAllByRole("button", {
      name: (_, el) => el.classList.contains("hcr-hoprow"),
    });
    // A trans-Atlantic path at SFI 140 always resolves at least one hop.
    expect(rows.length).toBeGreaterThan(0);

    await user.click(rows[0]);
    expect(mocks.setCenterLocation).toHaveBeenCalledTimes(1);
    const [lat, lon] = mocks.setCenterLocation.mock.calls[0];
    expect(typeof lat).toBe("number");
    expect(typeof lon).toBe("number");
    // Recentering the camera alone leaves no visible trace of which point
    // was picked -- the same reflection point must also be flashed.
    expect(mocks.setFlashPoint).toHaveBeenCalledTimes(1);
    expect(mocks.setFlashPoint.mock.calls[0]).toEqual([lat, lon]);
  });

  it("draws the FOT/LUF usable-window band and carries an sr-only twin with FOT < MUF and LUF < FOT for every sampled hour", () => {
    const base = Date.parse("2026-09-05T18:00:00Z");
    const series = Array.from({ length: 24 }, (_, i) => {
      const muf = 18 + i * 0.1;
      return {
        timestamp: new Date(base - (23 - i) * 60 * 60 * 1000).toISOString(),
        muf,
        fot: muf * 0.85,
        luf: 4 + i * 0.05,
      };
    });
    mocks.mufSeries.mockReturnValue(series);

    render(<MufReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const chart = dialog.querySelector(".hcr-chart");
    expect(chart).toBeTruthy();
    // The shaded usable window sits behind the MUF line, filled in a dim
    // token colour — never a hardcoded hex.
    const band = chart!.querySelector("svg path[fill*='--hcr-chart-dim']");
    expect(band).toBeTruthy();

    const rows = chart!.querySelectorAll("table.sr-only tbody tr");
    expect(rows.length).toBe(series.length);
    rows.forEach((row) => {
      // Columns: Hour, MUF, FOT, LUF.
      const cells = row.querySelectorAll("td");
      const muf = parseFloat(cells[1].textContent ?? "");
      const fot = parseFloat(cells[2].textContent ?? "");
      const luf = parseFloat(cells[3].textContent ?? "");
      expect(fot).toBeLessThan(muf);
      expect(luf).toBeLessThan(fot);
    });
  });
});

describe("BestBandReport carries the strip above its table (HW-56)", () => {
  beforeEach(() => {
    mocks.verdicts.mockReturnValue({
      bands: [
        bandEntry({
          band: "20m",
          stable: "verified",
          physicsOpen: true,
          physicsScore: 0.8,
          obs20m: 12,
          reporters20m: 6,
          surprise: false,
        }),
      ],
      ready: true,
      scope: { id: "regional:NA", label: "North America", type: "regional" },
      activityScope: { type: "regional", continent: "NA" },
    });
  });

  it("renders the engine strip for the leading band above the ranked table", () => {
    render(<BestBandReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    const strip = dialog.querySelector(".hcr-enginestrip");
    const table = dialog.querySelector(".hcr-bandtable-caption");
    expect(strip).toBeTruthy();
    expect(table).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING (4): the table caption comes after the strip.
    expect(
      strip!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(strip as HTMLElement).getByText(/Engine comparison · 20M/),
    ).toBeTruthy();
  });
});

describe("BestBandReport keeps NowCast on the ladder's own path (finding 7)", () => {
  const bands = [
    bandEntry({
      band: "20m",
      stable: "verified",
      physicsOpen: true,
      physicsScore: 0.8,
      obs20m: 12,
      reporters20m: 6,
      surprise: false,
    }),
  ];

  afterEach(() => {
    useProfileStore.setState({ savedTargets: [] });
  });

  it("marks NowCast unavailable with the scope's name when the ladder is regional, even with NowCast data available", () => {
    mocks.verdicts.mockReturnValue({
      bands,
      ready: true,
      scope: { id: "regional:NA", label: "North America", type: "regional" },
      activityScope: { type: "regional", continent: "NA" },
    });
    mocks.nowCast.mockReturnValue({
      ...NO_NOWCAST,
      available: true,
      predictions: new Map([
        [
          "20m",
          {
            core_probability: 0.8,
            personalized_probability: 0.8,
            confidence: 0.9,
          },
        ],
      ]),
    });

    render(<BestBandReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getAllByText("REGIONAL SCOPE").length,
    ).toBeGreaterThan(0);
  });

  it("requests NowCast for the ladder's own DX target, not the map's unrelated target", () => {
    useProfileStore.setState({
      savedTargets: [
        {
          id: "t1",
          name: "Tokyo",
          lat: 35.68,
          lon: 139.69,
          grid: "PM95",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    mocks.verdicts.mockReturnValue({
      bands,
      ready: true,
      scope: { id: "dx:EM-PM", label: "DX · EM→PM", type: "dx" },
      activityScope: { type: "dx", homeField: "EM", targetField: "PM" },
    });
    // The map's own target points somewhere else entirely -- the request
    // must ignore it and use the ladder's own saved DX target instead.
    mocks.target.mockReturnValue({ lat: -10, lon: -10, grid: "ZZ00" });

    render(<BestBandReport open onClose={vi.fn()} />);

    expect(mocks.nowCast).toHaveBeenCalled();
    const call = mocks.nowCast.mock.calls[0][0] as { target: unknown };
    expect(call.target).toEqual({ grid: "PM95", lat: 35.68, lon: 139.69 });
  });
});
