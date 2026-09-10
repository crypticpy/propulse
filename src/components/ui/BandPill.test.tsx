import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BandPill } from "./BandPill";
import { getBandColor } from "@/lib/utils/spotColors";

describe("BandPill", () => {
  it("sets --band-hue from getBandColor for a known band", () => {
    const { container } = render(<BandPill band="20m" />);
    const el = container.querySelector('[data-band="20m"]') as HTMLElement;

    expect(el.style.getPropertyValue("--band-hue")).toBe(getBandColor("20m"));
  });

  it("sets --band-hue from getBandColor for a second known band", () => {
    const { container } = render(<BandPill band="40m" />);
    const el = container.querySelector('[data-band="40m"]') as HTMLElement;

    expect(el.style.getPropertyValue("--band-hue")).toBe(getBandColor("40m"));
  });

  it("falls back to the default hue for an unknown band", () => {
    const { container } = render(<BandPill band="99m" />);
    const el = container.querySelector('[data-band="99m"]') as HTMLElement;

    expect(el.style.getPropertyValue("--band-hue")).toBe(getBandColor("99m"));
    expect(el.style.getPropertyValue("--band-hue")).toBe(getBandColor("default"));
  });

  it("sets data-band to the band string", () => {
    const { container } = render(<BandPill band="15m" />);
    expect(container.querySelector('[data-band="15m"]')).toBeTruthy();
  });

  it("always carries the ink class, never the hue as text colour", () => {
    const { container } = render(<BandPill band="20m" />);
    const el = container.querySelector('[data-band="20m"]') as HTMLElement;
    expect(el.className).toContain("text-su-text");
  });

  it("chip variant (default) has the left border and a tint background", () => {
    const { container } = render(<BandPill band="20m" />);
    const el = container.querySelector('[data-band="20m"]') as HTMLElement;

    expect(el.className).toContain("border-l-[3px]");
    expect(el.style.borderLeftColor).toBe("var(--band-hue)");
    expect(el.style.background).toContain("color-mix");
  });

  it("rule variant has the border but no tint", () => {
    const { container } = render(<BandPill band="20m" variant="rule" />);
    const el = container.querySelector('[data-band="20m"]') as HTMLElement;

    expect(el.className).toContain("border-l-[3px]");
    expect(el.style.borderLeftColor).toBe("var(--band-hue)");
    expect(el.style.background).toBe("");
  });

  it("inherit size sets no text-xs/text-sm class, for use inside an already-sized hero", () => {
    const { container } = render(<BandPill band="20m" size="inherit" />);
    const el = container.querySelector('[data-band="20m"]') as HTMLElement;

    expect(el.className).not.toContain("text-xs");
    expect(el.className).not.toContain("text-sm");
    expect(el.className).toContain("text-su-text");
  });

  it("merges a caller-supplied className with the base classes", () => {
    const { container } = render(
      <BandPill band="20m" className="ring-1 ring-su-info" />,
    );
    const el = container.querySelector('[data-band="20m"]') as HTMLElement;

    expect(el.className).toContain("ring-1");
    expect(el.className).toContain("ring-su-info");
    expect(el.className).toContain("text-su-text");
  });
});
