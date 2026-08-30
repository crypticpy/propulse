import { beforeEach, describe, expect, it } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { vi } from "vitest";
import {
  useVerdictStore,
  scopeBandKey,
  FADING_STREAK_THRESHOLD,
  type LadderIngestInput,
} from "./verdictStore";
import { UPGRADE_HOLD_MS } from "@/lib/verdict/stateMachine";
import type { LadderInputs } from "@/lib/verdict/ladder";

const originalState = useVerdictStore.getState();

const SCOPE = "regional:NA";
const KEY = scopeBandKey(SCOPE, "20m");

/** Verified-grade inputs by default: 8 obs / 4 reporters, steady rate. */
function evalFor(
  overrides: Partial<LadderInputs> = {},
  kp = 3,
  sfi = 100,
): LadderIngestInput {
  return {
    scopeId: SCOPE,
    band: "20m",
    inputs: {
      physicsScore: 0.7,
      obs20m: 8,
      reporters20m: 4,
      count10mRecent: 4,
      count10mPrior: 4,
      ...overrides,
    },
    kp,
    sfi,
  };
}

const CLOSED: Partial<LadderInputs> = {
  physicsScore: 0.1,
  obs20m: 0,
  reporters20m: 0,
  count10mRecent: 0,
  count10mPrior: 0,
};

describe("verdictStore", () => {
  beforeEach(() => {
    useVerdictStore.setState(originalState, true);
  });

  it("initializes the stable state immediately on first ingest (no hold)", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor()], now);

    const state = useVerdictStore.getState();
    expect(state.getStableState(SCOPE, "20m")).toBe("verified");
    expect(state.machines[KEY].stableSince).toBe(now);
    expect(state.log).toHaveLength(0);
  });

  it("keys machines by scope: the same band in two scopes is independent", () => {
    const now = 1_000_000;
    useVerdictStore
      .getState()
      .ingest([evalFor(), { ...evalFor(CLOSED), scopeId: "global" }], now);

    const state = useVerdictStore.getState();
    expect(state.getStableState(SCOPE, "20m")).toBe("verified");
    expect(state.getStableState("global", "20m")).toBe("closed");
  });

  it("a changed raw state does not flip the stable state before its hold elapses", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor()], now);
    expect(useVerdictStore.getState().getStableState(SCOPE, "20m")).toBe(
      "verified",
    );

    // Rising trend while verified -> raw becomes "hot", held 5 min.
    useVerdictStore
      .getState()
      .ingest(
        [evalFor({ count10mRecent: 10, count10mPrior: 4 })],
        now + 60_000,
      );

    const state = useVerdictStore.getState();
    expect(state.getStableState(SCOPE, "20m")).toBe("verified");
    expect(state.machines[KEY].candidate).toBe("hot");
    expect(state.log).toHaveLength(0);
  });

  it("upgrades flip after the upgrade hold and write a log entry with correct from/to", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor(CLOSED)], now);
    expect(useVerdictStore.getState().getStableState(SCOPE, "20m")).toBe(
      "closed",
    );

    // Now consistently feed a verified-grade evaluation.
    const upgradeInput = evalFor();
    useVerdictStore.getState().ingest([upgradeInput], now + 1000);
    expect(useVerdictStore.getState().getStableState(SCOPE, "20m")).toBe(
      "closed",
    );

    // Feed again after the hold elapses -> should flip.
    const flipTime = now + 1000 + UPGRADE_HOLD_MS;
    useVerdictStore.getState().ingest([upgradeInput], flipTime);

    const state = useVerdictStore.getState();
    expect(state.getStableState(SCOPE, "20m")).toBe("verified");
    expect(state.log).toHaveLength(1);
    expect(state.log[0].from).toBe("closed");
    expect(state.log[0].to).toBe("verified");
    expect(state.log[0].band).toBe("20m");
    expect(state.log[0].scopeId).toBe(SCOPE);
    expect(state.log[0].at).toBe(flipTime);
  });

  it("tracks falling streaks per scoped band for the Fading modifier", () => {
    const now = 1_000_000;
    const falling = evalFor({ count10mRecent: 1, count10mPrior: 4 });

    useVerdictStore.getState().ingest([falling], now);
    expect(useVerdictStore.getState().fallingStreaks[KEY]).toBe(1);

    useVerdictStore.getState().ingest([falling], now + 60_000);
    expect(useVerdictStore.getState().fallingStreaks[KEY]).toBe(
      FADING_STREAK_THRESHOLD,
    );

    // A steady evaluation resets the streak.
    useVerdictStore.getState().ingest([evalFor()], now + 120_000);
    expect(useVerdictStore.getState().fallingStreaks[KEY]).toBe(0);
  });

  it("caps the log at 200 entries", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor(CLOSED)], now);

    // Seed 250 recent (well within the 48h window) fake log entries directly,
    // then trigger a no-op ingest (raw === stable, no flip) to run pruning.
    const seeded = Array.from({ length: 250 }, (_, i) => ({
      id: `seed-${i}`,
      scopeId: SCOPE,
      band: "20m",
      at: now - i * 1000,
      from: "closed" as const,
      to: "verified" as const,
      why: [],
      kp: 3,
      sfi: 100,
    }));
    useVerdictStore.setState({ log: seeded });
    expect(useVerdictStore.getState().log).toHaveLength(250);

    useVerdictStore.getState().ingest([evalFor(CLOSED)], now + 1000);

    expect(useVerdictStore.getState().log.length).toBeLessThanOrEqual(200);
  });

  it("persists hysteresis edges: a mid-band physics score after opening stays open", () => {
    const now = 1_000_000;
    // Enter open at 0.9 (>= 0.4 ENTER threshold), no activity -> forecast.
    useVerdictStore
      .getState()
      .ingest([evalFor({ ...CLOSED, physicsScore: 0.9 })], now);
    expect(useVerdictStore.getState().results[KEY].evaluation.physicsOpen).toBe(
      true,
    );

    // Feed a mid-band score (0.35) that is below ENTER (0.4) but above EXIT
    // (0.3) — hysteresis should keep it open.
    useVerdictStore
      .getState()
      .ingest([evalFor({ ...CLOSED, physicsScore: 0.35 })], now + 60_000);

    expect(useVerdictStore.getState().results[KEY].evaluation.physicsOpen).toBe(
      true,
    );
    expect(useVerdictStore.getState().edges[KEY].physicsOpen).toBe(true);
  });

  it("persists verified hysteresis: a dip to 3 obs keeps verified raw", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor()], now);
    expect(useVerdictStore.getState().results[KEY].evaluation.verified).toBe(
      true,
    );

    // 3 obs / 1 reporter is under the enter bar (6/3) but over exit (>2) —
    // reporters only gate entry, so verified holds.
    useVerdictStore
      .getState()
      .ingest([evalFor({ obs20m: 3, reporters20m: 1 })], now + 60_000);

    expect(useVerdictStore.getState().results[KEY].evaluation.verified).toBe(
      true,
    );
    expect(useVerdictStore.getState().getStableState(SCOPE, "20m")).toBe(
      "verified",
    );
  });

  it("flags surprise when activity appears while the forecast says closed", () => {
    const now = 1_000_000;
    useVerdictStore
      .getState()
      .ingest([evalFor({ physicsScore: 0.1, obs20m: 2, reporters20m: 2 })], now);

    const result = useVerdictStore.getState().results[KEY];
    expect(result.evaluation.state).toBe("stirring");
    expect(result.evaluation.surprise).toBe(true);
  });
});
