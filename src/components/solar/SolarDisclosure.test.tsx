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

  it("applies the given accent's gradient rule, hover tint, and glyph classes", () => {
    const { container, getByRole } = render(
      <SolarDisclosure id="impacts" title="Impacts" summary="More" open={false} onToggle={() => {}} accent="warning">
        <p>Body</p>
      </SolarDisclosure>,
    );
    const rule = container.querySelector('[aria-hidden="true"].h-\\[3px\\]');
    expect(rule?.className).toContain("from-su-warning");
    expect(rule?.className).toContain("via-su-warning/50");
    expect(rule?.className).toContain("to-transparent");

    const button = getByRole("button", { name: /Impacts/i });
    expect(button.className).toContain("hover:from-su-warning/15");
    expect(button.className).toContain("hover:to-transparent");
    expect(button.className).not.toContain("hover:bg-su-line/10");

    const glyph = screen.getByText("+");
    expect(glyph.className).toContain("border-su-warning/50");
    expect(glyph.className).toContain("text-su-warning");
  });
});
