import { describe, expect, it } from "vitest";
import {
  evaluateLadder,
  LADDER_RANK,
  STIRRING_OBS_ENTER,
  VERIFIED_OBS_ENTER,
  VERIFIED_OBS_EXIT,
  VERIFIED_REPORTERS_ENTER,
  type LadderEdgeState,
  type LadderInputs,
  type LadderState,
} from "./ladder";
import {
  advanceRanked,
  DOWNGRADE_HOLD_MS,
  initialRankedState,
  UPGRADE_HOLD_MS,
  type RankedMachineState,
} from "./stateMachine";
import { PHYSICS_OPEN_ENTER, PHYSICS_OPEN_EXIT } from "./verdictEngine";

const T0 = 1_756_500_000_000;
const MIN = 60 * 1000;

function inputs(overrides: Partial<LadderInputs> = {}): LadderInputs {
  return {
    physicsScore: 0,
    obs20m: 0,
    reporters20m: 0,
    count10mRecent: 0,
    count10mPrior: 0,
    ...overrides,
  };
}

describe("evaluateLadder raw states", () => {
  it("dead band with a closed forecast is closed", () => {
    const r = evaluateLadder(inputs());
    expect(r.state).toBe("closed");
    expect(r.surprise).toBe(false);
  });

  it("open forecast alone is forecast", () => {
    const r = evaluateLadder(inputs({ physicsScore: PHYSICS_OPEN_ENTER }));
    expect(r.state).toBe("forecast");
    expect(r.physicsOpen).toBe(true);
  });

  it("a single deduplicated observation makes stirring", () => {
    const r = evaluateLadder(
      inputs({
        physicsScore: 0.9,
        obs20m: STIRRING_OBS_ENTER,
        reporters20m: 1,
      }),
    );
    expect(r.state).toBe("stirring");
  });

  it("stirring outranks forecast when both hold", () => {
    expect(LADDER_RANK.stirring).toBeGreaterThan(LADDER_RANK.forecast);
    const r = evaluateLadder(
      inputs({ physicsScore: 0.9, obs20m: 2, reporters20m: 2 }),
    );
    expect(r.state).toBe("stirring");
  });

  it("verified needs BOTH the obs floor and the reporter floor", () => {
    const enough = inputs({
      physicsScore: 0.7,
      obs20m: VERIFIED_OBS_ENTER,
      reporters20m: VERIFIED_REPORTERS_ENTER,
    });
    expect(evaluateLadder(enough).state).toBe("verified");

    // 6 obs but only 2 reporters: one loud pair, not a verified opening
    expect(
      evaluateLadder(
        inputs({ physicsScore: 0.7, obs20m: VERIFIED_OBS_ENTER, reporters20m: 2 }),
      ).state,
    ).toBe("stirring");

    // 3 reporters but only 5 obs: not enough traffic yet
    expect(
      evaluateLadder(
        inputs({
          physicsScore: 0.7,
          obs20m: VERIFIED_OBS_ENTER - 1,
          reporters20m: VERIFIED_REPORTERS_ENTER,
        }),
      ).state,
    ).toBe("stirring");
  });

  it("hot is verified plus a rising trend", () => {
    const r = evaluateLadder(
      inputs({
        physicsScore: 0.7,
        obs20m: 8,
        reporters20m: 4,
        count10mRecent: 6,
        count10mPrior: 2,
      }),
    );
    expect(r.state).toBe("hot");
    expect(r.trend).toBe("rising");
  });

  it("verified with a steady or falling trend is just verified", () => {
    expect(
      evaluateLadder(
        inputs({
          physicsScore: 0.7,
          obs20m: 8,
          reporters20m: 4,
          count10mRecent: 4,
          count10mPrior: 4,
        }),
      ).state,
    ).toBe("verified");
    expect(
      evaluateLadder(
        inputs({
          physicsScore: 0.7,
          obs20m: 8,
          reporters20m: 4,
          count10mRecent: 2,
          count10mPrior: 6,
        }),
      ).state,
    ).toBe("verified");
  });

  it("trend dead band: ±20 % of prior reads steady, beyond it does not", () => {
    const base = inputs({ physicsScore: 0.7, obs20m: 8, reporters20m: 4 });
    // 12 vs 10 = +20 % — inside the dead band, steady, NOT hot
    expect(
      evaluateLadder({ ...base, count10mRecent: 12, count10mPrior: 10 }).state,
    ).toBe("verified");
    // 13 vs 10 = +30 % — rising, hot
    expect(
      evaluateLadder({ ...base, count10mRecent: 13, count10mPrior: 10 }).state,
    ).toBe("hot");
    // Silence in both windows is steady, not rising
    expect(
      evaluateLadder({ ...base, count10mRecent: 0, count10mPrior: 0 }).trend,
    ).toBe("steady");
  });
});

describe("evaluateLadder hysteresis", () => {
  it("physics edge enters at 0.4 and exits below 0.3", () => {
    const first = evaluateLadder(inputs({ physicsScore: 0.35 }));
    expect(first.state).toBe("closed"); // 0.35 < enter threshold

    const wasOpen: LadderEdgeState = { physicsOpen: true, verified: false };
    expect(
      evaluateLadder(inputs({ physicsScore: 0.35 }), wasOpen).state,
    ).toBe("forecast"); // 0.35 ≥ exit threshold keeps it open
    expect(
      evaluateLadder(
        inputs({ physicsScore: PHYSICS_OPEN_EXIT - 0.01 }),
        wasOpen,
      ).state,
    ).toBe("closed");
  });

  it("verified edge exits only when obs fall to the low floor", () => {
    const wasVerified: LadderEdgeState = { physicsOpen: true, verified: true };
    // 3 obs from 1 reporter would never ENTER verified, but it KEEPS it
    const kept = evaluateLadder(
      inputs({ physicsScore: 0.7, obs20m: VERIFIED_OBS_EXIT + 1, reporters20m: 1 }),
      wasVerified,
    );
    expect(kept.state).toBe("verified");
    // At the exit floor it drops out
    const dropped = evaluateLadder(
      inputs({ physicsScore: 0.7, obs20m: VERIFIED_OBS_EXIT, reporters20m: 1 }),
      wasVerified,
    );
    expect(dropped.state).toBe("stirring");
  });

  it("reporter count does not gate staying verified", () => {
    const wasVerified: LadderEdgeState = { physicsOpen: true, verified: true };
    const r = evaluateLadder(
      inputs({ physicsScore: 0.7, obs20m: 5, reporters20m: 1 }),
      wasVerified,
    );
    expect(r.verified).toBe(true);
  });
});

describe("surprise flag", () => {
  it("sets when stirring+ is reached while the forecast says closed", () => {
    const stirring = evaluateLadder(
      inputs({ physicsScore: 0.1, obs20m: 2, reporters20m: 2 }),
    );
    expect(stirring.state).toBe("stirring");
    expect(stirring.surprise).toBe(true);

    const verified = evaluateLadder(
      inputs({ physicsScore: 0.1, obs20m: 8, reporters20m: 4 }),
    );
    expect(verified.state).toBe("verified");
    expect(verified.surprise).toBe(true);
    expect(verified.why.some((line) => line.includes("did not predict"))).toBe(
      true,
    );
  });

  it("never sets on closed or forecast, and never when physics is open", () => {
    expect(evaluateLadder(inputs()).surprise).toBe(false);
    expect(
      evaluateLadder(inputs({ physicsScore: 0.9 })).surprise,
    ).toBe(false);
    expect(
      evaluateLadder(inputs({ physicsScore: 0.9, obs20m: 8, reporters20m: 4 }))
        .surprise,
    ).toBe(false);
  });
});

describe("ladder through the hold machine", () => {
  function run(
    seq: Array<{ at: number; raw: LadderState }>,
    start: LadderState = "closed",
  ): { states: LadderState[]; flips: Array<{ from: string; to: string }> } {
    let machine: RankedMachineState<LadderState> = initialRankedState(
      start,
      T0,
    );
    const states: LadderState[] = [];
    const flips: Array<{ from: string; to: string }> = [];
    for (const step of seq) {
      const r = advanceRanked(LADDER_RANK, machine, step.raw, T0 + step.at);
      machine = r.state;
      states.push(machine.stable);
      if (r.flip) flips.push({ from: r.flip.from, to: r.flip.to });
    }
    return { states, flips };
  }

  it("every upgrade promotes after the 5-min hold, not before", () => {
    const pairs: Array<[LadderState, LadderState]> = [
      ["closed", "forecast"],
      ["forecast", "stirring"],
      ["stirring", "verified"],
      ["verified", "hot"],
      ["closed", "verified"], // rung-skipping upgrade
    ];
    for (const [from, to] of pairs) {
      const { flips } = run(
        [
          { at: 0, raw: to },
          { at: UPGRADE_HOLD_MS - 1, raw: to },
          { at: UPGRADE_HOLD_MS, raw: to },
        ],
        from,
      );
      expect(flips).toEqual([{ from, to }]);
    }
  });

  it("every downgrade needs the full 20-min hold", () => {
    const pairs: Array<[LadderState, LadderState]> = [
      ["hot", "verified"],
      ["verified", "stirring"],
      ["stirring", "forecast"],
      ["forecast", "closed"],
      ["hot", "closed"], // collapse straight down
    ];
    for (const [from, to] of pairs) {
      const { flips } = run(
        [
          { at: 0, raw: to },
          { at: UPGRADE_HOLD_MS, raw: to },
          { at: DOWNGRADE_HOLD_MS - 1, raw: to },
          { at: DOWNGRADE_HOLD_MS, raw: to },
        ],
        from,
      );
      expect(flips).toEqual([{ from, to }]);
    }
  });

  it("recorded quiet fixture: sparse single spots never flap past stirring", () => {
    // A quiet band: one lone spot every ~15 min. Raw alternates
    // stirring/closed; neither candidate ever survives its hold intact
    // after the first stirring promotion, so the stable state settles at
    // stirring and stays there — no flapping.
    const seq: Array<{ at: number; raw: LadderState }> = [];
    for (let m = 0; m <= 120; m += 5) {
      const raw: LadderState = m % 15 === 0 ? "stirring" : "closed";
      seq.push({ at: m * MIN, raw });
    }
    const { states, flips } = run(seq);
    // At most one promotion up to stirring; never verified/hot, and the
    // 20-min downgrade hold never completes because a spot always returns.
    expect(flips.length).toBeLessThanOrEqual(1);
    expect(states.every((s) => LADDER_RANK[s] <= LADDER_RANK.stirring)).toBe(
      true,
    );
    expect(states.at(-1)).toBe(flips.length === 1 ? "stirring" : "closed");
  });

  it("recorded busy fixture: a real opening climbs the ladder without oscillating", () => {
    // FT8 opening: forecast first, spots trickle in, then a pile-up, then
    // it fades. 5-min ticks.
    const raws: LadderState[] = [
      "forecast", // 0m — model says open
      "forecast", // 5m  → promotes (5-min hold)
      "stirring", // 10m — first spot
      "stirring", // 15m → promotes
      "verified", // 20m — pile-up begins
      "verified", // 25m → promotes
      "hot", // 30m — rate rising
      "hot", // 35m → promotes
      "hot", // 40m
      "verified", // 45m — rate flattens: downgrade candidate starts
      "hot", // 50m — brief resurgence breaks the streak
      "verified", // 55m — candidate restarts
      "verified", // 60m
      "verified", // 65m
      "verified", // 70m
      "verified", // 75m → 20-min hold met, drops to verified
    ];
    const { states, flips } = run(
      raws.map((raw, i) => ({ at: i * 5 * MIN, raw })),
    );
    expect(flips).toEqual([
      { from: "closed", to: "forecast" },
      { from: "forecast", to: "stirring" },
      { from: "stirring", to: "verified" },
      { from: "verified", to: "hot" },
      { from: "hot", to: "verified" },
    ]);
    // Monotone climb then a single controlled step down — never a flap.
    const ranks = states.map((s) => LADDER_RANK[s]);
    let direction: "up" | "down" = "up";
    for (let i = 1; i < ranks.length; i++) {
      if (ranks[i] < ranks[i - 1]) direction = "down";
      else if (ranks[i] > ranks[i - 1]) {
        expect(direction).toBe("up");
      }
    }
  });
});
