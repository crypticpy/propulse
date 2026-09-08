import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PropagationIndex } from "./PropagationIndex";

/**
 * #641: the category pill moves out of the content column and stacks
 * directly under the gauge (centred), and the "General HF context" heading
 * row no longer shares a row with the condition Badge — the badge gets its
 * own centred row beneath the heading. These tests assert the resulting DOM
 * structure (jsdom has no layout, so we check containment/siblings, not
 * pixels).
 */

const CATEGORY_PILL_LABELS = [
  "Strongly supportive",
  "Supportive",
  "Mixed",
  "Disrupted",
  "Severely disrupted",
];

describe("PropagationIndex layout (#641)", () => {
  it("stacks the category pill directly under the gauge, out of the content column", () => {
    const { container } = render(
      <PropagationIndex solarFlux={150} kIndex={3} bz={2} />,
    );

    const svg = container.querySelector('svg[viewBox="0 0 200 160"]');
    expect(svg).not.toBeNull();

    // Gauge SVG's own wrapper (`relative ... max-w-[200px] ...`), and the
    // new stack wrapper around gauge + pill.
    const gaugeWrapper = svg!.parentElement;
    expect(gaugeWrapper?.className).toContain("max-w-[200px]");
    // Clearance below the svg's overflow-visible tick labels (0/100, which
    // sit at y≈178.5-184 in the 200x160 viewBox) so the pill doesn't overlap
    // them (#644 review follow-up).
    expect(gaugeWrapper?.className).toContain("pb-6");
    const stack = gaugeWrapper!.parentElement;
    expect(stack).not.toBeNull();
    expect(stack?.className).toContain("flex-col");
    expect(stack?.className).toContain("items-center");

    const pillEl = CATEGORY_PILL_LABELS.map((label) =>
      screen.queryByText(label),
    ).find((el) => el !== null);
    expect(pillEl).toBeTruthy();

    // Pill is a direct sibling of the gauge wrapper inside the stack.
    expect(pillEl!.parentElement).toBe(stack);
    expect(stack?.contains(gaugeWrapper)).toBe(true);

    // The content column (description, breakdown, current values) no
    // longer contains the pill.
    const contentColumn = stack!.nextElementSibling as HTMLElement;
    expect(contentColumn).not.toBeNull();
    expect(contentColumn.className).toContain("flex-1");
    expect(contentColumn.contains(pillEl!)).toBe(false);
  });

  it("puts the condition badge in its own centred row beneath the General HF context heading", () => {
    const { container } = render(
      <PropagationIndex solarFlux={150} kIndex={3} bz={2} />,
    );

    const heading = screen.getByText("General HF context");
    const headingRow = heading.parentElement;
    expect(headingRow?.className).toContain("justify-between");

    // The badge (a span.rounded-full) is not in the heading row — it lives
    // in a distinct row directly after it.
    expect(headingRow?.querySelector("span.rounded-full")).toBeNull();

    const badgeRow = headingRow?.nextElementSibling as HTMLElement | null;
    expect(badgeRow).not.toBeNull();
    expect(badgeRow!.className).toContain("justify-center");

    const badgeEl = badgeRow!.querySelector("span.rounded-full");
    expect(badgeEl).not.toBeNull();
    expect(badgeEl!.parentElement).toBe(badgeRow);

    // Heading and badge are not siblings within one shared row.
    expect(heading.parentElement).not.toBe(badgeEl!.parentElement);

    // The summary paragraph still follows the badge row.
    const summaryEl = container.querySelector(
      "p.text-sm.text-su-muted.leading-relaxed.mb-3",
    );
    expect(summaryEl).not.toBeNull();
  });
});
