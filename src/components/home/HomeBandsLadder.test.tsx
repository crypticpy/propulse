import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { HomeBandsLadder } from "./HomeBandsLadder";
import { buildBandsLadder, LADDER_BANDS } from "@/lib/home/bandsLadder";
import type { BandActivityStatus } from "@/hooks/useBandActivity";
import type { LadderState } from "@/lib/verdict/ladder";

/** Drive the ladder's matchMedia breakpoint the way a real viewport would. */
function stubViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => {
      const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Number.NaN);
      return {
        matches: Number.isFinite(max) && width <= max,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    }),
  });
}

function status(
  band: string,
  overrides: Partial<BandActivityStatus> = {},
): BandActivityStatus {
  return {
    band,
    count60m: 0,
    obs20m: 0,
    reporters20m: 0,
    count10mRecent: 0,
    count10mPrior: 0,
    sourceCounts60m: {},
    modeObs20m: {},
    thresholds: null,
    median60m: null,
    sampleCount: null,
    level: null,
    trend: "steady",
    crowded: false,
    ...overrides,
  };
}

const STATUSES = [
  status("40m", {
    count60m: 960,
    obs20m: 509,
    reporters20m: 290,
    median60m: 600,
    sampleCount: 88,
    trend: "rising",
    modeObs20m: { digital: 431, cw: 60, phone: 18 },
  }),
  status("20m", {
    count60m: 500,
    obs20m: 323,
    reporters20m: 220,
    median60m: 500,
    sampleCount: 88,
    trend: "falling",
    modeObs20m: { digital: 268, phone: 55 },
  }),
];

const VERDICTS = new Map<string, LadderState>([
  ["40m", "hot"],
  ["20m", "verified"],
  ["80m", "closed"],
]);

function renderLadder(
  verdicts = VERDICTS,
  onSelectBand: (band: string) => void = () => {},
) {
  return render(
    <HomeBandsLadder
      rows={buildBandsLadder(STATUSES, verdicts)}
      stale={false}
      selectedBand={null}
      onSelectBand={onSelectBand}
    />,
  );
}

it("lists every HF band once, 160 m first and 10 m last", () => {
  stubViewport(1920);
  renderLadder();
  const bands = screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByRole("button").textContent);
  expect(bands).toEqual([...LADDER_BANDS]);
});

it("gives each row an accessible name carrying its verdict and its numbers", () => {
  stubViewport(1920);
  renderLadder();
  const row = screen.getByRole("row", { name: /^40m/ });
  expect(row.textContent).toContain("Hot");
  expect(row.textContent).toContain("1.6× typical");
  expect(row.textContent).toContain("509");
  expect(row.textContent).toContain("61.2%");
  expect(row.textContent).toContain("290");
  expect(row.textContent).toContain("Digital");
  expect(
    within(row).getByRole("img", {
      name: "100 percent of the busiest band",
    }),
  ).toBeTruthy();
  const quieter = screen.getByRole("row", { name: /^20m/ });
  expect(
    within(quieter).getByRole("img", {
      name: "63 percent of the busiest band",
    }),
  ).toBeTruthy();
  expect(quieter.textContent).toContain("38.8%");
});

it("maps the scored ladder states onto their tones and words", () => {
  stubViewport(1920);
  const { container } = renderLadder();
  const toneOf = (band: string) =>
    within(screen.getByRole("row", { name: new RegExp(`^${band}`) }))
      .getByText(/Hot|Verified Open|Stirring|Forecast|Closed|No verdict/)
      .getAttribute("data-tone");
  expect(toneOf("40m")).toBe("hot");
  expect(toneOf("20m")).toBe("success");
  expect(toneOf("80m")).toBe("muted");
  expect(container.querySelectorAll("[data-tone]").length).toBe(
    LADDER_BANDS.length,
  );
});

it("says No verdict, not a guess, when the ladder feed has nothing for a band", () => {
  stubViewport(1920);
  renderLadder(new Map());
  expect(screen.getAllByText("No verdict").length).toBe(LADDER_BANDS.length);
  expect(screen.queryByText("Closed")).toBeNull();
});

it("withholds the typical-count ratio without a trustworthy baseline", () => {
  stubViewport(1920);
  render(
    <HomeBandsLadder
      rows={buildBandsLadder(
        [status("20m", { count60m: 500, obs20m: 12, sampleCount: 3, median60m: 4 })],
        new Map(),
      )}
      stale={false}
      selectedBand={null}
      onSelectBand={() => {}}
    />,
  );
  expect(screen.queryByText(/× typical/)).toBeNull();
});

it("drops the trend column below 1440 px and keeps it above", () => {
  stubViewport(1920);
  const wide = renderLadder();
  expect(screen.getByRole("columnheader", { name: /Trend/ })).toBeTruthy();
  expect(screen.getByText("Rising")).toBeTruthy();
  expect(
    screen.getByText(/Trend: the last 10 minutes against the 10 before/),
  ).toBeTruthy();
  wide.unmount();

  stubViewport(1280);
  renderLadder();
  expect(screen.queryByRole("columnheader", { name: /Trend/ })).toBeNull();
  expect(screen.queryByText("Rising")).toBeNull();
  expect(
    screen.queryByText(/Trend: the last 10 minutes against the 10 before/),
  ).toBeNull();
});

it("dims the ladder and marks it stale when the snapshot is not current", () => {
  stubViewport(1920);
  const { container } = render(
    <HomeBandsLadder
      rows={buildBandsLadder(STATUSES, VERDICTS)}
      stale
      selectedBand={null}
      onSelectBand={() => {}}
    />,
  );
  expect(
    container.querySelector(".home-ladder")?.getAttribute("data-stale"),
  ).toBe("true");
});

it("opens nearby reports for the band that was clicked", async () => {
  stubViewport(1920);
  const onSelectBand = vi.fn();
  renderLadder(VERDICTS, onSelectBand);
  await userEvent.click(
    screen.getByRole("button", { name: "30m — open nearby reports" }),
  );
  expect(onSelectBand).toHaveBeenCalledWith("30m");
});
