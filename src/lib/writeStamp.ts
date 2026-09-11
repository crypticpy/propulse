/**
 * One reading of "when was this written", shared by every site that treats a
 * timestamp as evidence that a write happened (#859 round 16).
 *
 * Three spellings mean the same thing — *never written* — and they all have
 * to be read the same way or a screen ends up ranking a window that has never
 * touched the target above one that has:
 *
 * - `undefined`: no stamp at all. A snapshot from a bundle too old to send
 *   one, or a field this window has deliberately left unclaimed.
 * - `0`: the sentinel `mapStore` used for "no target has ever been set", and
 *   what a peer on an older bundle still sends. It is not a write time; it is
 *   the absence of one, spelled with a number.
 * - anything non-finite: not a time either.
 *
 * The operating store applies the same rule to the wire stamp (`at === 0` is
 * a field never written, which `currentPatch` does not even relay), so both
 * channels now agree on what counts as a write.
 *
 * A stamp that does not exist never outranks one that does, never mints an
 * application sequence, and is not evidence of "nothing to lose" either.
 */
export function writtenAt(stamp: number | undefined): number | undefined {
  if (stamp === undefined || !Number.isFinite(stamp) || stamp === 0) {
    return undefined;
  }
  return stamp;
}
