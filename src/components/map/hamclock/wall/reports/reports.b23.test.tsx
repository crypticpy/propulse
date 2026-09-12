import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RIMResult, RIMSubScore } from "@/types/atmos";
import { HAMCLOCK_WALL_PAGES } from "../pages";
import { WALL_TILES } from "../tiles";
import { RimTile } from "../tiles/RimTile";
import { RimReport } from "./RimReport";
import { useAtmosStore } from "@/stores/atmosStore";
import { useUserStore } from "@/stores/userStore";

const mocks = vi.hoisted(() => ({
  rim: vi.fn(),
  layers: { lightning: false, riverGauges: false },
}));

vi.mock("@/hooks/useRIM", () => ({
  useRIM: (focus?: { id: string }) => mocks.rim(focus),
}));

vi.mock("@/stores/mapStore", () => {
  const toggleLayer = (key: string) => {
    mocks.layers = {
      ...mocks.layers,
      [key]: !mocks.layers[key as keyof typeof mocks.layers],
    };
  };
  type FakeState = {
    layers: typeof mocks.layers;
    toggleLayer: (key: string) => void;
  };
  function useMapStore<T>(selector: (state: FakeState) => T): T {
    return selector({ layers: mocks.layers, toggleLayer });
  }
  useMapStore.getState = (): FakeState => ({
    layers: mocks.layers,
    toggleLayer,
  });
  return { useMapStore };
});

function sub(
  value: number,
  available: boolean,
  label: string,
  reason: string,
): RIMSubScore {
  return { value, label, trend: "stable", dataAvailable: available, reason };
}

function rimFixture(over: Partial<RIMResult> = {}): RIMResult {
  return {
    regionId: "home",
    composite: 62,
    hfBand: sub(70, true, "HF Bands", "Kp 2 is quiet and SFI 120."),
    vhfUhf: sub(
      40,
      true,
      "VHF/UHF",
      "Lightning at 80 km adds convective ducting.",
    ),
    infraRisk: sub(55, true, "Infrastructure", "Minor flood stage."),
    emcommReadiness: sub(
      78,
      true,
      "EmComm",
      "4 repeaters at 80% operational and NVIS is viable.",
    ),
    updatedAt: Date.parse("2026-09-10T12:00:00Z"),
    partial: false,
    excludedInputs: [],
    ...over,
  };
}

function rimReturn(over: Partial<RIMResult> = {}, focusId = "home") {
  const result = rimFixture({ regionId: focusId, ...over });
  return {
    rimResult: result,
    isLoading: false,
    history: [
      {
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        composite: 70,
        hf: 80,
        vhf: 50,
        infra: 60,
        emcomm: 70,
      },
      {
        timestamp: new Date().toISOString(),
        composite: result.composite,
        hf: result.hfBand.dataAvailable ? result.hfBand.value : null,
        vhf: result.vhfUhf.dataAvailable ? result.vhfUhf.value : null,
        infra: result.infraRisk.dataAvailable ? result.infraRisk.value : null,
        emcomm: result.emcommReadiness.dataAvailable
          ? result.emcommReadiness.value
          : null,
      },
    ],
    regionScores: [
      { region: { id: "home", name: "AUSTIN", lat: 30.27, lon: -97.74 }, result },
      {
        region: { id: "tokyo", name: "TOKYO", lat: 35.69, lon: 139.69 },
        result: rimFixture({ regionId: "tokyo", composite: 40 }),
      },
    ],
    nearestLightningKm: 80,
    lightningStrikeCount: 3,
    floodProximity: "minor" as const,
    floodActionCount: 2,
    repeaterCount: 4,
    operationalRepeaterRatio: 0.8,
    nvis: {
      nvisViable: true,
      recommendedBands: ["80m"],
      conditionSummary: "Good NVIS conditions",
    },
  };
}

function draw(node: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

function factRows(dialog: HTMLElement): string[] {
  return Array.from(dialog.querySelectorAll(".hcr-facts > div")).map(
    (row) => row.textContent ?? "",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.layers = { lightning: false, riverGauges: false };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ regions: [] }), { status: 200 }),
    ),
  );
  mocks.rim.mockImplementation((focus?: { id: string }) =>
    rimReturn(
      focus?.id === "tokyo" ? { composite: 40, regionId: "tokyo" } : {},
      focus?.id ?? "home",
    ),
  );
  useUserStore.setState({
    station: {
      callsign: "N0TEST",
      homeLocationId: "home",
      activeLocationId: null,
      savedLocations: [],
      grid: "EM10dg",
      lat: 30.27,
      lon: -97.74,
      name: "Austin",
    },
  });
  useAtmosStore.setState({
    monitoredRegions: [
      { id: "tokyo", name: "Tokyo", lat: 35.69, lon: 139.69, radiusKm: 200 },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RimTile", () => {
  it("heroes the composite and names the worst sub-score", () => {
    const { container } = draw(<RimTile />);
    expect(container.querySelector(".hc-hero")?.textContent).toBe("62");
    expect(screen.getAllByText("FAIR").length).toBeGreaterThan(0);
    expect(screen.getByText("WORST VHF/UHF 40")).toBeTruthy();
  });

  it("marks PARTIAL when a sub-score is excluded", () => {
    mocks.rim.mockReturnValue(
      rimReturn({
        partial: true,
        excludedInputs: ["VHF/UHF"],
        vhfUhf: sub(
          80,
          false,
          "VHF/UHF",
          "NO DATA — no weather alerts or lightning to score VHF/UHF.",
        ),
      }),
    );
    draw(<RimTile />);
    expect(screen.getAllByText("PARTIAL").length).toBeGreaterThan(0);
  });

  it("stays idle while the model is still computing", () => {
    mocks.rim.mockReturnValue({
      ...rimReturn(),
      rimResult: null,
      isLoading: true,
    });
    draw(<RimTile />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText(/Computing radio impact/)).toBeTruthy();
  });
});

describe("RimReport", () => {
  it("fills SCORE facts, names PARTIAL gaps, and explains a selected sub-score", async () => {
    mocks.rim.mockReturnValue(
      rimReturn({
        partial: true,
        excludedInputs: ["VHF/UHF"],
        vhfUhf: sub(
          80,
          false,
          "VHF/UHF",
          "NO DATA — no weather alerts or lightning to score VHF/UHF.",
        ),
      }),
    );
    const user = userEvent.setup({ delay: null });
    draw(<RimReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toMatch(
      /PARTIAL/,
    );
    const facts = factRows(dialog);
    expect(facts.find((row) => row.startsWith("COMPOSITE"))).toMatch(/PARTIAL/);
    expect(facts.find((row) => row.startsWith("VHF/UHF IMPACT"))).toContain(
      "NO DATA",
    );
    expect(facts.find((row) => row.startsWith("HF IMPACT"))).toContain("70.0");
    expect(facts.find((row) => row.startsWith("NVIS"))).toMatch(/VIABLE/);
    expect(screen.getByText("RIM COMPOSITE — 12 H · COMPUTED")).toBeTruthy();
    expect(dialog.querySelector("svg path[data-series='composite']")).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: /VHF\/UHF/ }));
    expect(
      screen.getByText(
        "NO DATA — no weather alerts or lightning to score VHF/UHF.",
      ),
    ).toBeTruthy();
  });

  it("toggles lightning and river-gauge layers from SCORE", async () => {
    const user = userEvent.setup({ delay: null });
    const { useMapStore } = await import("@/stores/mapStore");
    draw(<RimReport open onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "SHOW LIGHTNING" }));
    expect(useMapStore.getState().layers.lightning).toBe(true);
    await user.click(screen.getByRole("button", { name: "SHOW RIVER GAUGES" }));
    expect(useMapStore.getState().layers.riverGauges).toBe(true);
  });

  it("lists monitored regions and re-scopes the report to the selected one", async () => {
    const user = userEvent.setup({ delay: null });
    draw(<RimReport open onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "REGIONS" }));
    expect(screen.getByRole("button", { name: /AUSTIN|HOME/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /TOKYO/ }));
    expect(mocks.rim).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tokyo" }),
    );
    expect(screen.getByRole("dialog").querySelector(".hcr-hero")?.textContent).toBe(
      "40",
    );
  });
});

describe("Weather page registry (B23)", () => {
  it("places the RIM tile on the Weather page left rail", () => {
    const weather = HAMCLOCK_WALL_PAGES.find((page) => page.id === "weather");
    expect(weather?.left).toContain("rim");
    expect(WALL_TILES.rim.title).toBe("Radio impact");
    expect(weather?.right).not.toContain("rim");
  });
});
