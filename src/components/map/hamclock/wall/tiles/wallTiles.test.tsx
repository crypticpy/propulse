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
    selector({ timeOffset: 0 }),
}));

/**
 * A matrix where 20m is open all day and 10m only opens six hours out, so the
 * forecast tile has exactly one opening to find.
 */
function buildCells(): Map<string, ReliabilityCell> {
  const cells = new Map<string, ReliabilityCell>();
  const put = (band: string, hour: number, score: number) => {
    cells.set(`${band}:${hour}`, {
      band: band as ReliabilityCell["band"],
      hour,
      score,
      snrEstimate: 0,
      confidence: 50,
      status: "good",
    });
  };
  for (let hour = 0; hour < 24; hour++) {
    put("80m", hour, 30);
    put("40m", hour, 60);
    put("20m", hour, 88);
    put("17m", hour, 40);
    put("15m", hour, 10);
    put("10m", hour, hour === 18 ? 90 : 10);
  }
  return cells;
}

function reliabilityState(over: Partial<WallReliability> = {}): WallReliability {
  return {
    status: "ready",
    cells: buildCells(),
    hour: 12,
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
    useSdrStore.setState({ lastFftFrame: null, fftEnabled: false });
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
    for (let hour = 0; hour < 24; hour++) {
      cells.set(`10m:${hour}`, {
        band: "10m",
        hour,
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

  it("reads ALL CLEAR when no alerts are active", () => {
    render(<AlertsTile />);
    expect(screen.getByText("ALL CLEAR")).toBeTruthy();
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

describe("wall SDR tiles", () => {
  beforeEach(() => {
    useSdrStore.setState({ lastFftFrame: null, fftEnabled: false });
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
    useSdrStore.setState({
      fftEnabled: true,
      lastFftFrame: {
        kind: "fft",
        devIdx: 0,
        centerHz: 14_074_000,
        spanHz: 96_000,
        bins: Float32Array.from({ length: 128 }, (_, i) => -110 + i),
      },
    });
    render(<SdrScopeTile />);
    expect(screen.getByText("14.074")).toBeTruthy();
    expect(screen.getByText(/SPAN/)).toBeTruthy();
    expect(document.querySelector(".hcf-scope path")).toBeTruthy();
  });

  it("says the decoder is off rather than showing an empty decode list", () => {
    render(<SdrDecodesTile />);
    // The hero and the title's source note both read OFF.
    expect(document.querySelector(".hc-hero")?.textContent).toBe("OFF");
    expect(screen.getByText(/Turn on the FT8 decoder/)).toBeTruthy();
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
