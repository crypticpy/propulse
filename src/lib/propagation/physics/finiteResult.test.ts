// @vitest-environment node

import { describe, expect, it } from "vitest";

import { firstNonFiniteField } from "./finiteResult";

/**
 * Codex P2 (`finiteResult.ts` line 55, #954 slice D): a hostile
 * `LongPathMufSampler` state embedded in a resolved record can carry extra
 * properties beyond its three required numeric fields, including a
 * self-reference. The recursive walk must terminate on that cycle rather
 * than recurse until a stack-overflow `RangeError`, and it must not be
 * driveable arbitrarily deep by a long non-cyclic chain either.
 */
describe("firstNonFiniteField against a hostile object graph", () => {
  it("terminates on a self-referential object with all-finite fields, reporting nothing", () => {
    const state: Record<string, unknown> = {
      foF2MHz: 8,
      m3000F2: 3,
      gyrofrequency300kmMHz: 1.2,
    };
    state.self = state;
    const record = { controlPoints: [{ state }] };

    expect(() => firstNonFiniteField(record)).not.toThrow();
    expect(firstNonFiniteField(record)).toBeNull();
  });

  it("still finds the offending field when the self-referential state also has one", () => {
    const state: Record<string, unknown> = {
      foF2MHz: 8,
      m3000F2: Number.NaN,
      gyrofrequency300kmMHz: 1.2,
    };
    state.self = state;
    const record = { controlPoints: [{ state }] };

    const found = firstNonFiniteField(record);
    expect(found).not.toBeNull();
    expect(found?.path).toBe("controlPoints[0].state.m3000F2");
    expect(found?.value !== undefined && Number.isNaN(found.value)).toBe(
      true,
    );
  });

  it("does not throw on a non-cyclic chain far deeper than both the depth cap and the JS call stack", () => {
    // 50 000 links has no repeated object (so the WeakSet cycle guard never
    // fires) and is well past typical JS recursion limits (~10 000-15 000
    // frames); only the depth cap keeps this from overflowing the stack.
    let chain: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 50_000; i += 1) {
      chain = { next: chain };
    }

    expect(() => firstNonFiniteField(chain)).not.toThrow();
    // Past the cap the walk stops descending, so a non-finite value buried
    // deeper than the cap is not found; that is the accepted trade-off for
    // never overflowing the stack on an adversarial chain.
    expect(firstNonFiniteField(chain)).toBeNull();
  });

  it("still finds a non-finite field beneath a shared, non-cyclic object referenced twice", () => {
    const shared = { gain: Number.POSITIVE_INFINITY };
    const record = { first: shared, second: shared };

    const found = firstNonFiniteField(record);
    expect(found).not.toBeNull();
    expect(found?.path).toBe("first.gain");
    expect(found?.value).toBe(Number.POSITIVE_INFINITY);
  });
});
