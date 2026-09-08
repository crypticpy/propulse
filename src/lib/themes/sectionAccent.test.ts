import { describe, expect, it } from "vitest";
import { HOME_LAYOUT_ITEMS } from "@/lib/home/layout";
import {
  accentForFamily,
  accentForHomeItem,
  type SectionAccent,
  type SectionFamily,
} from "./sectionAccent";

describe("accentForFamily", () => {
  it("gives each content family its one tone", () => {
    const expected: Array<[SectionFamily, SectionAccent]> = [
      ["propagation", "accent"],
      ["spaceWeather", "warning"],
      ["localEnvironment", "success"],
      ["reference", "info"],
    ];
    for (const [family, accent] of expected) {
      expect(accentForFamily(family)).toBe(accent);
    }
  });

  it("never hands out danger, which is reserved for alert states", () => {
    const families: SectionFamily[] = [
      "propagation",
      "spaceWeather",
      "localEnvironment",
      "reference",
    ];
    expect(families.map(accentForFamily)).not.toContain("danger");
  });
});

describe("accentForHomeItem", () => {
  it("matches the family map for the fixed dashboard sections", () => {
    expect(accentForHomeItem("activity")).toBe("accent");
    expect(accentForHomeItem("forecast")).toBe("accent");
    expect(accentForHomeItem("solar")).toBe("warning");
    expect(accentForHomeItem("weather")).toBe("success");
    expect(accentForHomeItem("daylight")).toBe("success");
    expect(accentForHomeItem("station")).toBe("info");
  });

  it("keeps local-environment panels on one tone across the catalogue", () => {
    for (const id of ["tides", "environment", "metar"]) {
      expect(accentForHomeItem(id)).toBe("success");
    }
  });

  it("falls back to reference for reference panels and unknown ids", () => {
    for (const id of ["moon", "clocks", "history", "news", "not-a-panel"]) {
      expect(accentForHomeItem(id)).toBe("info");
    }
  });

  it("resolves every Home layout item to a non-alert tone", () => {
    for (const item of HOME_LAYOUT_ITEMS) {
      expect(accentForHomeItem(item.id)).not.toBe("danger");
    }
  });
});
