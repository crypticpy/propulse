import { describe, expect, it } from "vitest";
import { heroSizeClass } from "./tokens";

describe("heroSizeClass", () => {
  it("puts one-word states at the short band (≤ 4 chars)", () => {
    expect(heroSizeClass("HOT")).toBe("hc-hero--short");
    expect(heroSizeClass("DAY")).toBe("hc-hero--short");
    expect(heroSizeClass("20m")).toBe("hc-hero--short");
    expect(heroSizeClass("OPEN")).toBe("hc-hero--short");
  });

  it("puts typical values at the medium band (≤ 8 chars)", () => {
    expect(heroSizeClass("NIGHT")).toBe("hc-hero--medium");
    expect(heroSizeClass("RISING")).toBe("hc-hero--medium");
    expect(heroSizeClass("MARGINAL")).toBe("hc-hero--medium");
  });

  it("puts phrases past 8 chars at the long band", () => {
    expect(heroSizeClass("GREY LINE")).toBe("hc-hero--long");
    expect(heroSizeClass("NO SIGNAL")).toBe("hc-hero--long");
    expect(heroSizeClass("NO RECEIVER")).toBe("hc-hero--long");
    expect(heroSizeClass("NO MAPPED ALERTS")).toBe("hc-hero--long");
  });

  it("trims surrounding whitespace before measuring", () => {
    expect(heroSizeClass("  DAY  ")).toBe("hc-hero--short");
    expect(heroSizeClass(" NO MAPPED ALERTS ")).toBe("hc-hero--long");
  });
});
