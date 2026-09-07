import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WidgetShell } from "./WidgetShell";
import { SolarMiniChart } from "./SolarMiniChart";
import { MetricValue } from "@/pages/SolarPulse";

/**
 * DS-04: the four Solar Pulse key-readings cards (Kp, SFI, Bz, X-ray) must
 * keep the same card anatomy — header, hero, a fixed two-line note slot, a
 * fixed 96px chart, footer — no matter how much note text a metric/state
 * combination produces, and no matter whether the card is stale/delayed.
 * These tests exercise that anatomy directly through WidgetShell +
 * MetricValue + SolarMiniChart (the same pieces SolarPulse.tsx composes for
 * the key-readings grid) without standing up the whole page and its data
 * hooks.
 */
function KeyReadingCard({
  title,
  state,
  note,
}: {
  title: string;
  state: "fresh" | "stale" | "partial";
  note: string;
}) {
  return (
    <WidgetShell compact title={title} state={state} action={<button type="button">Explain</button>}>
      <MetricValue value="3.2" unit="Kp" note={note} tone="cyan" />
      <SolarMiniChart
        label={`Recent ${title} intervals`}
        points={[
          { timestamp: "2026-09-05T09:00:00Z", value: 3, kind: "observed" },
          { timestamp: "2026-09-05T12:00:00Z", value: 5, kind: "observed" },
        ]}
        unit="Kp"
        min={0}
        max={9}
        intervalMs={10_800_000}
        maxGapMs={10_800_000}
        height={96}
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
    "gives the chart a fixed 96px height in every state (%s)",
    (state) => {
      const { container } = render(<KeyReadingCard title="Planetary Kp" state={state} note={SHORT_NOTE} />);
      const figure = container.querySelector("figure");
      expect(figure).not.toBeNull();
      expect(figure?.style.height).toBe("96px");
    },
  );

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
