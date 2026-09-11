import { describe, expect, it } from "vitest";

import { ARRL_RAC_SECTIONS, ARRL_RAC_SECTION_SET } from "./arrlSections";

describe("ARRL_RAC_SECTIONS", () => {
  it("has exactly 83 entries", () => {
    expect(ARRL_RAC_SECTIONS.length).toBe(83);
  });

  it("spot-checks entries at both ends and in the middle", () => {
    expect(ARRL_RAC_SECTIONS[0]).toBe("CT");
    expect(ARRL_RAC_SECTIONS.at(-1)).toBe("YT");
    expect(ARRL_RAC_SECTIONS).toContain("MDC");
    expect(ARRL_RAC_SECTIONS).toContain("STX");
    expect(ARRL_RAC_SECTIONS).toContain("GTA");
  });

  it("agrees with ARRL_RAC_SECTION_SET", () => {
    expect(ARRL_RAC_SECTION_SET.size).toBe(ARRL_RAC_SECTIONS.length);
    for (const section of ARRL_RAC_SECTIONS) {
      expect(ARRL_RAC_SECTION_SET.has(section)).toBe(true);
    }
  });
});
