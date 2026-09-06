import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolarReport } from "./SolarReport";
import { XrayReport } from "./XrayReport";
import { SolarWindReport } from "./SolarWindReport";

const mocks = vi.hoisted(() => ({
  solar: vi.fn(),
  fluxOutlook: vi.fn(),
  xray24h: vi.fn(),
  probabilities: vi.fn(),
  magnetometer24h: vi.fn(),
  drap: vi.fn(),
  dst: vi.fn(),
  cme: vi.fn(),
  protonFlux: vi.fn(),
  toggleLayer: vi.fn(),
}));

/** `useSolarResource` hands back the validated envelope, not a bare payload. */
function envelope<T>(data: T, observedAt = "2026-09-05T13:00:00Z") {
  return {
    data: { envelope: { data, observedAt } },
    isError: false,
    isPending: false,
  };
}

const EMPTY_RESOURCE = { data: undefined, isError: false, isPending: true };
/** Shape `projectSolarResource` hands the non-Solar-Pulse hooks: `data` is
 * already the transformed value, not wrapped in an envelope. */
function projected<T>(
  data: T,
  dataUpdatedAt = Date.parse("2026-09-05T13:00:00Z"),
) {
  return {
    data,
    dataUpdatedAt,
    isError: false,
    isPending: false,
    isFetching: false,
  };
}
const EMPTY_PROJECTED = {
  data: undefined,
  dataUpdatedAt: 0,
  isError: false,
  isPending: true,
  isFetching: false,
};

vi.mock("@/hooks/useSolarResource", () => ({
  useSolarResource: (sourceId: string) => mocks.solar(sourceId),
}));
vi.mock("@/hooks/useSolarData", () => ({
  useFluxOutlook: () => mocks.fluxOutlook(),
  useXray24h: () => mocks.xray24h(),
  useProbabilities: () => mocks.probabilities(),
  useMagnetometer24h: () => mocks.magnetometer24h(),
}));
vi.mock("@/hooks/useSolarExpanded", () => ({
  useDRAPData: () => mocks.drap(),
  useDstIndex: () => mocks.dst(),
  useCMEAnalysis: () => mocks.cme(),
  useProtonFlux: () => mocks.protonFlux(),
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      layers: { aurora: false, drap: false },
      toggleLayer: mocks.toggleLayer,
    }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-09-05T13:00:00Z"));
  mocks.solar.mockReturnValue(EMPTY_RESOURCE);
  mocks.fluxOutlook.mockReturnValue(projected(undefined));
  mocks.xray24h.mockReturnValue(EMPTY_PROJECTED);
  mocks.probabilities.mockReturnValue(EMPTY_PROJECTED);
  mocks.magnetometer24h.mockReturnValue(EMPTY_PROJECTED);
  mocks.drap.mockReturnValue(EMPTY_PROJECTED);
  mocks.dst.mockReturnValue(EMPTY_PROJECTED);
  mocks.cme.mockReturnValue(EMPTY_PROJECTED);
  mocks.protonFlux.mockReturnValue(EMPTY_PROJECTED);
});

describe("SolarReport", () => {
  it("draws the NOW tab hero from the latest observed flux", () => {
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "noaa-solar-flux") {
        return envelope([
          {
            time_tag: "2026-09-05T12:00:00Z",
            flux: 142,
            frequency: 2800,
            schedule: null,
          },
        ]);
      }
      if (sourceId === "noaa-sunspots") {
        return envelope([{ time_tag: "2026-08", ssn: 120 }]);
      }
      return EMPTY_RESOURCE;
    });

    render(<SolarReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toContain("142");
    expect(screen.getByText("SFI")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "NOW" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "CYCLE" })).toBeTruthy();
  });

  it("switches to the CYCLE tab and draws the curated Cycle 25 reference", async () => {
    const user = userEvent.setup();
    render(<SolarReport open onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "CYCLE" }));

    expect(screen.getByText(/Curated Cycle 25 reference/)).toBeTruthy();
  });

  it("extends the CYCLE chart past the live rows with the curated Cycle 25 reference", async () => {
    const user = userEvent.setup();
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "noaa-sunspots") {
        return envelope([
          { time_tag: "2026-06", ssn: 150 },
          { time_tag: "2026-07", ssn: 145 },
          { time_tag: "2026-08", ssn: 140 },
        ]);
      }
      return EMPTY_RESOURCE;
    });

    render(<SolarReport open onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "CYCLE" }));

    // 26 curated Cycle 25 rows (Dec 2019 – Jan 2026) plus the 3 live NOAA
    // rows mocked above — well beyond the 3 live rows alone.
    const chart = screen.getByRole("img", { name: /SSN — CYCLE 25/ });
    expect(chart.getAttribute("aria-label")).toContain("29 records");
    const dialog = screen.getByRole("dialog");
    expect(
      dialog.querySelectorAll('[data-kind="estimated"]').length,
    ).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('[data-kind="observed"]').length).toBe(3);
  });
});

describe("XrayReport", () => {
  it("shows the current class as the hero and marks a quiet 24h with no flares above B", () => {
    mocks.xray24h.mockReturnValue(
      projected([
        {
          time_tag: "2026-09-05T12:00:00Z",
          flux: 3e-8,
          energy: "0.1-0.8nm",
          satellite: 16,
        },
      ]),
    );

    render(<XrayReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toContain("A");
    expect(screen.getByText("NO FLARES ABOVE B IN 24H")).toBeTruthy();
  });

  it("marks the latest classified flare on the FLUX chart when it falls in the 24h window", () => {
    mocks.xray24h.mockReturnValue(
      projected([
        {
          time_tag: "2026-09-05T11:00:00Z",
          flux: 3e-8,
          energy: "0.1-0.8nm",
          satellite: 16,
        },
        {
          time_tag: "2026-09-05T12:00:00Z",
          flux: 3e-8,
          energy: "0.1-0.8nm",
          satellite: 16,
        },
      ]),
    );
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "swpc-xray-latest") {
        return envelope({
          time_tag: "2026-09-05T11:30:00Z",
          current_class: "M2.1",
          max_class: "M2.1",
          begin_time: "2026-09-05T11:20:00Z",
          max_time: "2026-09-05T11:30:00Z",
          end_time: "2026-09-05T11:40:00Z",
        });
      }
      return EMPTY_RESOURCE;
    });

    render(<XrayReport open onClose={vi.fn()} />);

    expect(
      screen
        .getByRole("img", { name: /X-RAY FLUX/ })
        .getAttribute("aria-label"),
    ).toContain("Marker: M2.1 at 2026-09-05T11:30:00.000Z.");
  });

  it("draws no flare marker when the latest-flare feed is empty", () => {
    mocks.xray24h.mockReturnValue(
      projected([
        {
          time_tag: "2026-09-05T12:00:00Z",
          flux: 3e-8,
          energy: "0.1-0.8nm",
          satellite: 16,
        },
      ]),
    );

    render(<XrayReport open onClose={vi.fn()} />);

    expect(
      screen
        .getByRole("img", { name: /X-RAY FLUX/ })
        .getAttribute("aria-label"),
    ).not.toContain("Marker:");
  });

  it("reads MAJOR FLARE from an X-class current reading", () => {
    mocks.xray24h.mockReturnValue(
      projected([
        {
          time_tag: "2026-09-05T12:00:00Z",
          flux: 2e-4,
          energy: "0.1-0.8nm",
          satellite: 16,
        },
      ]),
    );

    render(<XrayReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-verdict")?.textContent).toBe(
      "MAJOR FLARE",
    );
    expect(dialog.querySelector(".hcr-hero")?.className).toContain("hc-bad");
  });

  it("shows the sr-only probability twin beside the decorative grid", async () => {
    const user = userEvent.setup();
    mocks.probabilities.mockReturnValue(
      projected({
        issue_time: "2026-09-05T12:30:00Z",
        c_prob: 60,
        m_prob: 15,
        x_prob: 1,
        proton_prob: 5,
      }),
    );

    render(<XrayReport open onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "PROBABILITIES" }));

    const table = screen
      .getByText("NOAA 1-day flare and proton-event probability")
      .closest("table");
    expect(table).toBeTruthy();
    expect(within(table as HTMLTableElement).getByText("60%")).toBeTruthy();
  });

  it("names the gap when NOAA has not issued a probability forecast", async () => {
    const user = userEvent.setup();
    render(<XrayReport open onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "PROBABILITIES" }));

    expect(screen.getByText("NO FORECAST ISSUED")).toBeTruthy();
  });

  it("toggles the D-RAP map layer from the ABSORPTION tab", async () => {
    const user = userEvent.setup();
    mocks.drap.mockReturnValue(
      projected({
        observation_time: "2026-09-05T12:30:00Z",
        forecast_time: "2026-09-05T12:30:00Z",
        frequencies: [
          [12, 18],
          [9, 22],
        ],
        latitudes: [0, 10],
        longitudes: [0, 10],
      }),
    );

    render(<XrayReport open onClose={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "ABSORPTION" }));
    await user.click(
      screen.getByRole("button", { name: /SHOW D-RAP ON MAP/i }),
    );

    expect(mocks.toggleLayer).toHaveBeenCalledWith("drap");
  });
});

describe("SolarWindReport", () => {
  it("uses the worse of Bz and wind-speed severity for the wind hero", () => {
    // Bz is northward (good), but the stream is high-speed (bad) — the
    // report must not paint the hero good just because Bz alone is quiet.
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "swpc-solar-wind-plasma") {
        return envelope([
          {
            time_tag: "2026-09-05T12:55:00Z",
            speed: 700,
            density: 3,
            temperature: 1,
          },
        ]);
      }
      return EMPTY_RESOURCE;
    });
    mocks.magnetometer24h.mockReturnValue(
      projected([
        { time_tag: "2026-09-05T12:55:00Z", bz_gsm: 2, by_gsm: 0, bt: 2 },
      ]),
    );

    render(<SolarWindReport open onClose={vi.fn()} />);

    expect(screen.getByText("HIGH SPEED")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.className).toContain("hc-bad");
    expect(dialog.querySelector(".hcr-hero")?.className).not.toContain(
      "hc-good",
    );
  });

  it("stays good when both Bz and wind speed are quiet", () => {
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "swpc-solar-wind-plasma") {
        return envelope([
          {
            time_tag: "2026-09-05T12:55:00Z",
            speed: 350,
            density: 3,
            temperature: 1,
          },
        ]);
      }
      return EMPTY_RESOURCE;
    });
    mocks.magnetometer24h.mockReturnValue(
      projected([
        { time_tag: "2026-09-05T12:55:00Z", bz_gsm: 1, by_gsm: 0, bt: 1 },
      ]),
    );

    render(<SolarWindReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.className).toContain("hc-good");
  });

  it("names the gap when DONKI has analysed no CMEs", async () => {
    const user = userEvent.setup();
    render(<SolarWindReport open onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "EVENTS" }));

    expect(screen.getByText("NONE ANALYSED IN 7 DAYS")).toBeTruthy();
  });

  it("toggles the aurora map layer from the GEOMAGNETIC tab", async () => {
    const user = userEvent.setup();
    render(<SolarWindReport open onClose={vi.fn()} />);

    await user.click(screen.getByRole("tab", { name: "GEOMAGNETIC" }));
    await user.click(
      screen.getByRole("button", { name: /SHOW AURORA ON MAP/i }),
    );

    expect(mocks.toggleLayer).toHaveBeenCalledWith("aurora");
  });

  it("shows one WIND chart at a time, picked by the Bz / speed / density buttons", async () => {
    const user = userEvent.setup();
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "swpc-solar-wind-plasma") {
        return envelope([
          {
            time_tag: "2026-09-05T11:00:00Z",
            speed: 420,
            density: 4.2,
            temperature: 1,
          },
          {
            time_tag: "2026-09-05T12:00:00Z",
            speed: 430,
            density: 4.5,
            temperature: 1,
          },
        ]);
      }
      return EMPTY_RESOURCE;
    });
    mocks.magnetometer24h.mockReturnValue(
      projected([
        { time_tag: "2026-09-05T11:00:00Z", bz_gsm: 1, by_gsm: 0, bt: 1 },
        { time_tag: "2026-09-05T12:00:00Z", bz_gsm: -2, by_gsm: 0, bt: 2 },
      ]),
    );

    // WIND is the default active tab.
    render(<SolarWindReport open onClose={vi.fn()} />);

    expect(screen.getByText("Bz — 24 H · ACE/DSCOVR AT L1")).toBeTruthy();
    expect(screen.queryByText("Speed — 24 H · ACE/DSCOVR AT L1")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "SPEED" }));
    const speedChart = screen.getByRole("img", { name: /^Speed — 24 H/ });
    expect(speedChart.getAttribute("aria-label")).toContain("2 records");
    expect(screen.queryByText("Bz — 24 H · ACE/DSCOVR AT L1")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "DENSITY" }));
    const densityChart = screen.getByRole("img", { name: /^Density — 24 H/ });
    expect(densityChart.getAttribute("aria-label")).toContain("2 records");
  });

  it("falls back to the planetary Kp reading when both L1 feeds are absent", () => {
    // Both `swpc-solar-wind-plasma` and the magnetometer default to empty in
    // beforeEach, so this only needs to supply a live Kp reading.
    mocks.solar.mockImplementation((sourceId: string) => {
      if (sourceId === "noaa-k-index") {
        return envelope([
          {
            time_tag: "2026-09-05T12:00:00Z",
            kp: 5.3,
            kind: "observed",
            noaa_scale: null,
            a_running: null,
          },
        ]);
      }
      return EMPTY_RESOURCE;
    });

    render(<SolarWindReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toContain("5.3");
    expect(screen.getByText("G1 STORM")).toBeTruthy();
    expect(screen.getByText(/L1 WIND FEED DOWN/)).toBeTruthy();
    expect(screen.getAllByText("L1 DOWN").length).toBeGreaterThan(0);
  });

  it("shows NO DATA only when Kp is also absent", () => {
    // Plasma, magnetometer, and Kp all default to empty in beforeEach.
    render(<SolarWindReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector(".hcr-hero")?.textContent).toBe("—");
    expect(screen.getByText("NO DATA")).toBeTruthy();
  });
});
