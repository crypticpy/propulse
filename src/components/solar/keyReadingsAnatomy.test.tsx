import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WidgetShell } from "./WidgetShell";
import { SolarMiniChart } from "./SolarMiniChart";
import { MetricValue } from "@/pages/SolarPulse";
import type { SolarChartPoint } from "./SolarSeriesChart";

/**
 * DS-04: the four Solar Pulse key-readings cards (Kp, SFI, Bz, X-ray) must
 * keep the same card anatomy — header, hero, a fixed two-line note slot, a
 * plot area with the same floor, footer — no matter how much note text a
 * metric/state combination produces, whether the card is stale/delayed, and
 * whether its feed has enough points to draw. These tests exercise that
 * anatomy directly through WidgetShell + MetricValue + SolarMiniChart (the
 * same pieces SolarPulse.tsx composes for the key-readings grid) without
 * standing up the whole page and its data hooks. The last block guards the
 * other direction: the shared pieces must keep their full text when they are
 * used outside the key-readings grid.
 */
const POINTS: SolarChartPoint[] = [
  { timestamp: "2026-09-05T09:00:00Z", value: 3, kind: "observed" },
  { timestamp: "2026-09-05T12:00:00Z", value: 5, kind: "observed" },
];

function KeyReadingCard({
  title,
  state,
  note,
  points = POINTS,
}: {
  title: string;
  state: "fresh" | "stale" | "partial";
  note: string;
  points?: SolarChartPoint[];
}) {
  return (
    <WidgetShell compact title={title} state={state} action={<button type="button">Explain</button>}>
      <MetricValue keyReading value="3.2" unit="Kp" note={note} tone="cyan" />
      <SolarMiniChart
        label={`Recent ${title} intervals`}
        points={points}
        unit="Kp"
        min={0}
        max={9}
        intervalMs={10_800_000}
        maxGapMs={10_800_000}
        minPlotHeight={96}
      />
    </WidgetShell>
  );
}

const SHORT_NOTE = "Storm-range readings can signal disruption on high-latitude HF paths.";
const LONG_NOTE =
  "Measures geomagnetic disturbance over three hours. Storm-range readings can signal disruption on high-latitude HF paths, especially near the auroral oval where absorption and D-layer effects compound quickly.";

describe("Solar Pulse key-readings card anatomy (DS-04)", () => {
  it.each([
    ["short note", SHORT_NOTE],
    ["long note", LONG_NOTE],
  ])("reserves a fixed two-line note slot regardless of note length (%s)", (_label, note) => {
    const { container } = render(<KeyReadingCard title="Planetary Kp" state="fresh" note={note} />);
    const notePara = screen.getByText(note, { exact: false });
    expect(notePara.className).toContain("line-clamp-2");
    expect(notePara.className).toContain("min-h-12");
    // The hero value never wraps or gets pushed by the note.
    const hero = container.querySelector("p.whitespace-nowrap");
    expect(hero).not.toBeNull();
    expect(hero?.textContent).toContain("3.2");
  });

  it.each(["fresh", "stale", "partial"] as const)(
    "gives the plot the same 96px floor in every state (%s)",
    (state) => {
      const { container } = render(<KeyReadingCard title="Planetary Kp" state={state} note={SHORT_NOTE} />);
      const plot = container.querySelector("svg");
      expect(plot).not.toBeNull();
      expect(plot?.style.minHeight).toBe("96px");
      // The plot keeps its own aspect ratio: no fixed height that would make
      // preserveAspectRatio letterbox the drawing inside the card.
      expect(plot?.style.height).toBe("");
      expect(plot?.getAttribute("viewBox")).toBe("0 0 300 88");
    },
  );

  it("reserves the same plot slot when a feed has too few points to draw", () => {
    const { container } = render(
      <KeyReadingCard title="Planetary Kp" state="fresh" note={SHORT_NOTE} points={[]} />,
    );
    expect(container.querySelector("svg")).toBeNull();
    const figure = container.querySelector("figure");
    expect(figure).not.toBeNull();
    // Same chrome as a drawn chart: caption, plot box, axis caption.
    expect(figure?.querySelector("figcaption")?.textContent).toContain("Recent Planetary Kp intervals");
    const placeholder = screen.getByText("Waiting for more readings.");
    expect(placeholder.style.minHeight).toBe("96px");
    expect(figure?.textContent).toContain("Kp · UTC");
  });

  it.each(["stale", "partial"] as const)(
    "moves the %s notice off the hero flow: no banner precedes the hero, and the chip carries the notice",
    (state) => {
      const { container } = render(<KeyReadingCard title="Planetary Kp" state={state} note={SHORT_NOTE} />);

      // No visible banner sits between the header and the hero value: the
      // notice text only exists inside a visually-hidden (sr-only) node.
      const hiddenNotice = container.querySelector(".sr-only");
      expect(hiddenNotice).not.toBeNull();
      expect(hiddenNotice?.textContent).toMatch(
        state === "stale" ? /older than expected/i : /have not updated yet/i,
      );

      const body = container.querySelector("section > div.flex-1") as HTMLElement;
      expect(body).not.toBeNull();
      // The notice text never appears inside the body slot itself — the
      // body's first element is the hero/note block, not a notice banner.
      expect(within(body).queryByText(/older than expected|have not updated yet/i)).toBeNull();
      expect(body.firstElementChild?.querySelector("p.whitespace-nowrap")).not.toBeNull();

      // The chip is the visible cue (icon + word) and exposes the full
      // notice via `title` and `aria-describedby`.
      const chip = screen.getByRole("status");
      expect(chip.getAttribute("title")).toMatch(
        state === "stale" ? /older than expected/i : /have not updated yet/i,
      );
      const describedBy = chip.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy!)).toBe(hiddenNotice);

      // At most one short muted line survives in the footer slot.
      expect(screen.getByText("Delayed: waiting for fresh NOAA data")).not.toBeNull();
    },
  );

  it("renders no notice line and no sr-only chip description for a fresh card", () => {
    const { container } = render(<KeyReadingCard title="Planetary Kp" state="fresh" note={SHORT_NOTE} />);
    expect(container.querySelector(".sr-only")).toBeNull();
    expect(screen.queryByText("Delayed: waiting for fresh NOAA data")).toBeNull();
    expect(screen.getByRole("status").getAttribute("title")).toBeNull();
  });
});

describe("DS-04 anatomy stays opt-in for the other Solar Pulse cards", () => {
  it("keeps the full note visible for a non key-reading metric", () => {
    render(<MetricValue value="-42" unit="nT" note={LONG_NOTE} tone="cyan" />);
    const notePara = screen.getByText(LONG_NOTE, { exact: false });
    expect(notePara.className).not.toContain("line-clamp-2");
    expect(notePara.className).not.toContain("min-h-12");
  });

  it("keeps a non-compact shell's own stale reason visible instead of the NOAA summary", () => {
    render(
      <WidgetShell
        title="Recent CME analyses"
        state="stale"
        provider="NASA DONKI"
        staleMessage="No new DONKI analysis has arrived. The event set below is the last one published."
      >
        <p>3 events</p>
      </WidgetShell>,
    );
    const notice = screen.getByText(/No new DONKI analysis has arrived/i);
    expect(notice).not.toBeNull();
    expect(screen.queryByText("Delayed: waiting for fresh NOAA data")).toBeNull();
    // The visible line is what the chip points at — the reason is never
    // duplicated into a hidden node.
    expect(screen.getByRole("status").getAttribute("aria-describedby")).toBe(notice.id);
    expect(document.querySelector(".sr-only")).toBeNull();
  });

  it("leaves the mini chart's width-driven height alone when no floor is requested", () => {
    const { container } = render(
      <SolarMiniChart label="Recent solar flux" points={POINTS} unit="sfu" maxGapMs={129_600_000} />,
    );
    const plot = container.querySelector("svg");
    expect(plot?.style.minHeight).toBe("");
    expect(plot?.style.height).toBe("");
  });
});
