/**
 * One monotonic counter for local writes that later have to be ordered
 * against each other (#859 round 4).
 *
 * `Date.now()` alone is not enough: two writes can land in the same
 * millisecond — a local `mapStore.setTarget` and an operating cursor
 * arriving over the transport are processed in the same event-loop turn
 * often enough for it to be reachable — and a strict `>` on equal
 * timestamps silently keeps the older value. Every local write also takes a
 * sequence number from here, so a tie on the millisecond is broken by which
 * write actually happened second.
 *
 * It is also the *primary* ordering, not just a tie-break (#859 round 9).
 * `Date.now()` is not monotonic: an NTP correction or a manual clock change
 * can step it backwards mid-session, and then a write made later carries the
 * smaller timestamp and loses to an earlier one. This counter cannot go
 * backwards. So the rule for anything ordering two local writes is:
 *
 * 1. both sides carry a sequence from this window → the sequence decides;
 * 2. one side does not → fall back to the timestamps, which is only sound
 *    because the two windows involved share a machine's clock.
 *
 * Case 2 exists only for a value relayed from another window of the same app,
 * which keeps the stamp it arrived with rather than being re-stamped here —
 * a fresh local sequence would be a claim that this window wrote it. Keeping
 * every genuinely local write path stamped is what keeps case 2 rare.
 *
 * Module scope, one per browsing context, and deliberately never sent on the
 * wire or persisted: the numbers only mean anything within a single window's
 * lifetime, and comparing one window's against another's would be worse than
 * comparing nothing. Reset to `0` on reload, which is fine — every value it
 * is compared against is reset with it.
 */
let lastLocalWriteSeq = 0;

/** The next sequence number. Strictly increasing for the life of the window. */
export function nextLocalWriteSeq(): number {
  lastLocalWriteSeq += 1;
  return lastLocalWriteSeq;
}
