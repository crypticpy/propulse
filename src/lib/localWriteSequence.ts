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
