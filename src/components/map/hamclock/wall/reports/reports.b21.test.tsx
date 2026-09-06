import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoonReport } from "./MoonReport";
import { MoonTile } from "../tiles/MoonTile";

const mocks = vi.hoisted(() => ({
  location: vi.fn(),
  target: vi.fn(),
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));

// A minimal stand-in for the real map store, matching the shape B20's
// report suite already uses: `target` sourced from the `mocks.target()`
// spy, plus a `setCenterLocation` spy so the SHOW SUB-LUNAR POINT button has
// something to call.
vi.mock("@/stores/mapStore", () => {
  const setCenterLocation = vi.fn();
  type FakeState = {
    target: unknown;
    setCenterLocation: typeof setCenterLocation;
  };
  function useMapStore<T>(selector: (state: FakeState) => T): T {
    return selector({ target: mocks.target(), setCenterLocation });
  }
  useMapStore.getState = (): FakeState => ({
    target: mocks.target(),
    setCenterLocation,
  });
  return { useMapStore };
});

/** Austin, TX — moon is well up (alt ~85 deg) at the ordinary fixture time
 * below, same QTH the B20 report suite uses. */
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

const TARGET = { lat: 35.68, lon: 139.69, name: "Tokyo", grid: "PM95" };

/** One row of `.hcr-facts`, as rendered: `"LABELvalue"` concatenated with no
 * separator (same query pattern as `reports.b20.test.tsx`). */
/** Opens the EME tab and returns its box's "LABELvalue" kv rows. */
async function emeRows(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
): Promise<string[]> {
  await user.click(within(dialog).getByRole("tab", { name: "EME" }));
  const box = Array.from(dialog.querySelectorAll(".hcr-box")).find((el) =>
    el.querySelector("h4")?.textContent?.startsWith("EME"),
  );
  if (!box) throw new Error("EME box not rendered");
  const dts = Array.from(box.querySelectorAll(".hcr-kv dt"));
  return dts.map(
    (dt) => `${dt.textContent}${dt.nextElementSibling?.textContent ?? ""}`,
  );
}

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

describe("MoonReport", () => {
  it("shows the idle state when no QTH is set", () => {
    mocks.location.mockReturnValue(null);
    render(<MoonReport open onClose={vi.fn()} />);
    expect(verdictText(screen.getByRole("dialog"))).toBe("NO QTH");
  });

  it("reads MOON UP with the up-time hero, six MOON facts and the EME box", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<MoonReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    expect(verdictText(dialog)).toBe("MOON UP");
    const facts = factRows(dialog);
    expect(facts).toHaveLength(6);
    expect(facts.some((row) => row?.startsWith("ILLUM"))).toBe(true);
    expect(facts.some((row) => row?.startsWith("DISTANCE"))).toBe(true);
    expect(facts.some((row) => row?.startsWith("DECL"))).toBe(true);
    // Moonrise/moonset are the next crossings, never a "—" for a calendar
    // day SunCalc leaves blank.
    expect(facts.find((row) => row?.startsWith("RISE"))).not.toContain("—");
    // The phase name heads the Moon box; the facts keep the illumination.
    expect(
      within(dialog).getByRole("heading", {
        name: /^(new moon|.*crescent|.*quarter|.*gibbous|full moon) · up$/i,
      }),
    ).toBeTruthy();
    const eme = await emeRows(dialog, user);
    expect(eme.some((row) => row.startsWith("PATH LOSS"))).toBe(true);
    expect(eme.some((row) => row.startsWith("DEGRADATION"))).toBe(true);
    expect(eme.some((row) => row.startsWith("SKY NOISE"))).toBe(true);
  });

  it("reads MOON DOWN with the time-to-moonrise hero when the Moon is below the horizon", async () => {
    // Verified: alt ~= -29.9 deg at Austin, TX at this instant.
    vi.setSystemTime(new Date("2026-09-05T02:00:00Z"));
    render(<MoonReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    expect(verdictText(dialog)).toBe("MOON DOWN");
    // The EME box stays available even while the Moon is down.
    const eme = await emeRows(dialog, userEvent.setup({ delay: null }));
    expect(eme.some((row) => row.startsWith("PATH LOSS"))).toBe(true);
    expect(eme.some((row) => row.startsWith("DEGRADATION"))).toBe(true);
  });

  it("reads NO TARGET SET in the mutual window row when no DX target is chosen", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<MoonReport open onClose={vi.fn()} />);
    const eme = await emeRows(
      screen.getByRole("dialog"),
      userEvent.setup({ delay: null }),
    );
    expect(
      eme.some(
        (row) =>
          row.startsWith("MUTUAL WINDOW") && row.includes("NO TARGET SET"),
      ),
    ).toBe(true);
  });

  it("computes a real mutual window row once a DX target is chosen", async () => {
    mocks.target.mockReturnValue(TARGET);
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<MoonReport open onClose={vi.fn()} />);
    const eme = await emeRows(
      screen.getByRole("dialog"),
      userEvent.setup({ delay: null }),
    );
    const row = eme.find((r) => r.startsWith("MUTUAL WINDOW"));
    expect(row).toBeTruthy();
    expect(row).not.toContain("NO TARGET SET");
  });

  it("switches between the MOON and EME tabs, each chart title inside its own .hcr-chart", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<MoonReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    const moonTitle = within(dialog).getByText(
      "MOON ELEVATION — 24 H · COMPUTED AT QTH",
    );
    expect(moonTitle).toBeTruthy();
    expect(moonTitle.closest(".hcr-chart")).not.toBeNull();

    await user.click(within(dialog).getByRole("tab", { name: "EME" }));

    const emeTitle = within(dialog).getByText(
      "EME DEGRADATION — 28 D · AT UTC MIDNIGHT",
    );
    expect(emeTitle).toBeTruthy();
    expect(emeTitle.closest(".hcr-chart")).not.toBeNull();
  });

  it("reads SKY NOISE from the Moon's galactic latitude, not its declination", async () => {
    // At this instant the Moon's galactic latitude is ~2.1 deg (near the
    // plane, |b| <= 10) while its declination is ~27.8 deg (which the old
    // declination-based proxy, |dec| >= 18, also called "near plane" -- but
    // would read "COLD SKY" against the new function's own 10 deg
    // threshold if `declinationDeg` were passed in by mistake instead of
    // `galacticLatitudeDeg`). Default band is 2m, so this is unambiguous.
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<MoonReport open onClose={vi.fn()} />);
    const eme = await emeRows(
      screen.getByRole("dialog"),
      userEvent.setup({ delay: null }),
    );
    const skyNoiseRow = eme.find((row) => row.startsWith("SKY NOISE"));
    expect(skyNoiseRow).toContain("GALACTIC PLANE");
    expect(skyNoiseRow).not.toContain("COLD SKY");
  });

  it("computes the 28-day EME chart's sky-noise term from galactic latitude, not declination", async () => {
    // The curve's day-0 sample is pinned to UTC midnight of the render
    // instant (2026-09-05T00:00:00Z), not `now` itself. At that instant,
    // combining the bistatic-radar-equation distance loss (topocentric
    // range) with the galactic-latitude sky penalty at 2m gives ~-8.3 dB;
    // the same formula fed the Moon's declination instead (the pre-fix
    // behaviour, which reads "COLD SKY" at this declination and so applies
    // no penalty) would give ~-0.5 dB -- the two are far enough apart that
    // only one can be what's rendered.
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<MoonReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    await user.click(within(dialog).getByRole("tab", { name: "EME" }));
    const table = within(dialog).getByRole("table", {
      name: /eme degradation/i,
    });
    const rows = within(table).getAllByRole("row");
    // rows[0] is the header row; rows[1] is day 0 (UTC midnight of `now`).
    const firstDataRow = within(rows[1]);
    expect(firstDataRow.getByText("−8.3 dB")).toBeTruthy();
    expect(firstDataRow.queryByText("−0.5 dB")).toBeNull();
  });

  it("changes the EME rows (path loss, Doppler, sky noise) when the band selector changes", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<MoonReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "EME" }));

    const emeBox = Array.from(dialog.querySelectorAll(".hcr-box")).find((box) =>
      box.querySelector("h4")?.textContent?.startsWith("EME"),
    );
    expect(emeBox).toBeTruthy();
    const emeKv = within(emeBox as HTMLElement);

    const pathLossBefore =
      emeKv.getByText("PATH LOSS").nextElementSibling?.textContent;
    const dopplerBefore =
      emeKv.getByText("DOPPLER").nextElementSibling?.textContent;
    const skyNoiseBefore =
      emeKv.getByText("SKY NOISE").nextElementSibling?.textContent;

    await user.click(within(dialog).getByRole("radio", { name: /23CM/i }));

    const pathLossAfter =
      emeKv.getByText("PATH LOSS").nextElementSibling?.textContent;
    const dopplerAfter =
      emeKv.getByText("DOPPLER").nextElementSibling?.textContent;
    const skyNoiseAfter =
      emeKv.getByText("SKY NOISE").nextElementSibling?.textContent;

    expect(pathLossAfter).not.toBe(pathLossBefore);
    expect(dopplerAfter).not.toBe(dopplerBefore);
    expect(skyNoiseAfter).not.toBe(skyNoiseBefore);
  });

  it("draws an sr-only table twin for both charts", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<MoonReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");

    expect(
      within(dialog).getByRole("table", { name: /moon elevation/i }),
    ).toBeTruthy();

    await user.click(within(dialog).getByRole("tab", { name: "EME" }));

    expect(
      within(dialog).getByRole("table", { name: /eme degradation/i }),
    ).toBeTruthy();
  });

  it("calls setCenterLocation and closes from SHOW SUB-LUNAR POINT", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    render(<MoonReport open onClose={onClose} />);
    const dialog = screen.getByRole("dialog");

    await user.click(
      within(dialog).getByRole("button", { name: "SHOW SUB-LUNAR POINT" }),
    );

    const { useMapStore } = await import("@/stores/mapStore");
    expect(useMapStore.getState().setCenterLocation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("MoonTile", () => {
  it("opens the Moon report from the tile", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    render(<MoonTile />);

    const trigger = screen.getByRole("button", {
      name: /open the moon report/i,
    });
    await user.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: /moon report/i }),
    ).toBeTruthy();
  });
});
