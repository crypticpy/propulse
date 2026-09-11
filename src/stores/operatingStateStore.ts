/**
 * Shared operating state (#658, delivers the #633 PoC).
 *
 * Widgets are nouns, workflows are verbs. This store holds the *verb*: one
 * workflow cursor — session · band · target · selected contact — that every
 * canvas on every screen of one operator reads and writes, plus the register
 * of which screens are live and what each can do.
 *
 * Rules that make several writers safe:
 * - **Last writer wins per field**, not per message: a phone setting `target`
 *   never clobbers the workstation's `band`. Each field carries a `{ at, by }`
 *   stamp; a remote write applies only when it is strictly newer, with the
 *   sender id breaking same-millisecond ties so every screen converges on the
 *   same answer regardless of arrival order.
 * - **Own echoes are ignored** on `senderId`. `deviceId` is generated per
 *   browsing context and deliberately *not* persisted: two tabs of one
 *   browser share `localStorage`, and a shared id would make each tab discard
 *   the other's messages as its own.
 * - **The kill switch is absolute.** With "Follow my other screens" off this
 *   store neither posts nor applies anything remote; local state still works.
 * - Nothing but state, commands, a sender id and a timestamp goes on the
 *   wire. See `src/lib/workspace/operatingChannel.ts`.
 *
 * `opsPostureStore` is a *writer* into this store, not a second source of
 * truth: its `contactCallsign` / `contactBand` are a projection of
 * `cursor.contact` (it subscribes here and mirrors down), so the 19 existing
 * consumers keep their current selectors.
 */

import { create } from "zustand";
import { nextLocalWriteSeq } from "@/lib/localWriteSequence";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  CURSOR_FIELDS,
  OPERATING_PROTOCOL_VERSION,
  createBroadcastTransport,
  type CursorField,
  type CursorPatch,
  type OperatingCommand,
  type OperatingContact,
  type OperatingMessage,
  type OperatingPayload,
  type OperatingTarget,
  type OperatingTransport,
  type SpotRef,
  type WorkflowCursor,
  type WorkspaceCapabilities,
  type WorkspaceRegistration,
} from "@/lib/workspace/operatingChannel";
import type { CanvasType } from "@/lib/workspace/types";

/** A screen that has not spoken for this long is no longer shown as live. */
export const REGISTRATION_TTL_MS = 90_000;

/**
 * How often a registered screen re-announces itself. A third of the TTL, so
 * two heartbeats can be lost before the other screens drop it from the
 * roster — and so a screen left open past the TTL does not silently vanish
 * from it, which is what happened when `lastSeen` was written only once.
 */
export const REGISTRATION_HEARTBEAT_MS = REGISTRATION_TTL_MS / 3;

/**
 * The ordering rule, in one place (#859 round 13). Everything in the cursor
 * pipeline follows it, and the hooks that mirror the cursor onto the map
 * (`useHamClockWallOperatingState`, `useMapOperationalContext`) point here.
 *
 * **A stamp is what orders writes. A value never does.**
 *
 * Concretely:
 *
 * - `null` is a value like any other. Clearing the cursor target, or clearing
 *   the map target, is a write: it carries a stamp and it beats everything
 *   older. A reconcile that skips a null because "there is nothing to apply"
 *   silently keeps a target the operator explicitly cleared.
 * - An equal value is still a write. Re-picking what is already held moves
 *   the stamp forward, and peers must move with it. The only exception is one
 *   message arriving twice (same `at`, same value), which is not a second
 *   write at all.
 * - The one thing that is not a write is a write arriving twice: an
 *   *identical value at an identical stamp* is a replay, and a replay never
 *   takes a number — not here, and not on the workspace channel, where a
 *   joining window makes every peer republish what it holds. Recognising it
 *   comes before any tie-break, or a relay would win the tie and mint on
 *   behalf of a write nobody made (#859 round 14).
 * - "Unstamped" means *no stamp exists* — `at === 0` here,
 *   `targetSetAt === undefined` on the map store — and nothing else. A stamp
 *   whose value is null, empty, or unchanged is still a stamp, and still
 *   orders.
 *
 * The cost of breaking it is always the same shape: a screen keeps a stale
 * target forever, because the newer write was classified as "nothing to do"
 * on the strength of what it carried instead of when it happened.
 */

/** Which write won a field, and when. */
export interface FieldStamp {
  /**
   * The *originating* screen's `Date.now()` at the moment of the write. This
   * is the wire value: it travels in the patch and orders the last-writer-wins
   * merge, so every screen resolves a conflict the same way. It is NOT this
   * screen's clock — a phone whose clock is a day off stamps a day off — so
   * never compare it against a locally produced timestamp. Use `appliedAt`.
   */
  at: number;
  /**
   * The screen that originally wrote the field — not whichever peer relayed
   * it. A `hello` reply carries the author along (`currentPatch`), so this
   * survives a relay and readers such as `HamClockWallCursorChip` name the
   * screen the operator actually used.
   *
   * Absent when the write arrived from a bundle too old to name an author
   * (#859 round 8). Unknown provenance is *kept* unknown rather than guessed
   * at from whoever happened to deliver it: a guess is indistinguishable
   * downstream from a first-hand claim, and `currentPatch` would relay it as
   * one, letting a third screen lose the equal-`at` tie-break to an id that
   * never wrote anything. `beats()` gives an authorless stamp a defined,
   * convergent place in the ordering instead.
   */
  by?: string;
  /**
   * The key this entry won its last equal-`at` comparison on: its author when
   * it named one, otherwise the id of whoever delivered it (#859 round 13).
   *
   * This is *not* authorship and must never be read as any. It is retained
   * for one reason: an equal-`at` comparison needs both sides' keys, and
   * before round 13 the incoming side's key was borrowed for the comparison
   * and then thrown away, so the *next* authorless write at the same `at` had
   * nothing to lose to and was accepted unconditionally. Two old tabs writing
   * in the same millisecond then settled differently on each receiver, and a
   * `hello` relay flipped them again.
   *
   * Local to this screen: `currentPatch` builds each wire entry field by
   * field and never includes it, so nothing downstream can mistake it for a
   * first-hand claim — which is round 8's promise kept. Not persisted either:
   * `partialize` keeps `followScreens` alone, so no stamp survives a reload
   * and the tie key cannot outlive the entry it belongs to.
   *
   * `""` on a field never written, which loses to every real key — the same
   * place `main` starts its `by` at.
   */
  tieKey: string;
  /**
   * This screen's `Date.now()` at the moment the write was *applied here*
   * (#859). Local-only: never sent on the wire (`currentPatch` sends `value`
   * and `at` only, never `appliedSeq`) and never persisted (`partialize` keeps
   * `followScreens` alone), so it is always in the receiving window's clock domain and can be
   * compared with other locally produced stamps such as
   * `mapStore.targetSetAt`. A locally originated write applies immediately,
   * so its `appliedAt` is the same moment as its `at`.
   */
  appliedAt: number;
  /**
   * Where this write falls in the order *this window applied things*:
   * `nextLocalWriteSeq()` taken at the moment `mergePatch` accepted it,
   * whatever its origin — a local `writeField`, a relayed `hello` reply, a
   * cursor from another device (#859 rounds 4, 9, 10, 11).
   *
   * Not the writer's number, and never sent on the wire. The operating
   * channel spans devices, and a counter minted on a phone is not comparable
   * with one minted here — round 10 carried it and compared it anyway, which
   * let an unseen peer's low number pass for an early write. The honest
   * ordering is this window's own, and it is exactly what the wall's mount
   * reconcile asks for: which of the cursor and `mapStore.targetSeq` —
   * minted from the same counter — landed here second.
   *
   * A rejected entry does not take a number: re-stamping a write already
   * held is what let a replay outrank a map target chosen in between
   * (round 5). `undefined` is a stamp that never went through the counter at
   * all, which loses to any stamp that did.
   */
  appliedSeq: number | undefined;
}

/** A command as it was received, for widgets that need to react to one. */
export interface ReceivedCommand {
  command: OperatingCommand;
  senderId: string;
  receivedAt: number;
}

export interface RegisterWorkspaceInput {
  workspaceId: string;
  canvasType: CanvasType;
  label: string;
  capabilities: WorkspaceCapabilities;
}

export interface OperatingStateStoreState {
  /** This browsing context. Never persisted, never sent anywhere but the channel. */
  deviceId: string;
  /** The kill switch. Persisted; off means this screen is fully local. */
  followScreens: boolean;
  cursor: WorkflowCursor;
  stamps: Record<CursorField, FieldStamp>;
  /** Every known screen, keyed `${deviceId}::${workspaceId}` — including this one. */
  registrations: Record<string, WorkspaceRegistration>;
  /** The most recent command heard (local or remote), for widgets that act on one. */
  lastCommand: ReceivedCommand | null;
  /**
   * The `sentAt` of the last accepted `tune`/`tuneResult` from each sender
   * (PR #694 review, item 5): a replayed retune must not be able to re-key
   * the rig long after the operator moved on, so a `tune`/`tuneResult` no
   * newer than the sender's last one is dropped in `applyMessage`. Scoped to
   * these two command types — see `applyMessage`'s doc comment.
   */
  lastAppliedTuneSentAt: Record<string, number>;
  /** Whether a transport is currently attached. */
  connected: boolean;
}

export interface OperatingStateStoreActions {
  setSessionId: (sessionId: string | null) => void;
  setBand: (band: string | null) => void;
  setTarget: (target: OperatingTarget | null) => void;
  setContact: (contact: OperatingContact | null) => void;
  /** Owner round 2: a spot picked anywhere becomes the `target` cursor everywhere. */
  selectSpot: (spot: SpotRef) => void;
  flipPage: (workspaceId: string, pageIndex: number) => void;
  setView: (workspaceId: string, viewId: string) => void;
  /**
   * Owner round 2 (#660): phone remote-tunes whichever screen published
   * `canTune`. `deviceId` + `workspaceId` name the exact registration the
   * phone picked (PR #694 review) — `workspaceId` alone is not unique across
   * devices.
   */
  tune: (
    deviceId: string,
    workspaceId: string,
    frequencyKHz: number,
    mode: string | null,
  ) => void;
  /** PR #694 review: the tuned screen reports back so TUNE is no longer fire-and-forget. */
  reportTuneResult: (
    deviceId: string,
    workspaceId: string,
    ok: boolean,
    reason: string | null,
  ) => void;
  setFollowScreens: (next: boolean) => void;
  /** Announces this screen; the returned function withdraws it. */
  registerWorkspace: (input: RegisterWorkspaceInput) => () => void;
  /** Attaches a transport (defaults to `BroadcastChannel`); the returned function detaches it. */
  connect: (transport?: OperatingTransport) => () => void;
  /** Exported for tests and for transports; applies one validated inbound message. */
  applyMessage: (message: OperatingMessage) => void;
  reset: () => void;
}

export type OperatingStateStore = OperatingStateStoreState &
  OperatingStateStoreActions;

const EMPTY_CURSOR: WorkflowCursor = {
  sessionId: null,
  band: null,
  target: null,
  contact: null,
};

function newDeviceId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `screen-${Math.random().toString(16).slice(2)}`;
  }
}

function emptyStamps(): Record<CursorField, FieldStamp> {
  return {
    sessionId: { at: 0, tieKey: "", appliedAt: 0, appliedSeq: 0 },
    band: { at: 0, tieKey: "", appliedAt: 0, appliedSeq: 0 },
    target: { at: 0, tieKey: "", appliedAt: 0, appliedSeq: 0 },
    contact: { at: 0, tieKey: "", appliedAt: 0, appliedSeq: 0 },
  };
}

/** Strictly increasing per screen, so two writes in the same millisecond still order. */
let lastIssuedStamp = 0;
function nextStamp(): number {
  lastIssuedStamp = Math.max(Date.now(), lastIssuedStamp + 1);
  return lastIssuedStamp;
}

/**
 * Deterministic on every screen: newer wins, and the tie on an equal `at` goes
 * to the higher id.
 *
 * The tie key is `by ?? senderId`, and the tie is resolved **exactly the way
 * the deployed bundle resolves it** (#859 round 12). `main` keys every entry
 * on the envelope sender and compares with `>`:
 *
 * ```ts
 * // origin/main src/stores/operatingStateStore.ts:167-169, 253
 * function beats(incoming: FieldStamp, current: FieldStamp): boolean {
 *   if (incoming.at !== current.at) return incoming.at > current.at;
 *   return incoming.by > current.by;          // `by` === the envelope sender
 * }
 * ```
 *
 * Rounds 6-8 made an authorless entry lose every tie instead, so that a relay
 * could not re-enter a settled race under a guessed author. It stopped the
 * replay, but it also split the network: on the same millisecond an upgraded
 * screen rejected the legacy tab's write while the legacy tab accepted the
 * upgraded screen's, and the two sat on different values with nothing to
 * break the deadlock. A tie is arbitrary by definition; the only thing that
 * matters is that every screen picks the *same* arbitrary winner, which means
 * picking the one the bundle already in the field picks.
 *
 * Round 8 still stands where it counts: the sender id is borrowed for this
 * comparison and then dropped. Nothing guessed is ever stored in a stamp or
 * put on the wire, so no downstream screen mistakes it for a first-hand
 * claim, and `currentPatch` still relays an authorless write authorless.
 *
 * The replay that round 5 and round 8 were guarding against is handled where
 * it belongs instead, in `mergePatch`: re-delivering a value already held is
 * not an application and takes no new number, whoever it is keyed on.
 *
 * Residual, stated plainly: a *relayed* same-millisecond tie can still be
 * settled differently on the two sides, because a legacy tab keys the relay
 * on the relaying peer while this bundle keys it on the original author. It
 * heals on the next write with a different `at`, and disappears once every
 * tab is upgraded. Direct writes — the common case — agree exactly.
 *
 * Compares the wire `at`, never `appliedAt`: arrival order differs per
 * screen, so merging on it would let two screens disagree about the winner.
 * Takes only the wire half of a stamp, so a caller cannot mint the local half
 * before knowing whether the write is even accepted.
 */
function beats(
  incoming: Pick<FieldStamp, "at" | "by">,
  current: Pick<FieldStamp, "at" | "tieKey">,
  /** The envelope's sender — this screen's own id for a local write. */
  senderId: string,
): boolean {
  if (incoming.at !== current.at) return incoming.at > current.at;
  // Both sides keyed the same way `main` keys them: the author when the entry
  // named one, otherwise whoever delivered it. The held key is kept on the
  // stamp (`tieKey`) rather than borrowed and dropped, so two authorless
  // writes in the same millisecond settle the same way on every receiver and
  // in either delivery order (#859 round 13).
  return (incoming.by ?? senderId) > current.tieKey;
}

/**
 * Is this the value already held? Every cursor value is a string, `null`, or
 * one of two flat records of primitives, so a shallow compare is exact.
 */
function sameCursorValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => left[key] === right[key]);
}

function registrationKey(deviceId: string, workspaceId: string): string {
  return `${deviceId}::${workspaceId}`;
}

/** The transport this store is attached to, if any. Module scope: one per app. */
let activeTransport: OperatingTransport | null = null;

/** One re-announce timer per locally registered workspace, keyed like `registrations`. */
const heartbeats = new Map<string, ReturnType<typeof setInterval>>();

function stopHeartbeat(key: string): void {
  const timer = heartbeats.get(key);
  if (timer === undefined) return;
  clearInterval(timer);
  heartbeats.delete(key);
}

function stopAllHeartbeats(): void {
  for (const key of [...heartbeats.keys()]) stopHeartbeat(key);
}

/** Refreshes one registration's `lastSeen`, locally and on every other screen. */
function beat(key: string): void {
  const registration = useOperatingStateStore.getState().registrations[key];
  if (!registration) {
    stopHeartbeat(key);
    return;
  }
  const refreshed: WorkspaceRegistration = {
    ...registration,
    lastSeen: Date.now(),
  };
  useOperatingStateStore.setState((state) => ({
    registrations: { ...state.registrations, [key]: refreshed },
  }));
  post({ kind: "register", registration: refreshed });
}

function startHeartbeat(key: string): void {
  stopHeartbeat(key);
  heartbeats.set(
    key,
    setInterval(() => beat(key), REGISTRATION_HEARTBEAT_MS),
  );
}

function post(payload: OperatingPayload): void {
  const state = useOperatingStateStore.getState();
  if (!state.followScreens || !activeTransport) return;
  activeTransport.post({
    ...payload,
    v: OPERATING_PROTOCOL_VERSION,
    senderId: state.deviceId,
    sentAt: Date.now(),
  });
}

/**
 * The full cursor as a patch, used to answer a `hello` from a screen that just
 * opened — and to publish this screen's view after it starts following.
 *
 * A relay is not a write. Both `at` and `by` are the *original* writer's, so
 * the same logical write is byte-identical whichever peer answers: without
 * `by`, the receiver would attribute it to the relaying peer, and a peer
 * whose id sorts above the original author's would win `beats()` all over
 * again — re-applying a cursor the receiver already had, and refreshing its
 * local `appliedAt`/`appliedSeq` so a map target chosen in between looks
 * older on the next remount (#859 round 5).
 *
 * `appliedAt`/`appliedSeq` themselves are never sent: they are local to
 * whichever screen applied the write and are meaningless anywhere else —
 * `appliedSeq` especially, since the receiver may be another device
 * entirely and numbers its own applications from zero (#859 round 11).
 */
function currentPatch(state: OperatingStateStoreState): CursorPatch {
  const patch: CursorPatch = {};
  for (const field of CURSOR_FIELDS) {
    const stamp = state.stamps[field];
    if (stamp.at === 0) continue;
    // `by` is omitted, not sent as `undefined`, when the write we hold is
    // authorless: the entry we relay must be indistinguishable from the one
    // the old tab sent, so every downstream peer applies the same authorless
    // rule to it (#859 round 8).
    Object.assign(patch, {
      [field]: {
        value: state.cursor[field],
        at: stamp.at,
        ...(stamp.by === undefined ? {} : { by: stamp.by }),
      },
    });
  }
  return patch;
}

/**
 * Applies a patch under the per-field last-writer-wins rule.
 *
 * There is deliberately no sender-id fallback for an entry that names no
 * author: every caller that *knows* the author states it on the entry
 * (`writeField`, the `selectSpot` command), and for the one caller that does
 * not — an inbound `state` patch from a bundle too old to say — the sender is
 * only who delivered it, which may not be who wrote it (#859 round 8).
 */
function mergePatch(
  state: OperatingStateStoreState,
  patch: CursorPatch,
  /**
   * The envelope's sender, this screen's own id for a local write. Used only
   * to break an equal-`at` tie the way the deployed bundle breaks it, and
   * never written into a stamp (#859 rounds 8 and 12).
   */
  senderId: string,
): Partial<OperatingStateStoreState> | null {
  const cursor = { ...state.cursor };
  const stamps = { ...state.stamps };
  let changed = false;

  for (const field of CURSOR_FIELDS) {
    const entry = patch[field];
    if (!entry) continue;
    // The logical author, which for a relayed `hello` reply is not the
    // sender. A write this screen already holds therefore arrives with an
    // `(at, by)` identical to the stamp it already has, and `beats()`
    // declines it — no value change and, because the local half of the stamp
    // is minted *below* this check rather than above it, no refresh of
    // `appliedAt`/`appliedSeq` either. Re-stamping a write already held is
    // what let a replay outrank a map target chosen in between (#859 round 5).
    const current = stamps[field];
    const incoming = { at: entry.at, by: entry.by };
    // One logical wire write, delivered twice — a `hello` reply, or a relay
    // that `beats()` would otherwise let through (#859 rounds 12-14). There
    // is nothing to apply, so nothing is applied: no new application number
    // and no fresh `appliedAt`. Re-stamping a write already held is what let
    // a replay outrank a map target chosen in between (round 5), and that
    // guard has to survive the tie rule getting more permissive rather than
    // depend on it.
    //
    // Identity is the same instant, the same value, *and* authorship that
    // says this is the same write rather than a second one. Four cases, and
    // the middle column is the whole rule:
    //
    // | arrival at the held `at` with the held value | is it a replay? | why |
    // | --- | --- | --- |
    // | no author (`by` undefined) | **yes** | a relay, legacy or upgraded, stripped of its author. It cannot be told apart from the original, so the safe reading is replay — that is round 5's guard. |
    // | held author unknown, arrival authored | **yes, and it learns** | the write reached this screen first through a tab too old to name an author, so the held `tieKey` is only the *relayer's* id. An authored delivery of the same instant and value is that same write, now named: `by` and `tieKey` become the author, and nothing is minted. |
    // | same author | **yes** | the author, or an upgraded relay, re-announcing a write already held. |
    // | two *known* and different authors | **no** | a distinct write that happens to carry an equal value in the same millisecond. It goes through `beats()` like anything else and, if it wins, lands with its own `appliedAt`/`appliedSeq`. |
    //
    // "Different author" needs both sides known — round 15. Keying the second
    // row on the held `tieKey` instead compared an author against a *relayer*,
    // so in a mixed-version network the upgraded relay of a write the legacy
    // peer had already delivered looked like a second writer and re-stamped
    // it, taking a target chosen between the two deliveries.
    //
    // The fourth row is round 14: collapsing two screens' same-millisecond
    // writes into one left the winner's re-pick unnumbered here, so a wall
    // that had picked something else in between kept its own target on
    // remount. And equal values never short-circuit ordering in the first
    // place (round 13): a *newer* `at` is always a new write, whatever it
    // carries.
    //
    // Nothing here is guessed. An author is recorded only when an entry
    // states it, and a replay that does not name one leaves the tie key
    // alone: it is the key this write won on, and a second delivery did not
    // win anything.
    if (
      entry.at === current.at &&
      sameCursorValue(cursor[field], entry.value) &&
      (entry.by === undefined ||
        current.by === undefined ||
        entry.by === current.by)
    ) {
      if (entry.by === undefined || current.by !== undefined) continue;
      stamps[field] = { ...current, by: entry.by, tieKey: entry.by };
      changed = true;
      continue;
    }
    // One rule for both, authored and not: `beats()` orders an absent author
    // rather than the caller special-casing it here, so the absence cannot be
    // handled one way at this site and another at the next one.
    //
    // Note this is the whole compatibility mechanism: the wire version is
    // *not* bumped for `by`, because every deployed parser drops a version it
    // does not recognise, so a bump would make this bundle invisible to a tab
    // left open across the deploy (round 7). An optional field plus a rule
    // for its absence is bidirectional; a bump is not.
    if (!beats(incoming, current, senderId)) continue;
    // Stamped here — the one place a stamp is written — so the local half
    // covers every accepted path: a local `writeField` (same moment as its
    // `nextStamp()`), an inbound `state` patch, a `hello` reply carrying a
    // genuinely newer write, and the `selectSpot` command that also moves
    // the cursor.
    Object.assign(cursor, { [field]: entry.value });
    stamps[field] = {
      ...incoming,
      tieKey: entry.by ?? senderId,
      appliedAt: Date.now(),
      // This window's application order, minted here for every accepted
      // entry whatever its origin (#859 round 11). Carrying the writer's
      // number instead — round 10 — compared counters belonging to different
      // devices, so a phone that had never heard from this window could pass
      // for older than a target picked here minutes ago. What the wall
      // reconcile actually asks is which of the two this window saw second,
      // and only a local number can answer that.
      appliedSeq: nextLocalWriteSeq(),
    };
    changed = true;
  }

  return changed ? { cursor, stamps } : null;
}

/** Writes one field locally and, when following, sends it. */
function writeField<K extends CursorField>(
  field: K,
  value: WorkflowCursor[K],
): void {
  const state = useOperatingStateStore.getState();
  const at = nextStamp();
  // Named explicitly rather than left to the receiver's `senderId` fallback,
  // so every entry this bundle sends carries its author whether it is
  // first-hand or relayed, and no entry of ours has to have its authorship
  // guessed. An older parser ignores the extra key.
  //
  // No sequence: the local write takes its number from `mergePatch` below
  // like every other accepted entry, and that number means nothing to the
  // peers this patch is about to reach (#859 round 11).
  const patch = { [field]: { value, at, by: state.deviceId } } as CursorPatch;
  const next = mergePatch(state, patch, state.deviceId);
  if (next) useOperatingStateStore.setState(next);
  post({ kind: "state", patch });
}

/**
 * Records a command so the screens that can act on it do.
 *
 * This store deliberately does not reach into `workspaceStore` to flip a
 * page: the cursor must stay usable on a canvas that has no workspace (the
 * map, the wall), and a store that owns the transport should not also own
 * another store's navigation. `useOperatingScreen` — mounted by whatever
 * renders a workspace — reads `lastCommand` and applies it.
 */
function recordCommand(command: OperatingCommand, senderId: string): void {
  useOperatingStateStore.setState({
    lastCommand: { command, senderId, receivedAt: Date.now() },
  });
}

export const useOperatingStateStore = create<OperatingStateStore>()(
  persist(
    (set, get) => ({
      deviceId: newDeviceId(),
      followScreens: true,
      cursor: EMPTY_CURSOR,
      stamps: emptyStamps(),
      registrations: {},
      lastCommand: null,
      lastAppliedTuneSentAt: {},
      connected: false,

      setSessionId: (sessionId) => writeField("sessionId", sessionId),
      setBand: (band) => writeField("band", band),
      setTarget: (target) => writeField("target", target),
      setContact: (contact) => writeField("contact", contact),

      selectSpot: (spot) => {
        const target: OperatingTarget = {
          callsign: spot.callsign,
          grid: spot.grid,
          lat: null,
          lon: null,
          spotId: spot.id,
        };
        writeField("target", target);
        if (spot.band) writeField("band", spot.band);
        const command: OperatingCommand = { type: "selectSpot", spot };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      flipPage: (workspaceId, pageIndex) => {
        const command: OperatingCommand = {
          type: "flipPage",
          workspaceId,
          pageIndex,
        };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      setView: (workspaceId, viewId) => {
        const command: OperatingCommand = {
          type: "setView",
          workspaceId,
          viewId,
        };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      tune: (deviceId, workspaceId, frequencyKHz, mode) => {
        const command: OperatingCommand = {
          type: "tune",
          deviceId,
          workspaceId,
          frequencyKHz,
          mode,
        };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      reportTuneResult: (deviceId, workspaceId, ok, reason) => {
        const command: OperatingCommand = {
          type: "tuneResult",
          deviceId,
          workspaceId,
          ok,
          reason,
        };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      setFollowScreens: (next) => {
        set({ followScreens: next });
        if (next) {
          // Re-announce so screens that opened while this one was muted learn
          // it exists, and ask them to do the same.
          post({ kind: "hello" });
          for (const registration of Object.values(get().registrations)) {
            if (registration.deviceId !== get().deviceId) continue;
            post({ kind: "register", registration });
          }
          // Asking is not enough. Anything edited while muted carries a newer
          // stamp than the peers' answers, so this screen would reject their
          // state and never offer its own, and the two would stay divergent
          // until the next write. Publish the local cursor as well.
          const patch = currentPatch(get());
          if (Object.keys(patch).length > 0) post({ kind: "state", patch });
        } else {
          // Forget everyone else: a stale roster is worse than none.
          const deviceId = get().deviceId;
          set((state) => ({
            registrations: Object.fromEntries(
              Object.entries(state.registrations).filter(
                ([, value]) => value.deviceId === deviceId,
              ),
            ),
          }));
        }
      },

      registerWorkspace: (input) => {
        const deviceId = get().deviceId;
        const registration: WorkspaceRegistration = {
          deviceId,
          workspaceId: input.workspaceId,
          canvasType: input.canvasType,
          label: input.label,
          capabilities: { ...input.capabilities },
          lastSeen: Date.now(),
        };
        const key = registrationKey(deviceId, input.workspaceId);
        set((state) => ({
          registrations: { ...state.registrations, [key]: registration },
        }));
        post({ kind: "register", registration });
        post({ kind: "hello" });
        startHeartbeat(key);

        return () => {
          stopHeartbeat(key);
          set((state) => {
            const { [key]: _removed, ...rest } = state.registrations;
            return { registrations: rest };
          });
          post({ kind: "unregister", workspaceId: input.workspaceId });
        };
      },

      connect: (transport) => {
        activeTransport?.close();
        const next = transport ?? createBroadcastTransport();
        activeTransport = next;
        const unsubscribe = next.subscribe((message) => {
          get().applyMessage(message);
        });
        set({ connected: true });
        post({ kind: "hello" });
        // A registration made before the transport attached (the workspace
        // route mounts independently of the app-level connection) or held
        // across a reconnect has to be re-announced, and its heartbeat
        // restarted.
        for (const [key, registration] of Object.entries(get().registrations)) {
          if (registration.deviceId !== get().deviceId) continue;
          post({ kind: "register", registration });
          startHeartbeat(key);
        }
        // Same reasoning as `setFollowScreens(true)`: this pipe may be brand
        // new to every peer on it — most notably the account transport
        // (#698), which `useOperatingTransport` attaches only once sign-in +
        // `sync` + follow all line up, well after the cursor may already
        // have local edits. Those edits carry a newer stamp than a signed-in
        // peer's own answer, so without this publish this screen would keep
        // rejecting the peer's state and never offer its own — the two would
        // stay divergent until the next local write (owner review, #698 fix
        // round, Codex finding).
        const patch = currentPatch(get());
        if (Object.keys(patch).length > 0) post({ kind: "state", patch });

        return () => {
          stopAllHeartbeats();
          unsubscribe();
          next.close();
          if (activeTransport === next) activeTransport = null;
          // The roster is meaningless with no pipe. This screen's own
          // registrations stay, so a reconnect can re-announce them.
          set((state) => ({
            connected: false,
            registrations: Object.fromEntries(
              Object.entries(state.registrations).filter(
                ([, value]) => value.deviceId === state.deviceId,
              ),
            ),
          }));
        };
      },

      applyMessage: (message) => {
        const state = get();
        // Own echo, or the kill switch is off: nothing from the channel
        // may touch this screen.
        if (message.senderId === state.deviceId) return;
        if (!state.followScreens) return;

        switch (message.kind) {
          case "state": {
            const next = mergePatch(state, message.patch, message.senderId);
            if (next) set(next);
            break;
          }
          case "command": {
            // PR #694 review, item 5: a `tune`/`tuneResult` no newer than the
            // last one accepted from this sender is dropped, so a replayed
            // message cannot re-key the rig after the operator moved on.
            // `parseOperatingMessage` already rejects a command older than
            // 30 s outright; this catches an in-window replay or re-delivery
            // that arrives out of order. Scoped to these two types: the
            // other commands (`flipPage`, `selectSpot`, `setView`) have no
            // comparable "acting twice on a stale replay" risk.
            if (
              message.command.type === "tune" ||
              message.command.type === "tuneResult"
            ) {
              const lastSentAt =
                state.lastAppliedTuneSentAt[message.senderId] ?? 0;
              if (message.sentAt <= lastSentAt) break;
              set((current) => ({
                lastAppliedTuneSentAt: {
                  ...current.lastAppliedTuneSentAt,
                  [message.senderId]: message.sentAt,
                },
              }));
            }
            if (message.command.type === "selectSpot") {
              const spot = message.command.spot;
              const merged = mergePatch(
                get(),
                {
                  target: {
                    value: {
                      callsign: spot.callsign,
                      grid: spot.grid,
                      lat: null,
                      lon: null,
                      spotId: spot.id,
                    },
                    at: message.sentAt,
                    // First-hand: the screen that tapped the spot is the
                    // author, so state it here rather than leaving it to a
                    // fallback in `mergePatch` that cannot tell a first-hand
                    // write from a relay (#859 round 8).
                    by: message.senderId,
                  },
                },
                message.senderId,
              );
              if (merged) set(merged);
            }
            recordCommand(message.command, message.senderId);
            break;
          }
          case "register": {
            const key = registrationKey(
              message.registration.deviceId,
              message.registration.workspaceId,
            );
            set((current) => ({
              registrations: {
                ...current.registrations,
                [key]: { ...message.registration, lastSeen: Date.now() },
              },
            }));
            break;
          }
          case "unregister": {
            const key = registrationKey(message.senderId, message.workspaceId);
            set((current) => {
              const { [key]: _removed, ...rest } = current.registrations;
              return { registrations: rest };
            });
            break;
          }
          case "hello": {
            // Re-announce this screen's workspaces and its view of the
            // cursor, so a tab that just opened catches up.
            for (const registration of Object.values(state.registrations)) {
              if (registration.deviceId !== state.deviceId) continue;
              post({ kind: "register", registration });
            }
            const patch = currentPatch(state);
            if (Object.keys(patch).length > 0) post({ kind: "state", patch });
            break;
          }
        }
      },

      reset: () => {
        stopAllHeartbeats();
        set({
          cursor: EMPTY_CURSOR,
          stamps: emptyStamps(),
          registrations: {},
          lastCommand: null,
          lastAppliedTuneSentAt: {},
        });
      },
    }),
    {
      name: "propulse-operating-state",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only the kill switch survives a reload. The cursor is live state,
      // and `deviceId` MUST differ per tab for echo suppression to work.
      partialize: (state) => ({ followScreens: state.followScreens }),
      merge: (persisted, current) => {
        const stored = persisted as { followScreens?: boolean } | undefined;
        return {
          ...current,
          followScreens: stored?.followScreens !== false,
        };
      },
    },
  ),
);

/** Screens heard from within `REGISTRATION_TTL_MS`, this one first. */
export function selectLiveRegistrations(
  state: OperatingStateStoreState,
  now: number = Date.now(),
): WorkspaceRegistration[] {
  return Object.values(state.registrations)
    .filter((registration) => now - registration.lastSeen < REGISTRATION_TTL_MS)
    .sort((a, b) => {
      if (a.deviceId === b.deviceId)
        return a.workspaceId.localeCompare(b.workspaceId);
      if (a.deviceId === state.deviceId) return -1;
      if (b.deviceId === state.deviceId) return 1;
      return a.deviceId.localeCompare(b.deviceId);
    });
}
