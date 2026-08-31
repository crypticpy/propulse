import { describe, expect, it } from "vitest";
import { bandVerdictInputsAreReady } from "./useBandVerdicts";

describe("bandVerdictInputsAreReady", () => {
  it("requires current solar and activity inputs before persisted verdicts are live", () => {
    expect(bandVerdictInputsAreReady(2, 145, true)).toBe(true);
    expect(bandVerdictInputsAreReady(null, 145, true)).toBe(false);
    expect(bandVerdictInputsAreReady(2, null, true)).toBe(false);
    expect(bandVerdictInputsAreReady(2, 145, false)).toBe(false);
  });
});
