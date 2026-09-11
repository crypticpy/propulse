/**
 * A counter that numbers the writes *this window applied*, in the order it
 * applied them (#859 rounds 4, 9, 10 and 11).
 *
 * The wall reconciles two stamps on mount — the operating cursor's and the
 * map target's — and needs to know which of the two happened second.
 * Neither clock can tell it:
 *
 * - `Date.now()` is too coarse. A local `mapStore.setTarget` and a cursor
 *   arriving over the transport are processed in the same event-loop turn
 *   often enough to land in the same millisecond, and a strict `>` on equal
 *   timestamps silently keeps the older value (round 4).
 * - `Date.now()` is not monotonic. An NTP correction or a manual clock
 *   change steps it backwards mid-session, and then a write made later
 *   carries the smaller timestamp and loses to an earlier one (round 9).
 *
 * This counter is both fine-grained and monotonic, so it is the *primary*
 * ordering and the clock is only the fallback.
 *
 * **It numbers application order in one window, and is never comparable
 * outside it** (round 11). Round 10 tried to make it a Lamport clock, carried
 * on the wire and raised on receipt, so that two windows could compare their
 * counters directly. That is unsound here: the operating channel spans
 * *devices* — a phone, a workstation and this wall each run their own
 * counter, and a phone that has never heard from this window mints numbers
 * with no relation to its own. Observing the sequences that do arrive cannot
 * fix that; it only hides it, because an unseen writer's lower number is not
 * evidence that its write was earlier.
 *
 * So nothing minted here ever leaves the window. Every stamp compared against
 * another is minted by this counter, at the moment this window applied the
 * event:
 *
 * - a local gesture (`mapStore.setTarget`, `operatingStateStore.writeField`)
 *   takes a number when it is made;
 * - a cursor patch accepted by `mergePatch` — local, relayed or from another
 *   device — takes a number when it is *applied*, not one the writer sent;
 * - a map target applied from a workspace snapshot takes a number when it is
 *   applied, provided the sender stamped it at all.
 *
 * The result is a total order over what this window observed, which is the
 * only ordering it can honestly claim, and it needs no clock. Value
 * freshness is a separate question, settled before any of this by
 * `beats()` on the wire `(at, by)` and by `targetSetAt`; this counter only
 * says which accepted event landed here second.
 *
 * Not persisted, and reset to `0` on reload — sound because a reload also
 * drops every stamp minted from it.
 */
let lastLocalWriteSeq = 0;

/**
 * Mints the number for something applied *here*, now. Strictly increasing
 * for the life of the window, so two numbers from it can always be ordered
 * and can never be equal.
 */
export function nextLocalWriteSeq(): number {
  lastLocalWriteSeq += 1;
  return lastLocalWriteSeq;
}
