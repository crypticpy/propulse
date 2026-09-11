import { describe, expect, it } from "vitest";
import { US_STATES } from "@/lib/data/usStateAbbreviations";
import { TOTAL_US_STATES, US_STATES_DATA } from "./usStateMap";

// The display table restates the canonical abbreviations with names and
// regions; if the two drift, WAS progress is silently under- or over-counted.
describe("usStateMap", () => {
  it("carries display data for exactly the canonical 50 states", () => {
    const abbrs = US_STATES_DATA.map((s) => s.abbr).sort();
    expect(abbrs).toEqual([...US_STATES].sort());
    expect(TOTAL_US_STATES).toBe(US_STATES.length);
  });
});
