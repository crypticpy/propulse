import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GreyLineReport } from "./GreyLineReport";
import { SunReport } from "./SunReport";

const mocks = vi.hoisted(() => ({
  location: vi.fn(),
  target: vi.fn(),
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: mocks.location,
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: { target: unknown }) => unknown) =>
    selector({ target: mocks.target() }),
}));

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
    // The chart's sr-only twin lists all 24 hourly samples.
    const table = within(dialog).getByRole("table", {
      name: /sun elevation and azimuth/i,
    });
    expect(within(table).getAllByRole("row")).toHaveLength(25); // header + 24
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

describe("GreyLineReport", () => {
  it("shows the idle state when no QTH is set", () => {
    mocks.location.mockReturnValue(null);
    render(<GreyLineReport open onClose={vi.fn()} />);
    expect(verdictText(screen.getByRole("dialog"))).toBe("NO QTH");
  });

  it("reads NO TARGET SET when no DX target is chosen", () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const facts = factRows(screen.getByRole("dialog"));
    expect(
      facts.some(
        (row) =>
          row?.startsWith("TARGET OVERLAP") && row.includes("NO TARGET SET"),
      ),
    ).toBe(true);
  });

  it("lists the 160/80/40 m tiers and draws the intensity chart for an ordinary approach to sunset", () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    // Both the fact list and the "Low bands" body box show 160M/80M/40M;
    // scope to the body box's <dt> labels to avoid matching both.
    const tierLabels = Array.from(dialog.querySelectorAll(".hcr-kv dt")).map(
      (dt) => dt.textContent,
    );
    expect(tierLabels).toContain("160M");
    expect(tierLabels).toContain("80M");
    expect(tierLabels).toContain("40M");
    expect(
      within(dialog).getByText("GREY-LINE INTENSITY — 24 H · COMPUTED AT QTH"),
    ).toBeTruthy();
  });

  it("marks the mutual overlap window active when a nearby DX target's terminator window coincides", () => {
    mocks.target.mockReturnValue(NEAR_TARGET);
    // Inside the verified 2026-09-06T00:20:58Z-01:00:59Z overlap window.
    vi.setSystemTime(new Date("2026-09-06T00:30:00Z"));
    render(<GreyLineReport open onClose={vi.fn()} />);
    const facts = factRows(screen.getByRole("dialog"));
    expect(
      facts.some(
        (row) =>
          row?.startsWith("TARGET OVERLAP") && row.includes("ACTIVE NOW"),
      ),
    ).toBe(true);
  });

  it("closes the report from SHOW TERMINATOR, revealing the map behind it", async () => {
    vi.setSystemTime(new Date("2026-09-05T13:14:00Z"));
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    render(<GreyLineReport open onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "SHOW TERMINATOR" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
