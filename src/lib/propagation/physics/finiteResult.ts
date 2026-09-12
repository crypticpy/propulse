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
 * TWO GUARDS AGAINST A HOSTILE VALUE, NOT JUST A CORRUPTED ONE (Codex P2,
 * #954 slice D). `value` is not always this module's own output: `fM.ts` and
 * `fL.ts` embed a caller-injected sampler's state (`LongPathMufState`) into
 * the resolved record, and a `LongPathMufSampler` is an arbitrary function
 * the type system cannot police at runtime. A hostile sampler can return an
 * object that still has finite `foF2MHz`/`m3000F2`/`gyrofrequency300kmMHz`
 * fields, so the bounds checks at the sampler boundary pass, while also
 * carrying extra properties a plain-data record would never have:
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
 */

export interface NonFiniteField {
  /** Dotted-and-bracketed path to the offending field, e.g. `terms.gain`. */
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
  return walk(value, path, 0, new WeakSet());
}

function walk(
  value: unknown,
  path: string,
  depth: number,
  seen: WeakSet<object>,
): NonFiniteField | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : { path: path || "value", value };
  }
  if (value === null || typeof value !== "object") return null;
  if (depth > MAX_DEPTH) return null;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = walk(
        value[index],
        `${path}[${String(index)}]`,
        depth + 1,
        seen,
      );
      if (found !== null) return found;
    }
    return null;
  }
  for (const [key, inner] of Object.entries(value)) {
    const found = walk(inner, path ? `${path}.${key}` : key, depth + 1, seen);
    if (found !== null) return found;
  }
  return null;
}
