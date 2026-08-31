import { describe, expect, it } from "vitest";
import {
  describeNowCastSource,
  PHYSICS_SOURCE,
  type NowCastProvenance,
} from "./modelSource";

function provenance(over: Partial<NowCastProvenance> = {}): NowCastProvenance {
  return {
    available: true,
    personalized: false,
    pending: false,
    nowcastBands: [],
    fallbackBands: [],
    staleInputBands: [],
    ...over,
  };
}

describe("describeNowCastSource", () => {
  it("reports physics when the model capability is unavailable", () => {
    expect(describeNowCastSource(provenance({ available: false }))).toBe(
      PHYSICS_SOURCE,
    );
  });

  it("reports physics when the model is available but answered nothing", () => {
    expect(describeNowCastSource(provenance())).toBe(PHYSICS_SOURCE);
  });

  it("shows a pending state rather than claiming physics mid-flight", () => {
    const source = describeNowCastSource(provenance({ pending: true }));
    expect(source.tone).toBe("ml");
    expect(source.label).toMatch(/NowCast/);
  });

  it("flags a full fallback as degraded, not as a model prediction", () => {
    // The whole reason this module exists: every band silently fell back to
    // the physics engine, but the surrounding UI still says "NowCast".
    const source = describeNowCastSource(
      provenance({ fallbackBands: ["20m", "40m"] }),
    );
    expect(source.tone).toBe("degraded");
    expect(source.label).toBe("Physics fallback");
  });

  it("reports clean ML when every band came from the model", () => {
    const source = describeNowCastSource(
      provenance({ nowcastBands: ["20m", "40m"] }),
    );
    expect(source.tone).toBe("ml");
    expect(source.label).toBe("NowCast ML");
  });

  it("names StationCast when the prediction is personalized", () => {
    const source = describeNowCastSource(
      provenance({ nowcastBands: ["20m"], personalized: true }),
    );
    expect(source.label).toBe("NowCast + StationCast ML");
  });

  it("marks a mixed answer partial and counts both kinds of degradation", () => {
    const source = describeNowCastSource(
      provenance({
        nowcastBands: ["20m", "40m"],
        fallbackBands: ["80m"],
        staleInputBands: ["10m", "15m"],
      }),
    );
    expect(source.tone).toBe("degraded");
    expect(source.label).toBe("NowCast · partial");
    expect(source.detail).toContain("1 band fell back to physics");
    expect(source.detail).toContain("2 bands ran on stale inputs");
  });

  it("treats stale inputs alone as degraded even with no hard fallback", () => {
    const source = describeNowCastSource(
      provenance({ nowcastBands: ["20m"], staleInputBands: ["20m"] }),
    );
    expect(source.tone).toBe("degraded");
  });

  it("always produces a non-empty label and detail", () => {
    const cases: NowCastProvenance[] = [
      provenance({ available: false }),
      provenance(),
      provenance({ pending: true }),
      provenance({ fallbackBands: ["20m"] }),
      provenance({ nowcastBands: ["20m"] }),
      provenance({ nowcastBands: ["20m"], fallbackBands: ["40m"] }),
    ];
    for (const input of cases) {
      const source = describeNowCastSource(input);
      expect(source.label.length).toBeGreaterThan(0);
      expect(source.detail.length).toBeGreaterThan(0);
    }
  });
});
