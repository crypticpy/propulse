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
import { useVerdictStore, type VerdictIngestInput } from "./verdictStore";
import { UPGRADE_HOLD_MS } from "@/lib/verdict/stateMachine";
import type { VerdictInputs } from "@/lib/verdict/verdictEngine";

const originalState = useVerdictStore.getState();

function evalFor(
  overrides: Partial<VerdictInputs> = {},
  kp = 3,
  sfi = 100,
): VerdictIngestInput {
  return {
    inputs: {
      band: "20m",
      physicsScore: 0.7,
      spotCount: 5,
      uniqueSpotters: 3,
      windowMinutes: 30,
      ...overrides,
    },
    kp,
    sfi,
  };
}

describe("verdictStore", () => {
  beforeEach(() => {
    useVerdictStore.setState(originalState, true);
  });

  it("initializes the stable verdict immediately on first ingest (no hold)", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor()], now);

    const state = useVerdictStore.getState();
    expect(state.getStableVerdict("20m")).toBe("confirmed");
    expect(state.machines["20m"].stableSince).toBe(now);
    expect(state.log).toHaveLength(0);
  });

  it("a changed raw verdict does not flip the stable verdict before its hold elapses", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor()], now);
    expect(useVerdictStore.getState().getStableVerdict("20m")).toBe(
      "confirmed",
    );

    // Physics closes but spots still confirm -> raw becomes "surprise"
    // (physicsOpen exits at <0.3, spotConfirmed exit at >=1)
    useVerdictStore
      .getState()
      .ingest([evalFor({ physicsScore: 0.1 })], now + 60_000);

    const state = useVerdictStore.getState();
    expect(state.getStableVerdict("20m")).toBe("confirmed");
    expect(state.machines["20m"].candidate).toBe("surprise");
    expect(state.log).toHaveLength(0);
  });

  it("upgrades flip after the upgrade hold and write a log entry with correct from/to", () => {
    const now = 1_000_000;
    // First ingest with a closed evaluation to establish a "closed" stable verdict.
    useVerdictStore
      .getState()
      .ingest(
        [evalFor({ physicsScore: 0.1, spotCount: 0, uniqueSpotters: 0 })],
        now,
      );
    expect(useVerdictStore.getState().getStableVerdict("20m")).toBe("closed");

    // Now consistently feed a strong "confirmed" evaluation.
    const upgradeInput = evalFor({
      physicsScore: 0.9,
      spotCount: 10,
      uniqueSpotters: 5,
    });
    useVerdictStore.getState().ingest([upgradeInput], now + 1000);
    expect(useVerdictStore.getState().getStableVerdict("20m")).toBe("closed");

    // Feed again after the hold elapses -> should flip.
    const flipTime = now + 1000 + UPGRADE_HOLD_MS;
    useVerdictStore.getState().ingest([upgradeInput], flipTime);

    const state = useVerdictStore.getState();
    expect(state.getStableVerdict("20m")).toBe("confirmed");
    expect(state.log).toHaveLength(1);
    expect(state.log[0].from).toBe("closed");
    expect(state.log[0].to).toBe("confirmed");
    expect(state.log[0].band).toBe("20m");
    expect(state.log[0].at).toBe(flipTime);
  });

  it("caps the log at 200 entries", () => {
    const now = 1_000_000;
    useVerdictStore.getState().ingest([evalFor({ physicsScore: 0.1 })], now);

    // Seed 250 recent (well within the 48h window) fake log entries directly,
    // then trigger a no-op ingest (raw === stable, no flip) to run pruning.
    const seeded = Array.from({ length: 250 }, (_, i) => ({
      id: `seed-${i}`,
      band: "20m",
      at: now - i * 1000,
      from: "closed" as const,
      to: "confirmed" as const,
      why: [],
      kp: 3,
      sfi: 100,
      physicsScore: 0.5,
      spotCount: 1,
    }));
    useVerdictStore.setState({ log: seeded });
    expect(useVerdictStore.getState().log).toHaveLength(250);

    useVerdictStore
      .getState()
      .ingest([evalFor({ physicsScore: 0.1 })], now + 1000);

    expect(useVerdictStore.getState().log.length).toBeLessThanOrEqual(200);
  });

  it("persists hysteresis edges: a mid-band physics score after opening stays open", () => {
    const now = 1_000_000;
    // Enter open at 0.9 (>= 0.4 ENTER threshold).
    useVerdictStore
      .getState()
      .ingest([evalFor({ physicsScore: 0.9, spotCount: 0, uniqueSpotters: 0 })], now);
    expect(useVerdictStore.getState().results["20m"].physicsOpen).toBe(true);

    // Feed a mid-band score (0.35) that is below ENTER (0.4) but above EXIT
    // (0.3) — hysteresis should keep it open.
    useVerdictStore
      .getState()
      .ingest(
        [evalFor({ physicsScore: 0.35, spotCount: 0, uniqueSpotters: 0 })],
        now + 60_000,
      );

    expect(useVerdictStore.getState().results["20m"].physicsOpen).toBe(true);
    expect(useVerdictStore.getState().edges["20m"].physicsOpen).toBe(true);
  });
});
