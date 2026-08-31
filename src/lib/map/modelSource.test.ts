import { describe, expect, it } from "vitest";
import {
  BAND_SCORE_SOURCE,
  describeNowCastSource,
  MODEL_UNUSED_SOURCE,
  P533_SOURCE,
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
    errors: new Map(),
    ...over,
  };
}

describe("describeNowCastSource", () => {
  it("reports physics when the model capability is unavailable", () => {
    expect(describeNowCastSource(provenance({ available: false }))).toBe(
      MODEL_UNUSED_SOURCE,
    );
  });

  it("reports physics when the model is available but answered nothing", () => {
    expect(describeNowCastSource(provenance())).toBe(MODEL_UNUSED_SOURCE);
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

  it("does not claim a full fallback when some bands simply failed", () => {
    // One band answered with physics, one errored outright. Saying "every band
    // fell back to physics" would hide the band that produced nothing at all.
    const source = describeNowCastSource(
      provenance({
        fallbackBands: ["20m"],
        errors: new Map([["40m", new Error("boom")]]),
      }),
    );
    expect(source.tone).toBe("degraded");
    expect(source.detail).toContain("1 band returned no prediction at all");
  });

  it("reports an outright failure rather than falling through to physics", () => {
    const source = describeNowCastSource(
      provenance({
        errors: new Map([
          ["20m", new Error("boom")],
          ["40m", new Error("boom")],
        ]),
      }),
    );
    expect(source.tone).toBe("degraded");
    expect(source.label).toBe("NowCast unavailable");
  });

  it("counts failed bands alongside fallback and stale bands", () => {
    const source = describeNowCastSource(
      provenance({
        nowcastBands: ["20m"],
        fallbackBands: ["40m"],
        errors: new Map([["80m", new Error("boom")]]),
      }),
    );
    expect(source.label).toBe("NowCast · partial");
    expect(source.detail).toContain("1 band fell back to physics");
    expect(source.detail).toContain("1 band returned no prediction");
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

  it("counts only the bands the caller actually displays", () => {
    // The hook requests every model band; a panel may render five. A fallback
    // on 160m must not show up as a caveat on a row that has no 160m in it.
    const source = describeNowCastSource(
      provenance({
        nowcastBands: ["20m", "40m"],
        fallbackBands: ["160m"],
        staleInputBands: ["60m"],
        errors: new Map([["6m", new Error("boom")]]),
      }),
      ["20m", "40m", "80m"],
    );
    expect(source.tone).toBe("ml");
    expect(source.label).toBe("NowCast ML");
  });

  it("still reports degradation that lands on a displayed band", () => {
    const source = describeNowCastSource(
      provenance({ nowcastBands: ["20m"], fallbackBands: ["40m", "160m"] }),
      ["20m", "40m"],
    );
    expect(source.label).toBe("NowCast · partial");
    expect(source.detail).toContain("1 band fell back to physics");
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

describe("physics descriptors", () => {
  it("keeps the ray-traced and estimated engines distinguishable", () => {
    // Both live in lib/utils and both are "physics", but only one traces a
    // ray. Collapsing them is what made the forecast heatmap claim P.533.
    expect(P533_SOURCE.label).not.toBe(BAND_SCORE_SOURCE.label);
    expect(P533_SOURCE.detail).toContain("P.533");
    expect(BAND_SCORE_SOURCE.detail).toContain("not the full ITU-R P.533");
  });

  it("does not let the NowCast path claim a specific physics engine", () => {
    // describeNowCastSource cannot see which engine the surrounding panel
    // called, so its no-model descriptor must stay engine-agnostic.
    expect(MODEL_UNUSED_SOURCE.detail).not.toContain("P.533");
  });
});
