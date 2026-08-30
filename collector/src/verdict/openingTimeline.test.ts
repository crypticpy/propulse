import { describe, expect, it } from "vitest";

import { PHYSICS_OPEN_ENTER, PHYSICS_OPEN_EXIT } from "./ladder.js";
import {
  computeOpeningTimeline,
  TIMELINE_HORIZON_MIN,
  TIMELINE_STEP_MIN,
} from "./openingTimeline.js";
import { buildLitFracPhysics, type PhysicsArm } from "./physicsArm.js";

const T0 = Date.UTC(2026, 7, 30, 12, 0);
const MIN = 60_000;

/** Stub arm whose blend is a pure function of the sweep time. */
function rampArm(scoreAtMs: (atMs: number) => number): PhysicsArm {
  return {
    basis: "test-basis",
    fLitFor: () => 0.5,
    scoreFor: () => scoreAtMs(T0),
    scoreAt: (_type, _key, _band, atMs) => scoreAtMs(atMs),
  };
}

describe("computeOpeningTimeline", () => {
  it("finds the first enter crossing for a closed scope", () => {
    // Blend sits at 0.2 and jumps to 0.5 from +90 min on.
    const arm = rampArm((atMs) => (atMs >= T0 + 90 * MIN ? 0.5 : 0.2));
    expect(computeOpeningTimeline(arm, "global", "", "20m", false, T0)).toEqual(
      { opensInMin: 90, fadesInMin: null },
    );
  });

  it("finds the first exit crossing for an open scope", () => {
    const arm = rampArm((atMs) => (atMs >= T0 + 120 * MIN ? 0.25 : 0.6));
    expect(computeOpeningTimeline(arm, "global", "", "20m", true, T0)).toEqual({
      opensInMin: null,
      fadesInMin: 120,
    });
  });

  it("uses the ladder's hysteresis pair, not a single threshold", () => {
    // 0.35 is inside the hysteresis band: below ENTER, above EXIT — it
    // neither opens a closed scope nor fades an open one.
    const arm = rampArm(() => 0.35);
    expect(PHYSICS_OPEN_EXIT).toBeLessThan(0.35);
    expect(PHYSICS_OPEN_ENTER).toBeGreaterThan(0.35);
    expect(computeOpeningTimeline(arm, "global", "", "20m", false, T0)).toEqual(
      { opensInMin: null, fadesInMin: null },
    );
    expect(computeOpeningTimeline(arm, "global", "", "20m", true, T0)).toEqual({
      opensInMin: null,
      fadesInMin: null,
    });
  });

  it("returns nulls when nothing crosses inside the horizon", () => {
    const closed = rampArm(() => 0.1);
    const open = rampArm(() => 0.8);
    expect(
      computeOpeningTimeline(closed, "global", "", "20m", false, T0),
    ).toEqual({ opensInMin: null, fadesInMin: null });
    expect(computeOpeningTimeline(open, "global", "", "20m", true, T0)).toEqual(
      { opensInMin: null, fadesInMin: null },
    );
  });

  it("sweeps the real arm: sunrise opens dark NA, sunset fades daylit AS", () => {
    // 03:00Z equinox, kp=2 sfi=180 — the physicsArm test fixture: 10m day
    // Excellent (0.9) / night Poor (0.2). NA is dark (closed), AS is lit
    // (open); within 12 h the terminator swaps both.
    const t03z = Date.UTC(2026, 2, 20, 3, 0);
    const arm = buildLitFracPhysics(2, 180, t03z);

    const na = computeOpeningTimeline(arm, "regional", "NA", "10m", false, t03z);
    expect(na.opensInMin).not.toBeNull();
    expect(na.opensInMin! % TIMELINE_STEP_MIN).toBe(0);
    expect(na.opensInMin!).toBeLessThanOrEqual(TIMELINE_HORIZON_MIN);
    // Hand-check the crossing: at the reported step the blend is over
    // ENTER, one step earlier it was still under.
    expect(
      arm.scoreAt("regional", "NA", "10m", t03z + na.opensInMin! * MIN),
    ).toBeGreaterThanOrEqual(PHYSICS_OPEN_ENTER);
    expect(
      arm.scoreAt(
        "regional",
        "NA",
        "10m",
        t03z + (na.opensInMin! - TIMELINE_STEP_MIN) * MIN,
      ),
    ).toBeLessThan(PHYSICS_OPEN_ENTER);

    const as = computeOpeningTimeline(arm, "regional", "AS", "10m", true, t03z);
    expect(as.fadesInMin).not.toBeNull();
    expect(as.fadesInMin! % TIMELINE_STEP_MIN).toBe(0);
    expect(
      arm.scoreAt("regional", "AS", "10m", t03z + as.fadesInMin! * MIN),
    ).toBeLessThan(PHYSICS_OPEN_EXIT);
  });
});
