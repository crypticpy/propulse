import { describe, expect, it } from "vitest";

import {
  US_STATES,
  US_STATE_SET,
  US_STATES_WITH_DC,
  US_STATE_WITH_DC_SET,
} from "./usStateAbbreviations";

describe("US_STATES", () => {
  it("has exactly 50 entries", () => {
    expect(US_STATES.length).toBe(50);
  });

  it("spot-checks entries at both ends and in the middle", () => {
    expect(US_STATES[0]).toBe("AL");
    expect(US_STATES.at(-1)).toBe("WY");
    expect(US_STATES).toContain("TX");
    expect(US_STATES).toContain("NY");
  });

  it("does not include DC or territories", () => {
    expect(US_STATES).not.toContain("DC");
    expect(US_STATES).not.toContain("PR");
    expect(US_STATES).not.toContain("VI");
  });

  it("agrees with US_STATE_SET", () => {
    expect(US_STATE_SET.size).toBe(US_STATES.length);
    for (const state of US_STATES) {
      expect(US_STATE_SET.has(state)).toBe(true);
    }
  });

  // Order is load-bearing, not incidental: `extractSection` in
  // src/lib/utils/scoring.ts returns the first match found while scanning
  // this array, and the multiplier grids render states in array order. A
  // reorder here silently changes which section wins a first-match tie and
  // reshuffles the rendered grid, so pin the full order.
  it("preserves the full canonical order", () => {
    expect(US_STATES.join(",")).toBe(
      "AL,AK,AZ,AR,CA,CO,CT,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY",
    );
  });
});

describe("US_STATES_WITH_DC", () => {
  it("has exactly 51 entries with DC appended at the end", () => {
    expect(US_STATES_WITH_DC.length).toBe(51);
    expect(US_STATES_WITH_DC.at(-1)).toBe("DC");
  });

  it("is US_STATES plus DC", () => {
    expect(US_STATES_WITH_DC.slice(0, 50)).toEqual(US_STATES);
  });

  it("agrees with US_STATE_WITH_DC_SET", () => {
    expect(US_STATE_WITH_DC_SET.size).toBe(US_STATES_WITH_DC.length);
    for (const state of US_STATES_WITH_DC) {
      expect(US_STATE_WITH_DC_SET.has(state)).toBe(true);
    }
  });
});
