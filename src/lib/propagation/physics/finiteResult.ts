/**
 * A cross-cutting invariant for every slice D leaf that returns a resolved
 * result (PROP-08, #954 slice D).
 *
 * A sampler or an upstream leaf can answer with values that are individually
 * finite and individually within their own physical domain and still combine,
 * through a division or a cube root of a ratio, into an overflowed or NaN
 * derived quantity that a bounds check on the inputs alone cannot see. Rather
 * than adding another input check at whatever site the next overflow is found
 * in, every leaf checks its own assembled result once, at the point the
 * result is built: no resolved result may carry a non-finite number anywhere
 * in its own tree.
 *
 * The walk is generic on purpose, descending into arrays and plain objects, so
 * one implementation serves every leaf's own result shape without knowing
 * what that shape is. It reports the first non-finite number it finds,
 * dotted-and-bracketed by path (`controlPoints[0].kFactor`), so the message a
 * caller sees names the exact field that overflowed rather than only the
 * leaf's name.
 *
 * THREE GUARDS AGAINST A HOSTILE VALUE, NOT JUST A CORRUPTED ONE (Codex P2,
 * #954 slice D). `value` is not always this module's own output: `fM.ts` and
 * `fL.ts` embed a caller-injected sampler's state (`LongPathMufState`) into
 * the resolved record, and a `LongPathMufSampler` is an arbitrary function
 * the type system cannot police at runtime. A hostile sampler can return an
 * object that still has finite `foF2MHz`/`m3000F2`/`gyrofrequency300kmMHz`
 * fields, so the bounds checks at the sampler boundary pass, while also
 * carrying extra properties a plain-data record would never have. (`fM.ts`
 * now also copies the three validated fields into a fresh literal before
 * storing them, so this walk is a second line of defence rather than the
 * only one, and stays in place for whatever the next leaf gets wrong.)
 *
 *  - A self-reference (`state.self = state`) turns the recursive walk into an
 *    infinite loop, which is a stack-overflow `RangeError`, not the labelled
 *    `unsupported` record the finite-result invariant promises. Guarded by a
 *    `WeakSet` of every object already entered on this walk: revisiting one
 *    is a no-op rather than another descent. This is safe even for a
 *    legitimately shared (non-cyclic) object referenced from two places in
 *    the tree, because it is the same reference both times, so whatever the
 *    first visit found (or did not find) inside it is what the second visit
 *    would find too.
 *  - A long non-cyclic chain (no repeated object, just many links) is not
 *    caught by the `WeakSet` and could still drive the walk arbitrarily
 *    deep. Guarded by `MAX_DEPTH`: descent stops past that many container
 *    boundaries and the subtree beyond it is treated as if it had nothing to
 *    report. The deepest a numeric field sits in this slice's own resolved
 *    records today is `controlPoints[i].hours[j].state.foF2MHz` in
 *    `ResolvedLongPathMuf`, six container boundaries down from the record
 *    root (`controlPoints` -> `[i]` -> `hours` -> `[j]` -> `state` ->
 *    `foF2MHz`); `MAX_DEPTH` leaves two boundaries of headroom above that.
 *  - The two guards above bound depth, not breadth: a wide, shallow,
 *    non-cyclic fan-out passes both. Concretely, a sampler can return
 *    `padding: new Array(0xffffffff)` alongside its three valid fields; that
 *    array is finite in depth (one boundary) and has no repeated reference,
 *    so neither guard fires, yet visiting every one of its ~4.29 billion
 *    indices before answering is not a bounded walk. Guarded by
 *    `MAX_TOTAL_VISITS`, a budget on the total number of array/object/number
 *    nodes the whole walk may visit; see the constant for how it was sized.
 *    A sparse array's declared `.length` is checked against the remaining
 *    budget before a single element is touched, so an array that lies
 *    about its own size is refused at once instead of metered one index at
 *    a time.
 */

export interface NonFiniteField {
  /**
   * Dotted-and-bracketed path to the offending field, e.g. `terms.gain`.
   * When the walk stopped because `MAX_TOTAL_VISITS` was exhausted rather
   * than because it found a non-finite number, this names the container it
   * was inside when the budget ran out and says so in plain words, so a
   * caller's generic "`${path}` is `${value}`, not a finite number" message
   * still reads as the refusal it is.
   */
  readonly path: string;
  readonly value: number;
}

/**
 * How many container boundaries (array or object) the walk will cross below
 * the root before it stops descending. See the module comment: the deepest
 * numeric field this slice's own resolved records carry today is six
 * boundaries down, so this leaves two boundaries of headroom.
 */
const MAX_DEPTH = 8;

/**
 * Total array/object/number nodes `firstNonFiniteField` will visit across
 * one call before it gives up and reports the record as too large to
 * verify, on top of the `WeakSet` cycle guard and `MAX_DEPTH` above. See the
 * module comment's third guard for why depth and cycle guards alone are not
 * enough.
 *
 * Sized against the largest resolved record this slice produces today:
 * `ResolvedLongPathFieldStrength` (which embeds `ResolvedLongPathMuf` and
 * `ResolvedLongPathLuf` in full, including both control points' 24-hour
 * tables) measures 759 nodes by this same counting rule -- one per number,
 * one per array, one per plain object, root included -- for the golden
 * London-to-Cape-Town long-path fixture in `fieldStrengthLong.test.ts`.
 * 4096 leaves more than 5x headroom above that measured size for any
 * legitimate record this slice or a future one in the same family builds,
 * while still stopping a hostile sampler's billion-entry array cold.
 */
const MAX_TOTAL_VISITS = 4096;

interface VisitBudget {
  remaining: number;
}

/**
 * The first non-finite number in `value`'s own tree, or null when every
 * number in it is finite.
 *
 * `null` fields (used throughout this slice to mean "not applicable to this
 * regime") are skipped rather than flagged: a leaf that deliberately reports
 * no answer for a field is not the corruption this guards against. Functions
 * and symbol-keyed properties are never descended into; only arrays and
 * plain objects are.
 */
export function firstNonFiniteField(
  value: unknown,
  path = "",
): NonFiniteField | null {
  return walk(value, path, 0, new WeakSet(), { remaining: MAX_TOTAL_VISITS });
}

/**
 * The record was too large to finish verifying: `MAX_TOTAL_VISITS` ran out
 * before the walk reached every number in `value`'s tree. Reported the same
 * shape as an actual non-finite finding (`value` is `Infinity`, itself not
 * finite) so a caller that always builds its refusal message from
 * `.path`/`.value` needs no special case to treat this as a refusal too.
 */
function tooLarge(path: string): NonFiniteField {
  return {
    path:
      `${path || "value"} (more than ${String(MAX_TOTAL_VISITS)} entries ` +
      "were reached before the finite-result check could finish; the " +
      "record was too large to verify)",
    value: Number.POSITIVE_INFINITY,
  };
}

function walk(
  value: unknown,
  path: string,
  depth: number,
  seen: WeakSet<object>,
  budget: VisitBudget,
): NonFiniteField | null {
  if (budget.remaining <= 0) return tooLarge(path);
  budget.remaining -= 1;
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : { path: path || "value", value };
  }
  if (value === null || typeof value !== "object") return null;
  if (depth > MAX_DEPTH) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    // A sparse array can declare a `.length` far larger than the storage it
    // actually holds (`new Array(0xffffffff)` allocates nothing). Check
    // that declared length against the remaining budget before iterating
    // even one element, so an oversized array is refused at once rather
    // than metered one index at a time; a legitimate array's length is
    // exactly the number of elements the loop below is about to visit
    // anyway, so this changes nothing for one within budget.
    if (value.length > budget.remaining) return tooLarge(path);
    for (const [index, item] of value.entries()) {
      const found = walk(
        item,
        `${path}[${String(index)}]`,
        depth + 1,
        seen,
        budget,
      );
      if (found !== null) return found;
    }
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length > budget.remaining) return tooLarge(path);
  for (const [key, inner] of entries) {
    const found = walk(
      inner,
      path ? `${path}.${key}` : key,
      depth + 1,
      seen,
      budget,
    );
    if (found !== null) return found;
  }
  return null;
}
