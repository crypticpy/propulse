import { describe, expect, it } from "vitest";

import {
  parseScopeCounts,
  planVerdictTick,
  type ScopeCounts,
  type VerdictStateRow,
} from "./verdictLadder.js";
import type { PhysicsArm } from "../verdict/physicsArm.js";

const T0 = Date.UTC(2026, 7, 30, 12, 0);
const MIN = 60_000;

/** Deterministic stub arm: fixed per-band scores, fixed lit fraction. */
function arm(scores: Map<string, number>, fLit = 0.5): PhysicsArm {
  return {
    basis: "test-basis",
    fLitFor: () => fLit,
    scoreFor: (_type, _key, band) => scores.get(band) ?? 0,
    // Time-invariant: the BH3 sweep never finds a crossing on this stub.
    scoreAt: (_type, _key, band) => scores.get(band) ?? 0,
  };
}

function counts(overrides: Partial<ScopeCounts> = {}): ScopeCounts {
  return {
    scopeType: "global",
    scopeKey: "",
    band: "20m",
    obs20m: 0,
    reporters20m: 0,
    count10mRecent: 0,
    count10mPrior: 0,
    sourceCounts60m: {},
    modeObs20m: {},
    ...overrides,
  };
}

/** Replay a fixture of ticks through the planner, chaining state rows. */
function replay(
  ticks: Array<{ atMin: number; counts: ScopeCounts[] }>,
  physics: PhysicsArm,
): {
  finalStates: VerdictStateRow[];
  allEvents: Array<{ atMin: number; event: string }>;
  eventRows: ReturnType<typeof planVerdictTick>["events"];
} {
  let prev: VerdictStateRow[] = [];
  const allEvents: Array<{ atMin: number; event: string }> = [];
  const eventRows: ReturnType<typeof planVerdictTick>["events"] = [];
  for (const tick of ticks) {
    const plan = planVerdictTick(prev, physics, tick.counts, T0 + tick.atMin * MIN);
    prev = plan.states;
    for (const e of plan.events) {
      eventRows.push(e);
      allEvents.push({
        atMin: tick.atMin,
        event: `${e.event_type}:${e.from_state ?? ""}→${e.to_state ?? ""}`,
      });
    }
  }
  return { finalStates: prev, allEvents, eventRows };
}

describe("parseScopeCounts", () => {
  it("parses global and regional RPC rows", () => {
    const global = parseScopeCounts(
      {
        band: "20m",
        obs_20m: 7,
        reporters_20m: 4,
        count_10m_recent: 5,
        count_10m_prior: 2,
        source_counts_60m: { rbn: 12 },
        mode_obs_20m: { cw: 3, digital: 4 },
      },
      "global",
    );
    expect(global).toMatchObject({
      scopeType: "global",
      scopeKey: "",
      obs20m: 7,
      modeObs20m: { cw: 3, digital: 4 },
    });

    const regional = parseScopeCounts(
      { continent: "NA", band: "40m", obs_20m: 2 },
      "regional",
    );
    expect(regional).toMatchObject({ scopeKey: "NA", band: "40m", obs20m: 2 });
  });

  it("rejects rows without a band or a regional continent", () => {
    expect(parseScopeCounts({ obs_20m: 3 }, "global")).toBeNull();
    expect(parseScopeCounts({ band: "20m" }, "regional")).toBeNull();
    expect(parseScopeCounts(null, "global")).toBeNull();
  });
});

describe("planVerdictTick", () => {
  const physics = arm(new Map([["20m", 0.7]]));
  const closedPhysics = arm(new Map([["20m", 0.1]]));

  it("cold start begins closed and earns forecast through the upgrade hold", () => {
    const t0 = planVerdictTick([], physics, [counts()], T0);
    expect(t0.states[0].state).toBe("closed");
    expect(t0.states[0].candidate).toBe("forecast");
    expect(t0.events).toHaveLength(0);

    const t1 = planVerdictTick(t0.states, physics, [counts()], T0 + 5 * MIN);
    expect(t1.states[0].state).toBe("forecast");
    expect(t1.events).toEqual([
      expect.objectContaining({
        event_type: "transition",
        from_state: "closed",
        to_state: "forecast",
      }),
    ]);
  });

  it("writes the event row at transition time with the pre-outcome inputs", () => {
    const busy = counts({
      obs20m: 9,
      reporters20m: 5,
      count10mRecent: 6,
      count10mPrior: 2,
      modeObs20m: { digital: 8, cw: 1 },
    });
    const { eventRows } = replay(
      [
        { atMin: 0, counts: [busy] },
        { atMin: 5, counts: [busy] },
      ],
      physics,
    );
    // The transition event carries the inputs that CAUSED it — obs,
    // reporters, trend, physics — logged before any outcome exists.
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]).toMatchObject({
      event_type: "transition",
      from_state: "closed",
      to_state: "hot",
      inputs: {
        obs_20m: 9,
        reporters_20m: 5,
        trend: "rising",
        physics_open: true,
        physics_basis: "test-basis",
        physics_f_lit: 0.5,
        raw_state: "hot",
        // BH3 timeline keys are always present; a flat stub arm never
        // crosses either threshold.
        opens_in_min: null,
        fades_in_min: null,
        mode_obs_20m: { digital: 8, cw: 1 },
      },
    });
    expect(eventRows[0].ts).toBe(new Date(T0 + 5 * MIN).toISOString());
  });

  it("logs a surprise event once when activity appears against a closed forecast", () => {
    const active = counts({ obs20m: 3, reporters20m: 2 });
    const { allEvents, finalStates } = replay(
      [
        { atMin: 0, counts: [active] },
        { atMin: 5, counts: [active] },
        { atMin: 10, counts: [active] },
      ],
      closedPhysics,
    );
    expect(allEvents).toEqual([
      { atMin: 5, event: "transition:closed→stirring" },
      { atMin: 5, event: "surprise:→stirring" },
    ]);
    expect(finalStates[0].surprise).toBe(true);
  });

  it("holds a downgrade for 20 minutes and tracks opened_at across it", () => {
    const busy = counts({ obs20m: 8, reporters20m: 4 });
    const quiet = counts();
    const ticks = [
      { atMin: 0, counts: [busy] },
      { atMin: 5, counts: [busy] }, // → verified
      { atMin: 10, counts: [quiet] }, // downgrade candidate starts
      { atMin: 15, counts: [quiet] },
      { atMin: 25, counts: [quiet] },
      { atMin: 30, counts: [quiet] }, // 20-min hold met → closed
    ];
    const { finalStates, allEvents } = replay(ticks, physics);
    expect(allEvents.map((e) => e.event)).toEqual([
      "transition:closed→verified",
      // Raw goes to forecast (physics open, no obs) and holds 20 min
      "transition:verified→forecast",
    ]);
    expect(allEvents[1].atMin).toBe(30);
    const final = finalStates[0];
    expect(final.state).toBe("forecast");
    expect(final.opened_at).toBeNull();
  });

  it("keeps opened_at pinned to the start of the open run", () => {
    const busy = counts({ obs20m: 8, reporters20m: 4 });
    const { finalStates } = replay(
      [
        { atMin: 0, counts: [busy] },
        { atMin: 5, counts: [busy] }, // verified — run opens here
        { atMin: 10, counts: [busy] },
        { atMin: 40, counts: [busy] },
      ],
      physics,
    );
    expect(finalStates[0].opened_at).toBe(
      new Date(T0 + 5 * MIN).toISOString(),
    );
  });

  it("zero-fills scopes that have a state but no counts row this tick", () => {
    const na = counts({ scopeType: "regional", scopeKey: "NA", obs20m: 8, reporters20m: 4 });
    const t0 = planVerdictTick([], physics, [na], T0);
    const t1 = planVerdictTick(t0.states, physics, [na], T0 + 5 * MIN);
    expect(t1.states[0].state).toBe("verified");

    // NA disappears from the counts entirely — the scope must still be
    // evaluated (against zeros) so it can walk back down.
    const t2 = planVerdictTick(t1.states, physics, [], T0 + 10 * MIN);
    expect(t2.states).toHaveLength(1);
    expect(t2.states[0].candidate).toBe("forecast");
  });

  it("recorded quiet fixture: a lone spot every 15 min never climbs past stirring", () => {
    const lone = counts({ obs20m: 1, reporters20m: 1 });
    const quiet = counts();
    const ticks = [];
    for (let m = 0; m <= 120; m += 5) {
      ticks.push({ atMin: m, counts: [m % 15 === 0 ? lone : quiet] });
    }
    const { allEvents } = replay(ticks, physics);
    const transitions = allEvents.filter((e) =>
      e.event.startsWith("transition"),
    );
    // Climbs to forecast (physics is open), may reach stirring, never
    // verified — and never flaps back and forth.
    expect(transitions.length).toBeLessThanOrEqual(2);
    for (const t of transitions) {
      expect(t.event).not.toContain("verified");
      expect(t.event).not.toContain("hot");
    }
  });

  it("hysteresis: a verified scope survives an obs dip that would not enter", () => {
    const busy = counts({ obs20m: 8, reporters20m: 4 });
    const dip = counts({ obs20m: 3, reporters20m: 1 }); // would never ENTER
    const { finalStates, allEvents } = replay(
      [
        { atMin: 0, counts: [busy] },
        { atMin: 5, counts: [busy] }, // → verified
        { atMin: 10, counts: [dip] },
        { atMin: 20, counts: [dip] },
        { atMin: 35, counts: [dip] }, // 25 min of dip — still verified
      ],
      physics,
    );
    expect(finalStates[0].state).toBe("verified");
    expect(allEvents.map((e) => e.event)).toEqual([
      "transition:closed→verified",
    ]);
  });
});
