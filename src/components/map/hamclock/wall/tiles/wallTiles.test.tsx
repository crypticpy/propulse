import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReliabilityCell } from "@/lib/hamclock/reliabilityForecast";
import { useFt8DecoderStore } from "@/stores/ft8DecoderStore";
import { useRadioStore } from "@/stores/radioStore";
import { useSdrStore } from "@/stores/sdrStore";
import { AlertsTile } from "./AlertsTile";
import { EmcommTile } from "./EmcommTile";
import { ForecastMatrixTile } from "./ForecastMatrixTile";
import { MufTile } from "./MufTile";
import { ReliabilityTile } from "./ReliabilityTile";
import { SdrDecodesTile } from "./SdrDecodesTile";
import { SdrScopeTile } from "./SdrScopeTile";
import type { WallReliability } from "./useWallReliability";

const mocks = vi.hoisted(() => ({
  reliability: vi.fn(),
  alerts: vi.fn(),
  rim: vi.fn(),
  location: vi.fn(),
  sfi: vi.fn(),
}));

// Partial mock: the tiles get a scripted matrix, but the pure selectors
// (`wallBestBand`, `wallReliabilityScore`, `wallScoreTone`) stay real so the
// assertions below exercise the code that actually picks the hero.
vi.mock("./useWallReliability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useWallReliability")>()),
  useWallReliability: mocks.reliability,
}));
vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: mocks.alerts,
}));
vi.mock("@/hooks/useRIM", () => ({ useRIM: mocks.rim }));
vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/hooks/useMUFData", () => ({ useCurrentSFI: mocks.sfi }));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({ timeOffset: 0, absoluteTime: null }),
}));

/** Absolute UTC hour index the fixtures treat as "now" (2026-09-05 12Z). */
const NOW_INDEX = Date.UTC(2026, 8, 5, 12) / 3_600_000;
/** First hour the fixture matrix covers — 12 h before "now". */
const FIRST_INDEX = NOW_INDEX - 12;
/** Two UTC days of cells, the same span the hook now builds. */
const SPAN_HOURS = 48;

/**
 * A matrix where 20m is open all day and 10m only opens six hours out, so the
 * forecast tile has exactly one opening to find. Cells are keyed by absolute
 * UTC hour, matching `useWallReliability`.
 */
function buildCells(): Map<string, ReliabilityCell> {
  const cells = new Map<string, ReliabilityCell>();
  const put = (band: string, hourIndex: number, score: number) => {
    cells.set(`${band}:${hourIndex}`, {
      band: band as ReliabilityCell["band"],
      hour: ((hourIndex % 24) + 24) % 24,
      score,
      snrEstimate: 0,
      confidence: 50,
      status: "good",
    });
  };
  for (let i = 0; i < SPAN_HOURS; i++) {
    const hourIndex = FIRST_INDEX + i;
    put("80m", hourIndex, 30);
    put("40m", hourIndex, 60);
    put("20m", hourIndex, 88);
    put("17m", hourIndex, 40);
    put("15m", hourIndex, 10);
    put("10m", hourIndex, hourIndex === NOW_INDEX + 6 ? 90 : 10);
  }
  return cells;
}

function reliabilityState(over: Partial<WallReliability> = {}): WallReliability {
  return {
    status: "ready",
    cells: buildCells(),
    hour: 12,
    hourIndex: NOW_INDEX,
    targetLabel: "Tokyo",
    mode: "SSB",
    ...over,
  };
}

describe("wall forecast tiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reliability.mockReturnValue(reliabilityState());
    mocks.alerts.mockReturnValue({
      alerts: [],
      isLoading: false,
      error: null,
    });
    mocks.rim.mockReturnValue({ rimResult: null, isLoading: false });
    mocks.location.mockReturnValue({
      id: "home",
      name: "Austin",
      grid: "EM10dg",
      lat: 30.27,
      lon: -97.74,
      type: "home",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.sfi.mockReturnValue(140);
    useSdrStore.setState({
      lastFftFrame: null,
      lastFftFrameAt: null,
      fftEnabled: false,
    });
    useRadioStore.setState({ connectedDeviceId: null });
    useFt8DecoderStore.setState({
      decodes: [],
      enabled: false,
      stats: {
        totalDecodes: 0,
        cyclesCompleted: 0,
        lastCycleDecodes: 0,
        workerReady: false,
      },
    });
  });

  it("headlines the band that opens later in the day", () => {
    render(<ForecastMatrixTile />);
    // 10m is weak now and strong at +6h, so it wins over the steady 20m.
    expect(screen.getByText("10M")).toBeTruthy();
    expect(screen.getByText("OPENS")).toBeTruthy();
    expect(screen.getByText(/IN 6H/)).toBeTruthy();
  });

  it("falls back to a steady verdict when nothing opens", () => {
    const cells = buildCells();
    for (let i = 0; i < SPAN_HOURS; i++) {
      const hourIndex = FIRST_INDEX + i;
      cells.set(`10m:${hourIndex}`, {
        band: "10m",
        hour: ((hourIndex % 24) + 24) % 24,
        score: 10,
        snrEstimate: 0,
        confidence: 50,
        status: "poor",
      });
    }
    mocks.reliability.mockReturnValue(reliabilityState({ cells }));
    render(<ForecastMatrixTile />);
    expect(screen.getByText("20M")).toBeTruthy();
    expect(screen.getByText("STEADY")).toBeTruthy();
  });

  it("explains a missing target instead of rendering an empty forecast", () => {
    mocks.reliability.mockReturnValue(
      reliabilityState({ status: "no-target", cells: new Map() }),
    );
    render(<ForecastMatrixTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/Pick a target on the map/)).toBeTruthy();
  });

  it("names the best band and its score on the reliability tile", () => {
    render(<ReliabilityTile />);
    expect(screen.getByText("20M")).toBeTruthy();
    expect(screen.getByText("88%")).toBeTruthy();
    expect(screen.getByText("TOKYO")).toBeTruthy();
  });

  it("says what is missing when space weather has not loaded", () => {
    mocks.reliability.mockReturnValue(
      reliabilityState({ status: "loading", cells: new Map() }),
    );
    render(<ReliabilityTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/Loading Kp and solar flux/)).toBeTruthy();
  });

  it("shows MUF in MHz with the top usable band", () => {
    render(<MufTile />);
    expect(screen.getByText("MHz")).toBeTruthy();
    expect(screen.getByText(/TOP BAND/)).toBeTruthy();
    expect(screen.getByText(/SFI 140/)).toBeTruthy();
  });

  it("names the highest band the MUF supports, not the legend bucket", () => {
    // Austin at 18Z on SFI 140 gives a ~19.9 MHz MUF. The MUF colour legend
    // calls that bucket "14-21 MHz (15m)", but 15m starts at 21.0 MHz, so the
    // highest band actually supported is 17m.
    vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
    const { unmount } = render(<MufTile />);
    expect(screen.getByText("19.9")).toBeTruthy();
    expect(screen.getByText("17M")).toBeTruthy();
    unmount();

    // Likewise at 06Z: a 8.9 MHz MUF sits in the "7-10 MHz (30m)" bucket, but
    // 30m starts at 10.1 MHz, so 40m is the top band.
    vi.setSystemTime(new Date("2026-09-05T06:00:00Z"));
    render(<MufTile />);
    expect(screen.getByText("40M")).toBeTruthy();
    vi.useRealTimers();
  });

  it("asks for an operating location when there is none", () => {
    mocks.location.mockReturnValue(null);
    render(<MufTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/Set an operating location/)).toBeTruthy();
  });
});

describe("wall emergency tiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.alerts.mockReturnValue({
      alerts: [],
      isLoading: false,
      error: null,
    });
    mocks.rim.mockReturnValue({ rimResult: null, isLoading: false });
  });

  it("reports only what the feed maps rather than sounding an all-clear", () => {
    render(<AlertsTile />);
    // Zone-based alerts arrive without geometry and are dropped upstream, so
    // an empty list cannot be claimed as ALL CLEAR.
    expect(screen.getByText("NONE")).toBeTruthy();
    expect(screen.getByText("NO MAPPED NWS ALERTS")).toBeTruthy();
    expect(screen.getByText("NWS · MAPPED ALERTS ONLY")).toBeTruthy();
    expect(screen.queryByText("ALL CLEAR")).toBeNull();
  });

  it("counts alerts and leads with the worst one", () => {
    mocks.alerts.mockReturnValue({
      alerts: [
        {
          id: "a",
          event: "Flood Advisory",
          headline: "Flood advisory",
          severity: "Minor",
          lat: 1,
          lon: 1,
          areaDesc: "Travis, TX",
          urgency: "Expected",
          certainty: "Likely",
          response: "",
          instruction: "",
          polygon: null,
        },
        {
          id: "b",
          event: "Tornado Warning",
          headline: "Tornado warning",
          severity: "Extreme",
          lat: 2,
          lon: 2,
          areaDesc: "Williamson, TX",
          urgency: "Immediate",
          certainty: "Observed",
          response: "",
          instruction: "",
          polygon: null,
        },
      ],
      isLoading: false,
      error: null,
    });
    render(<AlertsTile />);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("EXTREME")).toBeTruthy();
    expect(screen.getByText("Tornado Warning")).toBeTruthy();
  });

  it("says the alert feed is down rather than showing zero", () => {
    mocks.alerts.mockReturnValue({
      alerts: [],
      isLoading: false,
      error: new Error("boom"),
    });
    render(<AlertsTile />);
    expect(screen.getByText(/feed unreachable/)).toBeTruthy();
  });

  it("grades emcomm readiness and names the weakest sub-score", () => {
    mocks.rim.mockReturnValue({
      isLoading: false,
      rimResult: {
        regionId: "tx",
        composite: 71,
        hfBand: {
          value: 42,
          label: "HF Bands",
          trend: "down",
          dataAvailable: true,
        },
        vhfUhf: {
          value: 88,
          label: "VHF/UHF",
          trend: "stable",
          dataAvailable: true,
        },
        infraRisk: {
          value: 90,
          label: "Infrastructure",
          trend: "up",
          dataAvailable: true,
        },
        emcommReadiness: {
          value: 78,
          label: "EmComm",
          trend: "stable",
          dataAvailable: true,
        },
        updatedAt: 0,
      },
    });
    render(<EmcommTile />);
    expect(screen.getByText("78")).toBeTruthy();
    expect(screen.getByText("GOOD")).toBeTruthy();
    expect(screen.getByText("WEAKEST HF BANDS 42")).toBeTruthy();
  });

  it("says readiness is still computing rather than showing a zero score", () => {
    mocks.rim.mockReturnValue({ rimResult: null, isLoading: true });
    render(<EmcommTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/Computing readiness/)).toBeTruthy();
  });
});

/** A usable FFT frame; only its arrival time varies between tests. */
const FRAME = {
  kind: "fft" as const,
  devIdx: 0,
  centerHz: 14_074_000,
  spanHz: 96_000,
  bins: Float32Array.from({ length: 128 }, (_, i) => -110 + i),
};

describe("wall SDR tiles", () => {
  beforeEach(() => {
    useSdrStore.setState({
      lastFftFrame: null,
      lastFftFrameAt: null,
      fftEnabled: false,
    });
    useRadioStore.setState({ connectedDeviceId: null });
    useFt8DecoderStore.setState({
      decodes: [],
      enabled: false,
      stats: {
        totalDecodes: 0,
        cyclesCompleted: 0,
        lastCycleDecodes: 0,
        workerReady: false,
      },
    });
  });

  it("offers a hint instead of an empty scope when no receiver is attached", () => {
    render(<SdrScopeTile />);
    expect(screen.getByText("NO RECEIVER")).toBeTruthy();
    expect(screen.getByText(/Connect the bridge/)).toBeTruthy();
  });

  it("distinguishes a connected receiver with the spectrum switched off", () => {
    useRadioStore.setState({ connectedDeviceId: "dev-1" });
    render(<SdrScopeTile />);
    expect(screen.getByText("NO SIGNAL")).toBeTruthy();
    expect(screen.getByText(/turn on the spectrum/)).toBeTruthy();
  });

  it("draws the strip and headlines the centre frequency when frames arrive", () => {
    useRadioStore.setState({ connectedDeviceId: "dev-1" });
    useSdrStore.setState({
      fftEnabled: true,
      lastFftFrame: FRAME,
      lastFftFrameAt: Date.now(),
    });
    render(<SdrScopeTile />);
    expect(screen.getByText("14.074")).toBeTruthy();
    expect(screen.getByText(/SPAN/)).toBeTruthy();
    expect(document.querySelector(".hcf-scope path")).toBeTruthy();
    expect(screen.getByText("SDR · LIVE")).toBeTruthy();
  });

  it("stops calling a frozen frame live once the stream stalls", () => {
    useRadioStore.setState({ connectedDeviceId: "dev-1" });
    useSdrStore.setState({
      fftEnabled: true,
      lastFftFrame: FRAME,
      lastFftFrameAt: Date.now() - 30_000,
    });
    render(<SdrScopeTile />);
    expect(screen.queryByText("SDR · LIVE")).toBeNull();
    expect(screen.getByText("NO SIGNAL")).toBeTruthy();
    expect(screen.getByText(/Spectrum stalled/)).toBeTruthy();
  });

  it("drops back to NO RECEIVER when the radio disconnects mid-stream", () => {
    useSdrStore.setState({
      fftEnabled: true,
      lastFftFrame: FRAME,
      lastFftFrameAt: Date.now(),
    });
    render(<SdrScopeTile />);
    expect(screen.queryByText("SDR · LIVE")).toBeNull();
    expect(screen.getByText("NO RECEIVER")).toBeTruthy();
  });

  it("says where FT8 decoding actually happens rather than promising a toggle", () => {
    render(<SdrDecodesTile />);
    // The hero and the title's source note both read OFF.
    expect(document.querySelector(".hc-hero")?.textContent).toBe("OFF");
    // Nothing feeds the decoder store on /map, so the copy must not tell the
    // operator to flip a switch that would never reach this tile.
    expect(
      screen.getByText(
        "FT8 decoding runs in the SDR console; wall decodes arrive with the shared receiver.",
      ),
    ).toBeTruthy();
  });

  it("lists the latest decodes with callsign, grid and age", () => {
    useFt8DecoderStore.setState({
      enabled: true,
      stats: {
        totalDecodes: 42,
        cyclesCompleted: 7,
        lastCycleDecodes: 3,
        workerReady: true,
      },
      decodes: [
        {
          isNew: true,
          time: 0,
          epochMs: Date.now() - 5_000,
          snr: -12,
          deltaTime: 0.2,
          deltaFrequency: 1200,
          mode: "FT8",
          message: "CQ VP6G AC88",
          lowConfidence: false,
          callsign: "VP6G",
          grid: "AC88",
        },
      ],
    });
    render(<SdrDecodesTile />);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("VP6G")).toBeTruthy();
    expect(screen.getByText("-12")).toBeTruthy();
    expect(screen.getByText(/AC88/)).toBeTruthy();
  });
});
