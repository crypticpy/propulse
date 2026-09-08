import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders the band as a heading with a summary and a right-hand action", () => {
    const { container } = render(
      <SectionHeader
        title="Local weather"
        summary="Temperature, wind, and the next few hours."
        as="h3"
        action={<span>Fresh</span>}
      />,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Local weather" });
    expect(heading.className).toContain("font-orbitron");
    expect(screen.getByText("Temperature, wind, and the next few hours.")).not.toBeNull();
    expect(screen.getByText("Fresh")).not.toBeNull();
    // The band carries the shared hover primitive, never a per-tone class.
    const band = container.firstElementChild!;
    expect(band.className).toContain("su-section-header");
    expect(band.className).toContain("min-h-16");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is a summary element when the panel is a details disclosure", () => {
    const { container } = render(
      <details>
        <SectionHeader element="summary" title="Your station" summary="Setup and log." />
      </details>,
    );
    expect(container.querySelector("summary.su-section-header")).not.toBeNull();
  });

  it("makes the whole band a toggle button with the accent glyph", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <SectionHeader
        title="Details and history"
        summary="Explore solar history"
        toggle={{ open: false, onToggle, controls: "details-content" }}
      />,
    );

    const button = screen.getByRole("button", { name: /Details and history/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("details-content");
    // No heading inside the button: the button's own name already announces it.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("+").className).toContain("su-section-glyph");

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(
      <SectionHeader
        title="Details and history"
        summary="Explore solar history"
        toggle={{ open: true, onToggle, controls: "details-content" }}
      />,
    );
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("−")).not.toBeNull();
  });

  it("omits the summary line and the action slot when nothing is passed", () => {
    const { container } = render(<SectionHeader title="Moon" />);
    const band = container.firstElementChild!;
    expect(band.children).toHaveLength(1);
    expect(band.firstElementChild!.children).toHaveLength(1);
  });

  it("adds the stack class only when layout='stack' is passed (issue #640)", () => {
    const { container: rowContainer } = render(
      <SectionHeader title="Local weather" summary="Temperature and wind." action={<span>Fresh</span>} />,
    );
    expect(rowContainer.firstElementChild!.className).not.toContain("su-section-header--stack");

    const { container: stackContainer } = render(
      <SectionHeader
        title="Local weather"
        summary="Temperature and wind."
        action={<span>Fresh</span>}
        layout="stack"
      />,
    );
    const stackBand = stackContainer.firstElementChild!;
    expect(stackBand.className).toContain("su-section-header--stack");
    // The action wrapper carries the CSS hook both the class and the
    // `.home-panel` container query in home.css target.
    expect(stackContainer.querySelector(".su-section-header__action")).not.toBeNull();
  });

  it("ignores layout='stack' on a toggle band: its markup stays pinned", () => {
    const onToggle = vi.fn();
    const { getByRole } = render(
      <SectionHeader
        title="Details and history"
        summary="Explore solar history"
        toggle={{ open: false, onToggle, controls: "details-content" }}
        layout="stack"
      />,
    );
    expect(getByRole("button").className).not.toContain("su-section-header--stack");
  });
});
