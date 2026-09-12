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

  // Order is load-bearing, not incidental: `extractSection` in
  // src/lib/utils/scoring.ts returns the first match found while scanning
  // this array, and the multiplier grids render sections in array order. A
  // reorder here silently changes which section wins a first-match tie and
  // reshuffles the rendered grid, so pin the full order.
  it("preserves the full canonical order", () => {
    expect(ARRL_RAC_SECTIONS.join(",")).toBe(
      "CT,EMA,ME,NH,RI,VT,WMA,ENY,NLI,NNJ,NNY,SNJ,WNY,DE,EPA,MDC,WPA,AL,GA,KY,NC,NFL,SC,SFL,TN,VA,WCF,PR,VI,AR,LA,MS,NM,NTX,OK,STX,WTX,EB,LAX,ORG,PAC,SB,SCV,SDG,SF,SJV,SV,AZ,EWA,ID,MT,NV,OR,UT,WWA,WY,AK,IA,KS,MN,MO,NE,ND,SD,IL,IN,WI,CO,MI,OH,WV,MAR,QC,ONE,ONN,ONS,GTA,MB,SK,AB,BC,NT,YT",
    );
  });
});
