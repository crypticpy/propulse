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
 */

export interface NonFiniteField {
  /** Dotted-and-bracketed path to the offending field, e.g. `terms.gain`. */
  readonly path: string;
  readonly value: number;
}

/**
 * The first non-finite number in `value`'s own tree, or null when every
 * number in it is finite.
 *
 * `null` fields (used throughout this slice to mean "not applicable to this
 * regime") are skipped rather than flagged: a leaf that deliberately reports
 * no answer for a field is not the corruption this guards against.
 */
export function firstNonFiniteField(
  value: unknown,
  path = "",
): NonFiniteField | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : { path: path || "value", value };
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstNonFiniteField(
        value[index],
        `${path}[${String(index)}]`,
      );
      if (found !== null) return found;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      const found = firstNonFiniteField(inner, path ? `${path}.${key}` : key);
      if (found !== null) return found;
    }
    return null;
  }
  return null;
}
