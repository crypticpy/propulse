/**
 * A Lamport clock for the writes this app has to order against each other
 * (#859 rounds 4, 9 and 10).
 *
 * `Date.now()` alone is not enough: two writes can land in the same
 * millisecond — a local `mapStore.setTarget` and an operating cursor
 * arriving over the transport are processed in the same event-loop turn
 * often enough for it to be reachable — and a strict `>` on equal
 * timestamps silently keeps the older value. Every local write also takes a
 * sequence number from here, so a tie on the millisecond is broken by which
 * write actually happened second.
 *
 * It is the *primary* ordering, not a tie-break (#859 round 9).
 * `Date.now()` is not monotonic: an NTP correction or a manual clock change
 * can step it backwards mid-session, and then a write made later carries the
 * smaller timestamp and loses to an earlier one. This counter cannot go
 * backwards.
 *
 * Round 9 made it local-only, which meant anything crossing a window lost its
 * sequence and fell back to that same clock — so the fix held inside one
 * window and nowhere else. It is therefore a **Lamport clock** (round 10),
 * which is the smallest thing that orders writes across windows without one:
 *
 * - a local gesture mints a sequence with `nextLocalWriteSeq()`;
 * - the sequence travels with the write it stamps — a map target on the
 *   workspace channel, a cursor field on the operating channel;
 * - a receiver calls `observeRemoteWriteSeq()` before applying, so its own
 *   counter is at least as high as anything it has seen, and keeps the
 *   sender's sequence on the value rather than minting a new one.
 *
 * A window that has seen a write can therefore never mint a sequence below
 * it, so "higher sequence" means "written after, as far as anyone here can
 * tell" no matter which window wrote it. Two sequences are comparable across
 * windows; only *equality* is ambiguous, and equality is treated as a no-op
 * rather than a win for either side.
 *
 * Not persisted, and reset to `0` on reload — sound because a reload also
 * drops every value stamped with it, and the first message from any peer
 * pulls the counter back up.
 */
let lastLocalWriteSeq = 0;

/**
 * Mints the sequence for a write made *here*. Strictly increasing for the
 * life of the window, and — because every sequence seen from a peer has been
 * observed — above every write this window knows about.
 */
export function nextLocalWriteSeq(): number {
  lastLocalWriteSeq += 1;
  return lastLocalWriteSeq;
}

/**
 * Takes account of a sequence minted elsewhere, before the write carrying it
 * is applied. The next local write then sorts above it, which is what makes
 * the numbers comparable between windows at all.
 *
 * Ignores anything non-finite: a peer on an older bundle sends no sequence,
 * and a malformed one must not be able to shove the counter to `Infinity`
 * and make every later local write unorderable.
 */
export function observeRemoteWriteSeq(seq: number | undefined): void {
  if (typeof seq !== "number" || !Number.isFinite(seq)) return;
  lastLocalWriteSeq = Math.max(lastLocalWriteSeq, seq);
}
