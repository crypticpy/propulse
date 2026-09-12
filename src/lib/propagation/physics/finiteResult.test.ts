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

/**
 * Codex P2, round 3 (`finiteResult.ts` line 95, #954 slice D): the `WeakSet`
 * cycle guard and `MAX_DEPTH` above both bound how deep the walk goes, not
 * how wide it fans out at one level. A hostile `LongPathMufSampler` can
 * return its three valid fields plus a sparse `padding: new
 * Array(0xffffffff)`: one container boundary, no repeated reference, and
 * yet naively iterating it means visiting billions of indices before
 * `longPathMuf` ever returns. `MAX_TOTAL_VISITS` is the guard against that.
 */
describe("firstNonFiniteField's total-visit budget", () => {
  it("refuses a record holding a huge sparse array immediately, rather than iterating it", () => {
    const record = { padding: new Array(0xffffffff) };

    const startMs = performance.now();
    const found = firstNonFiniteField(record);
    const elapsedMs = performance.now() - startMs;

    expect(found).not.toBeNull();
    expect(found?.value).toBe(Number.POSITIVE_INFINITY);
    expect(found?.path).toContain("padding");
    expect(found?.path).toContain("too large to verify");
    // The array's declared length is checked against the budget before a
    // single element is touched; if this instead iterated toward
    // 0xffffffff, it would not finish in this test's lifetime, let alone
    // under 100 ms.
    expect(elapsedMs).toBeLessThan(100);
  });

  it("verifies a record that exactly fills the budget and refuses one that needs one entry more", () => {
    // The walk spends one visit entering the record itself, leaving
    // `MAX_TOTAL_VISITS - 1` for its entries; that many all-finite entries
    // exactly exhausts the budget and still verifies (every entry was
    // actually visited), while one entry more is refused up front, before
    // any entry is visited, because the record's own entry count already
    // exceeds what remains. `MAX_TOTAL_VISITS` is mirrored here rather than
    // imported so the number stays this module's own implementation
    // detail, not a public constant callers can lean on.
    const MAX_TOTAL_VISITS = 4096;

    function recordWithEntries(count: number): Record<string, number> {
      const record: Record<string, number> = {};
      for (let i = 0; i < count; i += 1) {
        record[`n${String(i)}`] = 0;
      }
      return record;
    }

    expect(
      firstNonFiniteField(recordWithEntries(MAX_TOTAL_VISITS - 1)),
    ).toBeNull();

    const refused = firstNonFiniteField(recordWithEntries(MAX_TOTAL_VISITS));
    expect(refused).not.toBeNull();
    expect(refused?.value).toBe(Number.POSITIVE_INFINITY);
    expect(refused?.path).toContain("too large to verify");
  });
});
