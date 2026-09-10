import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Ft8SpotterHUD } from "./Ft8SpotterHUD";

/**
 * #925 review round (Codex P2): the HUD's type moved onto `text-xs`/`text-sm`
 * so it follows Settings -> Text Size, but the box around it was still pinned
 * in px and clipped its own contents at the xl scale — `overflow-hidden` on a
 * 320px ceiling hides the right-hand mode pill and cycle timer exactly when
 * the enlarged text this change exists to serve is switched on.
 *
 * jsdom does not lay out, so measuring the overflow here would be theatre.
 * What is checkable, and what actually failed, is the box contract: the width
 * bounds have to be rem (they then scale with the root font size the same way
 * the type does) and the status row has to be allowed to wrap when a long
 * band plus a mode pill still will not share a line. Reverting either half of
 * the fix fails one of these.
 */

const BASE_PROPS = {
  cycleProgress: 0.4,
  totalDecodes: 128,
  uniqueStations: 42,
  currentBand: "20m",
  currentMode: "FT8",
  isNewCycle: false,
  currentCycleCount: 17,
};

function hudBox(container: HTMLElement): HTMLElement {
  const box = container.querySelector<HTMLElement>("[class*='min-w-']");
  expect(box, "HUD panel with a min-width bound not found").not.toBeNull();
  return box as HTMLElement;
}

describe("Ft8SpotterHUD scales its box with the text-size setting (#925)", () => {
  it("bounds the populated HUD in rem, not px", () => {
    const { container } = render(<Ft8SpotterHUD {...BASE_PROPS} />);
    const box = hudBox(container);
    expect(box.className).toContain("min-w-[17.5rem]");
    expect(box.className).toContain("max-w-[20rem]");
    expect(box.className).not.toMatch(/(?:min|max)-w-\[\d+px\]/);
  });

  it("bounds the empty state in rem too", () => {
    const { container } = render(
      <Ft8SpotterHUD
        {...BASE_PROPS}
        totalDecodes={0}
        currentCycleCount={0}
        currentBand={null}
        currentMode={null}
      />,
    );
    expect(screen.getByText(/waiting for ft8 decodes/i)).toBeTruthy();
    const box = hudBox(container);
    expect(box.className).toContain("min-w-[17.5rem]");
    expect(box.className).not.toMatch(/(?:min|max)-w-\[\d+px\]/);
  });

  it("lets the status row reflow instead of clipping its tail", () => {
    const { container } = render(
      <Ft8SpotterHUD {...BASE_PROPS} currentBand="160m" currentMode="FT4" />,
    );
    // The timer is the last item on the row — the one that gets clipped when
    // the row cannot wrap and the box cannot grow.
    const timer = screen.getByText(/^0:\d\d$/);
    const row = timer.closest("div");
    expect(row, "status row not found").not.toBeNull();
    expect((row as HTMLElement).className).toContain("flex-wrap");
    expect(container.textContent).toContain("160m");
    expect(container.textContent).toContain("FT4");
  });
});
