import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SolarDisclosure } from "./SolarDisclosure";

describe("SolarDisclosure", () => {
  it("does not mount expensive children while closed", () => {
    const toggle = vi.fn();
    const { rerender } = render(
      <SolarDisclosure id="details" title="Details" summary="More" open={false} onToggle={toggle} accent="info">
        <svg aria-label="expensive chart" />
      </SolarDisclosure>,
    );
    expect(screen.queryByLabelText("expensive chart")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Details/i }));
    expect(toggle).toHaveBeenCalledOnce();

    rerender(
      <SolarDisclosure id="details" title="Details" summary="More" open onToggle={toggle} accent="info">
        <svg aria-label="expensive chart" />
      </SolarDisclosure>,
    );
    expect(screen.getByLabelText("expensive chart")).not.toBeNull();
  });

  it("declares the tone once and wears the shared accent primitive", () => {
    const { container, getByRole } = render(
      <SolarDisclosure id="impacts" title="Impacts" summary="More" open={false} onToggle={() => {}} accent="warning">
        <p>Body</p>
      </SolarDisclosure>,
    );
    // The tone is a data attribute on the section, not a per-tone class map:
    // the rule, the hover tint and the glyph all read it through
    // `--su-section-accent-rgb` (src/styles/globals.css).
    const section = container.querySelector("section");
    expect(section?.getAttribute("data-accent")).toBe("warning");
    expect(section?.className).not.toContain("su-warning");

    const rule = container.querySelector('[aria-hidden="true"].su-section-rule');
    expect(rule).not.toBeNull();
    expect(rule?.parentElement).toBe(section);

    const button = getByRole("button", { name: /Impacts/i });
    expect(button.className).toContain("su-section-header");
    expect(button.className).not.toContain("hover:bg-su-line/10");

    const glyph = screen.getByText("+");
    expect(glyph.className).toContain("su-section-glyph");
  });
});
