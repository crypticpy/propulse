import { describe, expect, it } from "vitest";
import {
  generalHfGuidance,
  latestByTime,
  protonScale,
  widgetState,
  xrayClass,
} from "./selectors";

describe("solar selectors", () => {
  it("selects by maximum timestamp instead of array position", () => {
    const latest = latestByTime(
      [
        { at: "2026-07-15T19:00:00Z", value: 2 },
        { at: "2026-07-15T18:00:00Z", value: 1 },
      ],
      (point) => point.at,
    );
    expect(latest?.value).toBe(2);
  });

  it("keeps missing classifications distinct from valid quiet values", () => {
    expect(xrayClass(null)).toBeNull();
    expect(protonScale(null)).toBe("Unknown");
    expect(protonScale(0)).toBe("Below S1");
  });

  it("withholds guidance when required inputs are missing", () => {
    const guidance = generalHfGuidance({ sfi: null, kp: 2, bz: null });
    expect(guidance.level).toBe("insufficient");
    expect(guidance.missing).toEqual(["solar flux", "IMF Bz"]);
    expect(guidance.summary).toMatch(/withheld/i);
  });

  it("keeps a hard-expired query distinct from a generic error", () => {
    expect(
      widgetState({
        pending: false,
        fetching: false,
        error: true,
        unavailable: true,
      }),
    ).toBe("unavailable");
  });
});
