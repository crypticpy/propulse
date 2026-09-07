import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolarOutlookBars, outlookKpToneClass } from "./SolarOutlookBars";
import type { SolarFluxOutlookPoint } from "@/lib/solar/dataTypes";

function day(date: string, predicted_flux: number, predicted_kp: number, predicted_planetary_a = 12): SolarFluxOutlookPoint {
  return { date, predicted_flux, predicted_planetary_a, predicted_kp };
}

describe("outlookKpToneClass", () => {
  it("maps quiet, active, and storm Kp tiers to green, amber, and red", () => {
    expect(outlookKpToneClass(0)).toBe("bg-su-success/80");
    expect(outlookKpToneClass(3)).toBe("bg-su-success/80");
    expect(outlookKpToneClass(4)).toBe("bg-su-warning/80");
    expect(outlookKpToneClass(5)).toBe("bg-su-danger/80");
    expect(outlookKpToneClass(8)).toBe("bg-su-danger/80");
  });
});

describe("SolarOutlookBars", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders one accessible column per outlook day, coloured by predicted Kp tier", () => {
    render(
      <SolarOutlookBars
        outlook={[
          day("2026-09-07T00:00:00Z", 100, 2),
          day("2026-09-08T00:00:00Z", 150, 4),
          day("2026-09-09T00:00:00Z", 200, 6),
        ]}
      />,
    );
    const bars = screen.getAllByRole("img");
    expect(bars).toHaveLength(3);
    expect(bars[0].className).toContain("bg-su-success/80");
    expect(bars[1].className).toContain("bg-su-warning/80");
    expect(bars[2].className).toContain("bg-su-danger/80");
    expect(bars[0].getAttribute("aria-label")).toBe("Sep 7 · Kp 2 · A 12 · flux 100 sfu");
    expect(bars[0].getAttribute("title")).toBe(bars[0].getAttribute("aria-label"));
  });

  it("scales bar height between the outlook's min and max flux, with a visible floor for the lowest bar", () => {
    render(
      <SolarOutlookBars
        outlook={[
          day("2026-09-07T00:00:00Z", 100, 2),
          day("2026-09-08T00:00:00Z", 200, 2),
        ]}
      />,
    );
    const [low, high] = screen.getAllByRole("img");
    expect(low.style.height).toBe("8%");
    expect(high.style.height).toBe("100%");
  });

  it("gives every bar full height when every day shares the same predicted flux", () => {
    render(
      <SolarOutlookBars
        outlook={[day("2026-09-07T00:00:00Z", 120, 1), day("2026-09-08T00:00:00Z", 120, 1)]}
      />,
    );
    for (const bar of screen.getAllByRole("img")) expect(bar.style.height).toBe("100%");
  });

  it("marks the current UTC day and shows min/max flux labels plus the legend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
    render(
      <SolarOutlookBars
        outlook={[
          day("2026-09-07T00:00:00Z", 90, 1),
          day("2026-09-08T00:00:00Z", 140, 3),
          day("2026-09-09T00:00:00Z", 110, 2),
        ]}
      />,
    );
    const bars = screen.getAllByRole("img");
    expect(bars[0].className).not.toContain("outline-su-accent");
    expect(bars[1].className).toContain("outline-su-accent");
    expect(bars[2].className).not.toContain("outline-su-accent");
    expect(screen.getByText("140 sfu")).toBeTruthy();
    expect(screen.getByText("90 sfu")).toBeTruthy();
    expect(screen.getByText("Bar height = predicted flux (sfu); colour = predicted Kp tier.")).toBeTruthy();
  });

  it("labels the day-of-month under each column and the month where it changes", () => {
    render(
      <SolarOutlookBars
        outlook={[day("2026-08-31T00:00:00Z", 100, 1), day("2026-09-01T00:00:00Z", 100, 1)]}
      />,
    );
    expect(screen.getByText("Aug 31")).toBeTruthy();
    expect(screen.getByText("Sep 1")).toBeTruthy();
  });

  it("renders nothing for an empty outlook", () => {
    const { container } = render(<SolarOutlookBars outlook={[]} />);
    expect(within(container).queryByRole("img")).toBeNull();
  });
});
