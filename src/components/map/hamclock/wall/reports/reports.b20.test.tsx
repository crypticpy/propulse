import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSunCurve } from "@/lib/hamclock/sunCurve";
import { useMapStore } from "@/stores/mapStore";
import { GreyLineReport } from "./GreyLineReport";
import { SunReport } from "./SunReport";
import { SunTile } from "../tiles/SunTile";

const mocks = vi.hoisted(() => ({
  location: vi.fn(),
  target: vi.fn(),
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));

// A minimal stand-in for the real map store: `target` stays sourced from the
// `mocks.target()` spy so the existing per-test `mockReturnValue` calls keep
// working, while `layers`/`toggleLayer` are a tiny mutable fake so the B20
// fix#3 tests can both drive and assert the terminator layer flag the same
// way `useMapStore.getState()`/`setState()` do on the real store.
vi.mock("@/stores/mapStore", () => {
  let layers: Record<string, boolean> = { terminator: false };
  const toggleLayer = (key: string) => {
    layers = { ...layers, [key]: !layers[key] };
  };
  type FakeState = {
    target: unknown;
    layers: Record<string, boolean>;
    toggleLayer: (key: string) => void;
  };
  function useMapStore<T>(selector: (state: FakeState) => T): T {
    return selector({ target: mocks.target(), layers, toggleLayer });
  }
  useMapStore.getState = (): FakeState => ({
    target: mocks.target(),
    layers,
    toggleLayer,
  });
  useMapStore.setState = (
    partial:
      | { layers?: Record<string, boolean> }
      | ((state: FakeState) => { layers?: Record<string, boolean> }),
  ) => {
    const next =
      typeof partial === "function"
        ? partial({ target: mocks.target(), layers, toggleLayer })
        : partial;
    if (next.layers) layers = { ...layers, ...next.layers };
  };
  return { useMapStore };
});

/** Austin, TX — an ordinary mid-latitude QTH with an ordinary rise/set day. */
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

/** Well above the Arctic Circle in northern summer: the sun never sets. */
const POLAR_QTH = {
  ...AUSTIN,
  id: "polar",
  name: "Svalbard",
  grid: "JQ78",
  lat: 78,
  lon: 15,
};

/** Near 0° longitude, so local evening twilight lands well before UTC
 * midnight: used to see all six twilight bands in one 24 h UTC window
 * (Austin's own evening twilight falls just after UTC midnight, so its own
 * ordinary-day fixture only ever shows the three morning bands). */
const LONDON_QTH = {
  ...AUSTIN,
  id: "london",
  name: "London",
  grid: "IO91",
  lat: 51.5,
  lon: -0.1,
  timezone: "Europe/London",
};

/** 5 degrees of longitude east of Austin along the same parallel: verified
 * (see the probe backing `greyline.test.ts`'s NEAR_A/NEAR_B fixtures) to
 * put its sunset-side terminator window inside Austin's own on 2026-09-06,
 * from 00:20:58Z to 01:00:59Z — used to exercise a real mutual overlap. */
const NEAR_TARGET = { lat: 30.27, lon: -92.74, name: "Near", grid: "EM40" };

/** One row of `.hcr-facts`, as rendered: `"LABELvalue"` concatenated with no
 * separator. Matches the query pattern already used for facts elsewhere in
 * this report suite (see `reports.b9.test.tsx`). */
function factRows(dialog: HTMLElement): (string | null)[] {
  return Array.from(dialog.querySelectorAll(".hcr-facts > div")).map(
    (row) => row.textContent,
  );
}

function verdictText(dialog: HTMLElement): string | null {
  return dialog.querySelector(".hcr-verdict")?.textContent ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.location.mockReturnValue(AUSTIN);
  mocks.target.mockReturnValue(null);
});

describe("SunReport", () => {
  it("shows the idle state when no QTH is set", () => {
    mocks.location.mockReturnValue(null);
    render(<SunReport open onClose={vi.fn()} />);
    expect(verdictText(screen.getByRole("dialog"))).toBe("NO QTH");
  });

  it("names sunrise, solar noon and sunset with the twilight windows for an ordinary day", () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<SunReport open onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    const facts = factRows(dialog);
    expect(facts.some((row) => row?.startsWith("RISE"))).toBe(true);
    expect(facts.some((row) => row?.startsWith("NOON"))).toBe(true);
    expect(facts.some((row) => row?.startsWith("SET"))).toBe(true);
    // Mid-morning in Austin: the next event named in the verdict is sunset.
    expect(verdictText(dialog)).toBe("SUNSET");
    expect(within(dialog).getByText("CIVIL")).toBeTruthy();
    expect(within(dialog).getByText("NAUTICAL")).toBeTruthy();
    expect(within(dialog).getByText("ASTRONOMICAL")).toBeTruthy();
    expect(
      within(dialog).getByText("SUN ELEVATION — 24 H · COMPUTED AT QTH"),
    ).toBeTruthy();
    const elevationChart = dialog.querySelector(".hcr-chart");
    expect(elevationChart).toBeTruthy();
    expect(
      elevationChart!.querySelector(".hcr-chart-title")?.textContent,
    ).toMatch(/SUN ELEVATION/);
    expect(elevationChart!.querySelector("svg")).toBeTruthy();
    // Facts are one local clock per row, not "06:33 / 12:33Z" (#248).
    const riseFact = facts.find((row) => row?.startsWith("RISE"));
    expect(riseFact).toBeTruthy();
    expect(riseFact).not.toMatch(/\s\/\s/);
    // Six facts (#250): the day-length change moved into the Sun times box.
    expect(facts).toHaveLength(6);
    expect(facts.some((row) => row?.startsWith("CHANGE"))).toBe(false);
    expect(within(dialog).getByText("VS YESTERDAY")).toBeTruthy();
    expect(facts.some((row) => row?.startsWith("ELEV NOW"))).toBe(true);
    expect(facts.some((row) => row?.startsWith("AZ NOW"))).toBe(true);
    // The chart's sr-only twin lists all 24 hourly samples.
    const table = within(dialog).getByRole("table", {
      name: /sun elevation and azimuth/i,
    });
    expect(within(table).getAllByRole("row")).toHaveLength(25); // header + 24

    // Up to six shaded bands (morning + evening x civil/nautical/
    // astronomical); this fixture only shows the three morning ones, since
    // Austin's evening twilight instants fall just after UTC midnight, past
    // this chart's UTC calendar-day window -- that's fine, but no band may
    // span solar noon, which is exactly what the old single-rect-per-phase
    // bug did (each rectangle reached from dawn all the way to dusk).
    const bandEls = Array.from(dialog.querySelectorAll("[data-band]"));
    expect(bandEls).toHaveLength(3);
    expect(bandEls.map((el) => el.getAttribute("data-band")).sort()).toEqual([
      "astronomical-morning",
      "civil-morning",
      "nautical-morning",
    ]);
    const noon = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    ).noon!.getTime();
    for (const el of bandEls) {
      const start = new Date(el.getAttribute("data-start")!).getTime();
      const end = new Date(el.getAttribute("data-end")!).getTime();
      expect(noon >= start && noon < end).toBe(false);
    }
  });

  it("shades all six morning-and-evening twilight bands when both fall inside the same UTC day, and none spans solar noon", () => {
    mocks.location.mockReturnValue(LONDON_QTH);
    const now = new Date("2026-09-05T10:00:00Z");
    vi.setSystemTime(now);
    render(<SunReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    const bandEls = Array.from(dialog.querySelectorAll("[data-band]"));
    expect(bandEls.map((el) => el.getAttribute("data-band")).sort()).toEqual([
      "astronomical-evening",
      "astronomical-morning",
      "civil-evening",
      "civil-morning",
      "nautical-evening",
      "nautical-morning",
    ]);
    const noon = getSunCurve(
      LONDON_QTH.lat,
      LONDON_QTH.lon,
      now,
    ).noon!.getTime();
    for (const el of bandEls) {
      const start = new Date(el.getAttribute("data-start")!).getTime();
      const end = new Date(el.getAttribute("data-end")!).getTime();
      expect(noon >= start && noon < end).toBe(false);
    }
  });

  it("reports SUN DOES NOT SET through a polar day, with the elevation curve still drawn", () => {
    mocks.location.mockReturnValue(POLAR_QTH);
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    render(<SunReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(verdictText(dialog)).toBe("SUN DOES NOT SET");
    expect(
      within(dialog).getByText("SUN ELEVATION — 24 H · COMPUTED AT QTH"),
    ).toBeTruthy();
  });

  it("opens the grey line report from the SEE GREY LINE link", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<SunReport open onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "SEE GREY LINE" }));

    expect(
      await screen.findByRole("dialog", { name: /grey line report/i }),
    ).toBeTruthy();
  });
});

describe("SunTile", () => {
  it("stays reachable at a polar-day location, so the SUN DOES NOT SET report can still be opened (#243)", async () => {
    mocks.location.mockReturnValue(POLAR_QTH);
    vi.setSystemTime(new Date("2026-06-20T12:00:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<SunTile />);

    expect(screen.getByText("NO SUNSET")).toBeTruthy();
    const trigger = screen.getByRole("button", {
      name: /open the sun report/i,
    });

    await user.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: /sun report/i }),
    ).toBeTruthy();
  });
});

describe("GreyLineReport", () => {
  it("shows the idle state when no QTH is set", () => {
    mocks.location.mockReturnValue(null);
    render(<GreyLineReport open onClose={vi.fn()} />);
    expect(verdictText(screen.getByRole("dialog"))).toBe("NO QTH");
  });

  it("reads NO TARGET when no DX target is chosen", () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const facts = factRows(screen.getByRole("dialog"));
    expect(
      facts.some(
        (row) => row?.startsWith("OVERLAP") && row.includes("NO TARGET"),
      ),
    ).toBe(true);
  });

  it("lists the 160/80/40 m tiers and draws the intensity chart for an ordinary approach to sunset", () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    // The "Low bands" body box carries the tiers (#250: not in the facts).
    const tierLabels = Array.from(dialog.querySelectorAll(".hcr-kv dt")).map(
      (dt) => dt.textContent,
    );
    expect(tierLabels).toContain("160M");
    expect(tierLabels).toContain("80M");
    expect(tierLabels).toContain("40M");
    expect(
      within(dialog).getByText("GREY-LINE INTENSITY — 24 H · COMPUTED AT QTH"),
    ).toBeTruthy();
    const intensityChart = dialog.querySelector(".hcr-chart");
    expect(intensityChart).toBeTruthy();
    expect(
      intensityChart!.querySelector(".hcr-chart-title")?.textContent,
    ).toMatch(/GREY-LINE INTENSITY/);
    expect(intensityChart!.querySelector("svg")).toBeTruthy();
  });

  it("marks the mutual overlap window active when a nearby DX target's terminator window coincides", () => {
    mocks.target.mockReturnValue(NEAR_TARGET);
    // Inside the verified 2026-09-06T00:20:58Z-01:00:59Z overlap window.
    vi.setSystemTime(new Date("2026-09-06T00:30:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const facts = factRows(screen.getByRole("dialog"));
    expect(
      facts.some(
        (row) => row?.startsWith("OVERLAP") && row.includes("ACTIVE NOW"),
      ),
    ).toBe(true);
  });

  it("shows NO GREY LINE TODAY at a polar-season boundary, even though yesterday had a sunset (#243)", () => {
    mocks.location.mockReturnValue(POLAR_QTH);
    // The last day with any sunrise/sunset at lat 78 before high summer's
    // unbroken polar day; today itself has neither. `getGreylineStatus`
    // still reports yesterday's sunset as `lastEventType`, which is exactly
    // the aggregate the report must not read this state from.
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    expect(verdictText(dialog)).toBe("NO GREY LINE TODAY");
    const facts = factRows(dialog);
    expect(
      facts.some((row) => row?.startsWith("START") && row.includes("—")),
    ).toBe(true);
    const tiers = Array.from(dialog.querySelectorAll(".hcr-kv dd")).map(
      (dd) => dd.textContent,
    );
    expect(tiers.every((t) => t?.includes("INACTIVE"))).toBe(true);
  });

  it("enables the terminator layer and closes the report from SHOW TERMINATOR", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    useMapStore.setState((state) => ({
      layers: { ...state.layers, terminator: false },
    }));
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    render(<GreyLineReport open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "SHOW TERMINATOR" }));

    expect(useMapStore.getState().layers.terminator).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes the whole report stack and still enables the terminator layer when SHOW TERMINATOR is used from a nested Grey line report", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    useMapStore.setState((state) => ({
      layers: { ...state.layers, terminator: false },
    }));
    const user = userEvent.setup({ delay: null });
    const onCloseSun = vi.fn();
    render(<SunReport open onClose={onCloseSun} />);

    await user.click(screen.getByRole("button", { name: "SEE GREY LINE" }));
    await screen.findByRole("dialog", { name: /grey line report/i });

    await user.click(screen.getByRole("button", { name: "SHOW TERMINATOR" }));

    expect(useMapStore.getState().layers.terminator).toBe(true);
    // The nested Grey line report unmounts (SunReport's own state)...
    expect(
      screen.queryByRole("dialog", { name: /grey line report/i }),
    ).toBeNull();
    // ...and it told the Sun report underneath to close too, rather than
    // leaving that as the thing revealed behind the nested dialog.
    expect(onCloseSun).toHaveBeenCalledTimes(1);
  });
});
