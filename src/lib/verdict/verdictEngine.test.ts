import { describe, expect, it } from "vitest";
import {
  computeVerdict,
  PHYSICS_OPEN_ENTER,
  PHYSICS_OPEN_EXIT,
  SPOTS_CONFIRM_ENTER,
  type VerdictInputs,
} from "./verdictEngine";

function inputs(overrides: Partial<VerdictInputs>): VerdictInputs {
  return {
    band: "20m",
    physicsScore: 0.5,
    spotCount: 0,
    uniqueSpotters: 0,
    windowMinutes: 30,
    ...overrides,
  };
}

describe("computeVerdict quadrants", () => {
  it("physics open + spots => confirmed", () => {
    const r = computeVerdict(
      inputs({ physicsScore: 0.7, spotCount: 8, uniqueSpotters: 5 }),
    );
    expect(r.verdict).toBe("confirmed");
    expect(r.physicsOpen).toBe(true);
    expect(r.spotConfirmed).toBe(true);
  });

  it("physics open + no spots => likely", () => {
    const r = computeVerdict(inputs({ physicsScore: 0.7, spotCount: 0 }));
    expect(r.verdict).toBe("likely");
  });

  it("physics closed + spots => surprise", () => {
    const r = computeVerdict(
      inputs({ physicsScore: 0.2, spotCount: 6, uniqueSpotters: 4 }),
    );
    expect(r.verdict).toBe("surprise");
    expect(r.why.some((w) => w.includes("did not predict"))).toBe(true);
  });

  it("physics closed + no spots => closed", () => {
    const r = computeVerdict(inputs({ physicsScore: 0.2, spotCount: 0 }));
    expect(r.verdict).toBe("closed");
  });
});

describe("physics hysteresis", () => {
  it("does not enter open below the enter threshold", () => {
    const r = computeVerdict(
      inputs({ physicsScore: PHYSICS_OPEN_ENTER - 0.01 }),
    );
    expect(r.physicsOpen).toBe(false);
  });

  it("stays open between exit and enter when previously open", () => {
    const score = (PHYSICS_OPEN_EXIT + PHYSICS_OPEN_ENTER) / 2;
    const stayed = computeVerdict(inputs({ physicsScore: score }), {
      physicsOpen: true,
      spotConfirmed: false,
    });
    expect(stayed.physicsOpen).toBe(true);

    const fresh = computeVerdict(inputs({ physicsScore: score }));
    expect(fresh.physicsOpen).toBe(false);
  });

  it("exits open below the exit threshold even when previously open", () => {
    const r = computeVerdict(
      inputs({ physicsScore: PHYSICS_OPEN_EXIT - 0.01 }),
      { physicsOpen: true, spotConfirmed: false },
    );
    expect(r.physicsOpen).toBe(false);
  });
});

describe("spot hysteresis", () => {
  it("needs the enter count to confirm fresh", () => {
    const r = computeVerdict(
      inputs({ spotCount: SPOTS_CONFIRM_ENTER - 1, uniqueSpotters: 2 }),
    );
    expect(r.spotConfirmed).toBe(false);
  });

  it("holds confirmation at lower counts when previously confirmed", () => {
    const r = computeVerdict(
      inputs({ spotCount: 1, uniqueSpotters: 1 }),
      { physicsOpen: false, spotConfirmed: true },
    );
    expect(r.spotConfirmed).toBe(true);
  });

  it("drops confirmation at zero spots", () => {
    const r = computeVerdict(inputs({ spotCount: 0 }), {
      physicsOpen: false,
      spotConfirmed: true,
    });
    expect(r.spotConfirmed).toBe(false);
  });
});

describe("result plumbing", () => {
  it("confidence is within 0..1 across a sweep", () => {
    for (let score = 0; score <= 1; score += 0.1) {
      for (const spots of [0, 1, 3, 10, 50]) {
        const r = computeVerdict(
          inputs({
            physicsScore: score,
            spotCount: spots,
            uniqueSpotters: Math.min(spots, 8),
          }),
        );
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it("why lines carry both arms", () => {
    const r = computeVerdict(
      inputs({ physicsScore: 0.7, spotCount: 4, uniqueSpotters: 3 }),
    );
    expect(r.why.length).toBeGreaterThanOrEqual(2);
    expect(r.why[0]).toContain("Physics score");
    expect(r.why[1]).toContain("4 spots");
  });
});
