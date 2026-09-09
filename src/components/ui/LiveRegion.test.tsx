import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveRegion } from "./LiveRegion";

describe("LiveRegion", () => {
  it("mounts the region with its role before content appears, and mutates the same node", () => {
    const { container, rerender } = render(
      <LiveRegion role="status">{null}</LiveRegion>,
    );

    const node = container.querySelector('[role="status"]');
    expect(node).not.toBeNull();
    expect(node?.textContent).toBe("");

    rerender(<LiveRegion role="status">Feed added.</LiveRegion>);

    // Same DOM node identity — a mutation the screen reader was already
    // watching, not a fresh node that appears with the text pre-filled.
    expect(container.querySelector('[role="status"]')).toBe(node);
    expect(node?.textContent).toBe("Feed added.");
  });

  it("uses aria-live=assertive for role=alert and polite for the status default", () => {
    const { container: alertContainer } = render(
      <LiveRegion role="alert">Duplicate contact detected</LiveRegion>,
    );
    expect(alertContainer.querySelector('[role="alert"]')?.getAttribute("aria-live")).toBe(
      "assertive",
    );

    const { container: statusContainer } = render(<LiveRegion>Saved.</LiveRegion>);
    expect(statusContainer.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe(
      "polite",
    );
  });

  it("renders visually hidden with no layout when empty, and visible once content lands", () => {
    const { container, rerender } = render(
      <LiveRegion role="status" className="hcc-row-caveat">
        {null}
      </LiveRegion>,
    );

    let node = container.querySelector('[role="status"]');
    expect(node?.className).toContain("sr-only");
    expect(node?.className).not.toContain("hcc-row-caveat");

    rerender(
      <LiveRegion role="status" className="hcc-row-caveat">
        Regional data unavailable.
      </LiveRegion>,
    );

    node = container.querySelector('[role="status"]');
    expect(node?.className).toContain("hcc-row-caveat");
    expect(node?.className).not.toContain("sr-only");
  });

  it("supports an alternate host element via `as`", () => {
    const { container } = render(
      <LiveRegion as="p" role="status" className="hcc-row-caveat">
        Text
      </LiveRegion>,
    );
    expect(container.querySelector("p[role=status]")).not.toBeNull();
  });
});
