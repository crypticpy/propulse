import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryBus,
  OPERATING_PROTOCOL_VERSION,
  type OperatingMessage,
} from "@/lib/workspace/operatingChannel";
import {
  REGISTRATION_HEARTBEAT_MS,
  REGISTRATION_TTL_MS,
} from "./operatingStateStore";

type Bus = ReturnType<typeof createMemoryBus>;
type StoreModule = typeof import("./operatingStateStore");

interface Screen {
  store: StoreModule["useOperatingStateStore"];
  selectLiveRegistrations: StoreModule["selectLiveRegistrations"];
  /** Attaches this screen to the bus. Called for you unless `connect: false`. */
  connect: () => void;
  disconnect: () => void;
  deviceId: string;
}

/**
 * A second screen is a second module instance: the store is a singleton per
 * browsing context, and `vi.resetModules()` is the only honest way to get two
 * of them in one process. Each gets its own transport off the shared bus,
 * exactly like two tabs on one `BroadcastChannel`.
 */
async function openScreen(
  bus: Bus,
  name: string,
  options: { connect?: boolean } = {},
): Promise<Screen> {
  vi.resetModules();
  const mod: StoreModule = await import("./operatingStateStore");
  const store = mod.useOperatingStateStore;
  let detach: (() => void) | null = null;
  const connect = () => {
    detach = store.getState().connect(bus.connect(name));
  };
  if (options.connect !== false) connect();
  return {
    store,
    selectLiveRegistrations: mod.selectLiveRegistrations,
    connect,
    disconnect: () => {
      detach?.();
      detach = null;
    },
    deviceId: store.getState().deviceId,
  };
}

/**
 * A copy of the rules `parseOperatingMessage` applies on `main` — the bundle
 * running in any tab that has not been reloaded since the last deploy. Kept
 * deliberately dumb and separate from the real parser: its whole job is to
 * fail if this bundle ever emits something the deployed one would drop.
 */
function legacyWouldAccept(message: OperatingMessage): boolean {
  const raw = JSON.parse(JSON.stringify(message)) as Record<string, unknown>;
  // `main`: `if (raw.v !== OPERATING_PROTOCOL_VERSION) return null;` with the
  // constant at 1.
  if (raw.v !== 1) return false;
  if (typeof raw.senderId !== "string" || raw.senderId.length === 0)
    return false;
  if (typeof raw.sentAt !== "number" || !Number.isFinite(raw.sentAt))
    return false;
  if (raw.kind !== "state") return true;
  const patch = raw.patch;
  if (typeof patch !== "object" || patch === null) return false;
  let count = 0;
  for (const field of ["sessionId", "band", "target", "contact"]) {
    if (!(field in patch)) continue;
    const entry = (patch as Record<string, unknown>)[field];
    if (typeof entry !== "object" || entry === null) return false;
    // `main` reads exactly these two keys and never inspects the others, so
    // an added key can only be ignored — never a reason to reject.
    const at = (entry as Record<string, unknown>).at;
    if (typeof at !== "number" || !Number.isFinite(at)) return false;
    if (!("value" in (entry as Record<string, unknown>))) return false;
    count += 1;
  }
  return count > 0;
}

/**
 * `main`'s tie rule, reimplemented here so a test can check that this bundle
 * settles a tie the same way the bundle in the field does.
 *
 * From `origin/main src/stores/operatingStateStore.ts`:
 *
 * ```ts
 * // 167-169
 * function beats(incoming: FieldStamp, current: FieldStamp): boolean {
 *   if (incoming.at !== current.at) return incoming.at > current.at;
 *   return incoming.by > current.by;
 * }
 * // 241-253: `mergePatch(state, patch, by)` keys every entry on `by`, which
 * // is `message.senderId` for an inbound patch (456) and `state.deviceId`
 * // for a local write (268). The entry's own fields are never consulted.
 * const incoming: FieldStamp = { at: entry.at, by };
 * ```
 *
 * So on `main` the tie key is always the envelope sender, compared with a
 * plain string `>`.
 */
function legacyAccepts(
  incoming: { at: number; senderId: string },
  current: { at: number; by: string },
): boolean {
  if (incoming.at !== current.at) return incoming.at > current.at;
  return incoming.senderId > current.by;
}

describe("operatingStateStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("gives each browsing context its own device id, so echoes can be told apart", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");
    const b = await openScreen(bus, "b");
    expect(a.deviceId).not.toBe(b.deviceId);
    a.disconnect();
    b.disconnect();
  });

  it("converges two screens on band and target", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");
    const b = await openScreen(bus, "b");

    a.store.getState().setBand("20m");
    b.store.getState().setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: -23.5,
      lon: -46.6,
      spotId: "spot-1",
    });

    // Per-field last-writer-wins: neither screen clobbered the other's field.
    for (const screen of [a, b]) {
      expect(screen.store.getState().cursor.band).toBe("20m");
      expect(screen.store.getState().cursor.target?.callsign).toBe("PY2ABC");
    }

    a.disconnect();
    b.disconnect();
  });

  it("ignores its own echo", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    a.store.getState().setBand("20m");
    // A message wearing this screen's own sender id, with a stamp that would
    // otherwise win, must not be applied.
    a.store.getState().applyMessage({
      v: 1,
      senderId: a.deviceId,
      sentAt: Date.now(),
      kind: "state",
      patch: { band: { value: "6m", at: Date.now() + 60_000 } },
    });

    expect(a.store.getState().cursor.band).toBe("20m");
    a.disconnect();
  });

  it("keeps the newer write when two screens race one field", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    a.store.getState().setBand("20m");
    const winningStamp = a.store.getState().stamps.band.at;

    a.store.getState().applyMessage({
      v: 1,
      senderId: "other-screen",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "80m", at: winningStamp - 1 } },
    });
    expect(a.store.getState().cursor.band).toBe("20m");

    a.store.getState().applyMessage({
      v: 1,
      senderId: "other-screen",
      sentAt: 2,
      kind: "state",
      patch: { band: { value: "40m", at: winningStamp + 1 } },
    });
    expect(a.store.getState().cursor.band).toBe("40m");

    a.disconnect();
  });

  it("breaks a same-millisecond tie the same way on every screen", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    a.store.setState({
      cursor: { ...a.store.getState().cursor, band: "20m" },
      stamps: {
        ...a.store.getState().stamps,
        band: {
          at: 5_000,
          by: "aaa",
          tieKey: "aaa",
          appliedAt: 5_000,
          appliedSeq: 0,
        },
      },
    });

    // v2: the author is explicit, so the tie-break compares the writers.
    const patch = (band: string, by: string) =>
      ({
        kind: "state",
        patch: { band: { value: band, at: 5_000, by } },
      }) as const;

    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "aa",
      sentAt: 1,
      ...patch("80m", "aa"),
    });
    expect(a.store.getState().cursor.band).toBe("20m");

    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzz",
      sentAt: 1,
      ...patch("40m", "zzz"),
    });
    expect(a.store.getState().cursor.band).toBe("40m");

    a.disconnect();
  });

  it("settles a same-millisecond tie the way the deployed bundle settles it", async () => {
    // #859 round 12. Rounds 6-8 made an authorless entry lose every tie, so
    // that a relay could not re-enter a settled race under a guessed author.
    // It also split the network: on the same millisecond this screen rejected
    // a legacy tab's write while the legacy tab accepted this screen's, and
    // the two sat on different values for good. A tie is arbitrary; what
    // matters is that everyone picks the same arbitrary winner, so the tie
    // key is `by ?? senderId` compared exactly as `main` compares it.
    //
    // The replay is stopped in `mergePatch` instead, by not re-applying a
    // value already held — see the relay tests above and in
    // `useHamClockWallOperatingState.test.ts`.
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    a.store.setState({
      cursor: { ...a.store.getState().cursor, band: "20m" },
      stamps: {
        ...a.store.getState().stamps,
        band: {
          at: 5_000,
          by: "aaa",
          tieKey: "aaa",
          appliedAt: 5_000,
          appliedSeq: 0,
        },
      },
    });

    // Equal `at`, delivering id sorts *below* the held author: rejected, and
    // the oracle agrees.
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "aa-low" },
        { at: 5_000, by: "aaa" },
      ),
    ).toBe(false);
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "aa-low",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "40m", at: 5_000 } },
    });
    expect(a.store.getState().cursor.band).toBe("20m");

    // Equal `at`, delivering id sorts above: accepted, as `main` would.
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "zzz-legacy" },
        { at: 5_000, by: "aaa" },
      ),
    ).toBe(true);
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzz-legacy",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "40m", at: 5_000 } },
    });
    expect(a.store.getState().cursor.band).toBe("40m");
    // Round 8 is untouched where it counts: the id was borrowed for the
    // comparison and dropped. Nothing downstream can mistake it for a claim.
    expect(a.store.getState().stamps.band.by).toBeUndefined();

    // Strictly newer: an old peer's genuine write still wins, as before.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "aa-low",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "80m", at: 5_001 } },
    });
    expect(a.store.getState().cursor.band).toBe("80m");

    a.disconnect();
  });

  it("agrees with a legacy tab on the winner of a direct same-millisecond write", async () => {
    // The convergence the round is for (#859 round 12), both ways round. One
    // upgraded screen and one legacy tab write different values in the same
    // millisecond, each receiving the other's message directly — no relay, so
    // both sides key on the same id and must reach the same value.
    //
    // The legacy side is the oracle above, reimplemented from `origin/main`;
    // the upgraded side is the real store.
    for (const [upgradedId, legacyId] of [
      ["aaa-upgraded", "zzz-legacy"],
      ["zzz-upgraded", "mmm-legacy"],
    ]) {
      const bus = createMemoryBus();
      const screen = await openScreen(bus, "u", { connect: false });
      screen.store.setState({ deviceId: upgradedId });
      screen.connect();

      screen.store.getState().setBand("20m");
      const at = screen.store.getState().stamps.band.at;

      // The legacy tab wrote "40m" in the same millisecond and sends it.
      screen.store.getState().applyMessage({
        v: OPERATING_PROTOCOL_VERSION,
        senderId: legacyId,
        sentAt: 1,
        kind: "state",
        patch: { band: { value: "40m", at } },
      });

      // What the legacy tab does with ours: it holds its own write keyed on
      // its own id, and keys ours on the envelope sender.
      const legacyTakesOurs = legacyAccepts(
        { at, senderId: upgradedId },
        { at, by: legacyId },
      );
      const legacyBand = legacyTakesOurs ? "20m" : "40m";

      // Same winner on both sides — the higher id, whichever tab that is.
      expect(screen.store.getState().cursor.band).toBe(legacyBand);
      expect(legacyBand).toBe(legacyId > upgradedId ? "40m" : "20m");

      screen.disconnect();
    }
  });

  it("relays a legacy write without inventing an author for it", async () => {
    // Three tabs (#859 round 8). A is on a bundle too old to name an author,
    // B is upgraded and relays A's write, C is upgraded and holds its own
    // authored write at the same `at` with an id that sorts *below* B's.
    //
    // What must not happen is B *claiming* the write: a guessed `by` on the
    // relay is indistinguishable downstream from a first-hand claim, and
    // would be stored and relayed on again as one. Unknown provenance stays
    // unknown, on the wire and in the stamp.
    //
    // C does take the value (#859 round 12): the tie is keyed on the
    // relaying peer, which is what a legacy tab does with the same message,
    // and the two must not end up on different values. The re-application
    // that round 5 guards against is a *re-delivery of the value already
    // held*, which is blocked in `mergePatch` and covered separately.
    const bus = createMemoryBus();
    const sent: OperatingMessage[] = [];
    bus.connect("tap").subscribe((message) => sent.push(message));

    const relay = await openScreen(bus, "relay", { connect: false });
    relay.store.setState({ deviceId: "zzz-relay" });
    relay.connect();

    // Tab A, legacy: a patch with no author at all.
    relay.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "mmm-legacy",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "40m", at: 5_000 } },
    });
    expect(relay.store.getState().cursor.band).toBe("40m");
    // Applied, but not credited to the tab that happened to deliver it.
    expect(relay.store.getState().stamps.band.by).toBeUndefined();

    // Tab C holds an authored write at the same `at`, lower id than the relay.
    const held = await openScreen(bus, "held", { connect: false });
    held.store.setState({
      deviceId: "aaa-held",
      cursor: { ...held.store.getState().cursor, band: "20m" },
      stamps: {
        ...held.store.getState().stamps,
        band: {
          at: 5_000,
          by: "aaa-held",
          tieKey: "aaa-held",
          appliedAt: 5_000,
          appliedSeq: 0,
        },
      },
    });

    sent.length = 0;
    // Connecting sends a `hello`; the relay answers with `currentPatch`.
    held.connect();

    const relayed = sent.filter(
      (message) => message.kind === "state" && message.senderId === "zzz-relay",
    );
    expect(relayed.length).toBeGreaterThan(0);
    for (const message of relayed) {
      if (message.kind !== "state") continue;
      expect(message.patch.band?.value).toBe("40m");
      // The relay carries no author, so every downstream peer applies the
      // same authorless rule to it that the relay itself did.
      expect(message.patch.band?.by).toBeUndefined();
    }

    // C takes the value, keyed on the relaying peer exactly as a legacy tab
    // would key it...
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "zzz-relay" },
        { at: 5_000, by: "aaa-held" },
      ),
    ).toBe(true);
    expect(held.store.getState().cursor.band).toBe("40m");
    // ...and still records no author for it. The relayer's id was borrowed
    // for the comparison and dropped.
    expect(held.store.getState().stamps.band.by).toBeUndefined();

    relay.disconnect();
    held.disconnect();
  });

  it("applies a newer write that happens to carry the value already held", async () => {
    // #859 round 13, thread 1. Round 12 suppressed any accepted entry whose
    // value equalled the one held, which is too broad: the operator who picks
    // the target they picked before has made a genuinely newer write. Peers
    // kept the *old* stamp for it, so a screen that picked something else in
    // between still outranked it and never gave its own pick up. A stamp
    // orders writes; an equal value does not short-circuit that.
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "phone",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000, by: "phone" } },
    });
    const firstSeq = a.store.getState().stamps.band.appliedSeq;
    expect(a.store.getState().stamps.band.at).toBe(1_000);

    // The same message a second time — one wire write delivered twice — is
    // still not an application (round 5): nothing moves.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "phone",
      sentAt: 2,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000, by: "phone" } },
    });
    expect(a.store.getState().stamps.band.appliedSeq).toBe(firstSeq);

    // A *new* write carrying the same value does land, with its own stamp.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "phone",
      sentAt: 3,
      kind: "state",
      patch: { band: { value: "20m", at: 3_000, by: "phone" } },
    });
    expect(a.store.getState().stamps.band.at).toBe(3_000);
    expect(a.store.getState().stamps.band.appliedSeq as number).toBeGreaterThan(
      firstSeq as number,
    );

    a.disconnect();
  });

  it("treats a re-delivery of the held write as a replay, authorless or from its author", async () => {
    // #859 round 14. Two of the three arrivals at the held `(at, value)` are
    // the same write coming round again: one stripped of its author by a
    // relay, one naming the screen the write is already keyed on. Neither is
    // an application, so neither takes a number — round 5's guard.
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    // Held: an authorless first-hand write from the phone.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "phone",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000 } },
    });
    const seq = a.store.getState().stamps.band.appliedSeq;
    expect(a.store.getState().stamps.band.by).toBeUndefined();

    // No author: a relay, and indistinguishable from the original. Replay.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzz-relay",
      sentAt: 2,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000 } },
    });
    expect(a.store.getState().stamps.band.appliedSeq).toBe(seq);

    // An upgraded relay naming the screen this write is already keyed on:
    // still a replay, and the one thing it may add is the author itself.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzz-relay",
      sentAt: 3,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000, by: "phone" } },
    });
    expect(a.store.getState().stamps.band.appliedSeq).toBe(seq);
    expect(a.store.getState().stamps.band.by).toBe("phone");

    // And the author's own re-announcement of it, once more.
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "phone",
      sentAt: 4,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000, by: "phone" } },
    });
    expect(a.store.getState().stamps.band.appliedSeq).toBe(seq);

    a.disconnect();
  });

  it("applies another screen's same-millisecond write of the same value", async () => {
    // #859 round 14, the third row of the table. Two screens writing the same
    // value in the same millisecond are two writes, not one: collapsing them
    // left the winner's write unnumbered here, so a wall that had picked
    // something else in between kept its own target on remount.
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");

    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "aaa-phone",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "20m", at: 5_000, by: "aaa-phone" } },
    });
    const seq = a.store.getState().stamps.band.appliedSeq;

    // A different author, same instant, same value, id sorting above: a
    // distinct write that wins the tie — and `main` agrees on the winner.
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "zzz-other" },
        { at: 5_000, by: "aaa-phone" },
      ),
    ).toBe(true);
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzz-other",
      sentAt: 2,
      kind: "state",
      patch: { band: { value: "20m", at: 5_000, by: "zzz-other" } },
    });
    expect(a.store.getState().stamps.band.appliedSeq as number).toBeGreaterThan(
      seq as number,
    );
    expect(a.store.getState().stamps.band.by).toBe("zzz-other");

    // A different author sorting below loses the tie, and loses it silently:
    // no number, or a write that did not win would still climb the order.
    const winner = a.store.getState().stamps.band.appliedSeq;
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "aaa-low" },
        { at: 5_000, by: "zzz-other" },
      ),
    ).toBe(false);
    a.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "aaa-low",
      sentAt: 3,
      kind: "state",
      patch: { band: { value: "20m", at: 5_000, by: "aaa-low" } },
    });
    expect(a.store.getState().stamps.band.appliedSeq).toBe(winner);
    expect(a.store.getState().stamps.band.by).toBe("zzz-other");

    a.disconnect();
  });

  it("settles two same-millisecond authorless writes the same way in either order", async () => {
    // #859 round 13, thread 5. The key an authorless entry won on used to be
    // borrowed for the comparison and dropped, so the *next* authorless write
    // at the same millisecond had nothing to lose to and was accepted
    // unconditionally. Two old tabs writing in the same millisecond then
    // settled differently on each receiver, purely by arrival order. The key
    // is retained locally on the stamp, so the higher one wins wherever the
    // two arrive.
    const lower = {
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "aaa-legacy",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "80m", at: 5_000 } },
    } satisfies OperatingMessage;
    const higher = {
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzz-legacy",
      sentAt: 1,
      kind: "state",
      patch: { band: { value: "40m", at: 5_000 } },
    } satisfies OperatingMessage;

    // The deployed bundle keys both sides on the envelope sender, so this is
    // the winner it picks too — the oracle, extended to the authorless case.
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "zzz-legacy" },
        { at: 5_000, by: "aaa-legacy" },
      ),
    ).toBe(true);
    expect(
      legacyAccepts(
        { at: 5_000, senderId: "aaa-legacy" },
        { at: 5_000, by: "zzz-legacy" },
      ),
    ).toBe(false);

    const bus = createMemoryBus();
    const forward = await openScreen(bus, "forward", { connect: false });
    forward.store.getState().applyMessage(lower);
    forward.store.getState().applyMessage(higher);

    const backward = await openScreen(bus, "backward", { connect: false });
    backward.store.getState().applyMessage(higher);
    backward.store.getState().applyMessage(lower);

    expect(forward.store.getState().cursor.band).toBe("40m");
    expect(backward.store.getState().cursor.band).toBe("40m");
    // Still no author invented for either of them (round 8).
    expect(forward.store.getState().stamps.band.by).toBeUndefined();
    expect(backward.store.getState().stamps.band.by).toBeUndefined();

    // And a `hello` relay of the settled value does not flip it back: a peer
    // that has converged relays what it holds, which is the value already
    // here at the same `at` — one write delivered twice, not a new one — so
    // it is not applied however the relayer's id sorts.
    const seqBefore = backward.store.getState().stamps.band.appliedSeq;
    backward.store.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: "zzzz-relay",
      sentAt: 9,
      kind: "state",
      patch: { band: { value: "40m", at: 5_000 } },
    });
    expect(backward.store.getState().cursor.band).toBe("40m");
    expect(backward.store.getState().stamps.band.appliedSeq).toBe(seqBefore);
  });

  describe("the Follow my other screens kill switch", () => {
    it("stops this screen sending", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      a.store.getState().setFollowScreens(false);
      a.store.getState().setBand("20m");

      expect(a.store.getState().cursor.band).toBe("20m");
      expect(b.store.getState().cursor.band).toBeNull();

      a.disconnect();
      b.disconnect();
    });

    it("stops this screen applying", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      b.store.getState().setFollowScreens(false);
      a.store.getState().setBand("20m");

      expect(b.store.getState().cursor.band).toBeNull();

      b.disconnect();
      a.disconnect();
    });

    it("survives a reload and defaults to on", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      a.store.getState().setFollowScreens(false);
      a.disconnect();

      const reloaded = await openScreen(bus, "a2");
      expect(reloaded.store.getState().followScreens).toBe(false);
      reloaded.disconnect();

      localStorage.clear();
      const fresh = await openScreen(bus, "a3");
      expect(fresh.store.getState().followScreens).toBe(true);
      fresh.disconnect();
    });

    it("drops the roster of other screens when it goes off", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      b.store.getState().registerWorkspace({
        workspaceId: "workstation-default",
        canvasType: "workstation",
        label: "My workstation",
        capabilities: { canTune: true, canCommand: true },
      });
      expect(Object.keys(a.store.getState().registrations)).toHaveLength(1);

      a.store.getState().setFollowScreens(false);
      expect(a.store.getState().registrations).toEqual({});

      a.disconnect();
      b.disconnect();
    });
  });

  describe("commands", () => {
    it("turns a spot picked on one screen into the target cursor on the other", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      a.store.getState().selectSpot({
        id: "spot-9",
        callsign: "VK3ABC",
        band: "15m",
        frequency: 21_025,
        mode: "CW",
        grid: "QF22",
      });

      expect(b.store.getState().cursor.target).toMatchObject({
        callsign: "VK3ABC",
        spotId: "spot-9",
        grid: "QF22",
      });
      expect(b.store.getState().cursor.band).toBe("15m");
      expect(b.store.getState().lastCommand?.command).toMatchObject({
        type: "selectSpot",
      });
      expect(b.store.getState().lastCommand?.senderId).toBe(a.deviceId);

      a.disconnect();
      b.disconnect();
    });

    it("carries flipPage and setView to the other screen", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      a.store.getState().flipPage("workstation-default", 2);
      expect(b.store.getState().lastCommand?.command).toEqual({
        type: "flipPage",
        workspaceId: "workstation-default",
        pageIndex: 2,
      });

      a.store.getState().setView("workstation-default", "contest");
      expect(b.store.getState().lastCommand?.command).toEqual({
        type: "setView",
        workspaceId: "workstation-default",
        viewId: "contest",
      });

      a.disconnect();
      b.disconnect();
    });

    it("does not deliver a command while the kill switch is off", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      b.store.getState().setFollowScreens(false);
      a.store.getState().flipPage("workstation-default", 1);

      expect(b.store.getState().lastCommand).toBeNull();

      a.disconnect();
      b.disconnect();
    });

    it("drops a replayed tune no newer than the last one accepted from that sender", async () => {
      // PR #694 review, item 5: a re-delivered/replayed `tune` must not be
      // able to re-key the rig after the operator moved on. Scoped to
      // `tune`/`tuneResult` — `parseOperatingMessage` already rejects a
      // command older than 30s outright; this is the in-window replay case.
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");

      const tuneAt = (sentAt: number, frequencyKHz: number) =>
        a.store.getState().applyMessage({
          v: 1,
          senderId: "other-screen",
          sentAt,
          kind: "command",
          command: {
            type: "tune",
            deviceId: a.deviceId,
            workspaceId: "workstation-default",
            frequencyKHz,
            mode: null,
          },
        });

      tuneAt(1_000, 14195);
      expect(a.store.getState().lastCommand?.command).toMatchObject({
        frequencyKHz: 14195,
      });

      // A replay of the same (or an older) message must be dropped.
      tuneAt(1_000, 21_000);
      expect(a.store.getState().lastCommand?.command).toMatchObject({
        frequencyKHz: 14195,
      });

      // A genuinely newer tune from the same sender still applies.
      tuneAt(2_000, 7_074);
      expect(a.store.getState().lastCommand?.command).toMatchObject({
        frequencyKHz: 7_074,
      });

      a.disconnect();
    });
  });

  describe("workspace registration", () => {
    it("announces a screen, its canvas and its capabilities to the others", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");

      const withdraw = b.store.getState().registerWorkspace({
        workspaceId: "phone-default",
        canvasType: "phone",
        label: "Phone",
        capabilities: { canTune: false, canCommand: true },
      });

      const seen = a.selectLiveRegistrations(a.store.getState());
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        deviceId: b.deviceId,
        workspaceId: "phone-default",
        canvasType: "phone",
        capabilities: { canTune: false, canCommand: true },
      });

      withdraw();
      expect(a.store.getState().registrations).toEqual({});

      a.disconnect();
      b.disconnect();
    });

    it("hides a screen that has gone quiet past the TTL", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      a.store.getState().registerWorkspace({
        workspaceId: "wall-1",
        canvasType: "wall",
        label: "Wall",
        capabilities: { canTune: false, canCommand: false },
      });

      const state = a.store.getState();
      expect(a.selectLiveRegistrations(state)).toHaveLength(1);
      expect(
        a.selectLiveRegistrations(state, Date.now() + 120_000),
      ).toHaveLength(0);

      a.disconnect();
    });

    it("credits the original writer, not the peer that relayed the answer", async () => {
      // Every peer answers a `hello`, so a screen that opens late hears the
      // same write from several of them. A relay is not a write: if it were
      // attributed to the relaying peer, a peer whose id sorts above the
      // author's would win `beats()` with a write the receiver already had,
      // re-stamping its local arrival time and letting a replay outrank a map
      // target chosen in between (#859 round 5).
      const bus = createMemoryBus();
      const author = await openScreen(bus, "author", { connect: false });
      const relay = await openScreen(bus, "relay", { connect: false });
      // Deterministic ordering: the relay's id sorts above the author's, so
      // an answer credited to the relay would win the tie-break.
      author.store.setState({ deviceId: "aaa-author" });
      relay.store.setState({ deviceId: "zzz-relay" });
      author.connect();
      relay.connect();

      author.store.getState().setBand("40m");
      expect(relay.store.getState().stamps.band.by).toBe("aaa-author");

      // A third screen opens and both peers answer its `hello`.
      const late = await openScreen(bus, "late");

      expect(late.store.getState().cursor.band).toBe("40m");
      expect(late.store.getState().stamps.band.by).toBe("aaa-author");

      author.disconnect();
      relay.disconnect();
      late.disconnect();
    });

    it("catches a screen that opened later up on the current cursor", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      a.store.getState().setBand("40m");

      const b = await openScreen(bus, "b");
      // `connect` sends a hello; the screen that already has a cursor answers.
      expect(b.store.getState().cursor.band).toBe("40m");

      a.disconnect();
      b.disconnect();
    });
  });

  it("stops sending and receiving once disconnected", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");
    const b = await openScreen(bus, "b");

    b.disconnect();
    a.store.getState().setBand("10m");
    expect(b.store.getState().cursor.band).toBeNull();
    expect(b.store.getState().connected).toBe(false);

    a.disconnect();
  });

  it("publishes what it changed while muted when following is turned back on", async () => {
    const bus = createMemoryBus();
    const a = await openScreen(bus, "a");
    const b = await openScreen(bus, "b");

    // B holds a value with an explicitly older stamp, so the answer it gives
    // to A's hello loses. If A only asked, the two would stay divergent.
    b.store.getState().applyMessage({
      v: 1,
      senderId: "an-earlier-screen",
      sentAt: 1_000,
      kind: "state",
      patch: { band: { value: "20m", at: 1_000 } },
    });
    a.store.getState().setFollowScreens(false);
    a.store.getState().setBand("17m");
    expect(b.store.getState().cursor.band).toBe("20m");

    a.store.getState().setFollowScreens(true);

    expect(b.store.getState().cursor.band).toBe("17m");
    expect(a.store.getState().cursor.band).toBe("17m");

    a.disconnect();
    b.disconnect();
  });

  describe("registration heartbeat", () => {
    it("keeps a long-lived screen on the roster past the TTL", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");
      vi.useFakeTimers();

      b.store.getState().registerWorkspace({
        workspaceId: "phone-default",
        canvasType: "phone",
        label: "Phone",
        capabilities: { canTune: false, canCommand: true },
      });
      const [initial] = Object.values(a.store.getState().registrations);
      expect(initial).toBeDefined();

      // Well past the TTL: without a heartbeat the roster would be empty.
      vi.advanceTimersByTime(REGISTRATION_TTL_MS + REGISTRATION_HEARTBEAT_MS);

      const [refreshed] = Object.values(a.store.getState().registrations);
      expect(refreshed.lastSeen).toBeGreaterThan(initial.lastSeen);
      expect(a.selectLiveRegistrations(a.store.getState())).toHaveLength(1);

      a.disconnect();
      b.disconnect();
    });

    it("stops when the workspace withdraws, and the screen ages off the roster", async () => {
      const bus = createMemoryBus();
      const a = await openScreen(bus, "a");
      const b = await openScreen(bus, "b");
      vi.useFakeTimers();

      const withdraw = b.store.getState().registerWorkspace({
        workspaceId: "phone-default",
        canvasType: "phone",
        label: "Phone",
        capabilities: { canTune: false, canCommand: true },
      });
      withdraw();
      // A already dropped it on the unregister; re-seed it so the test is
      // about the heartbeat stopping, not about the unregister message.
      const stale = {
        deviceId: b.deviceId,
        workspaceId: "phone-default",
        canvasType: "phone" as const,
        label: "Phone",
        capabilities: { canTune: false, canCommand: true },
        lastSeen: Date.now(),
      };
      a.store.setState({
        registrations: { [`${b.deviceId}::phone-default`]: stale },
      });

      vi.advanceTimersByTime(REGISTRATION_TTL_MS + REGISTRATION_HEARTBEAT_MS);

      expect(a.selectLiveRegistrations(a.store.getState())).toHaveLength(0);

      a.disconnect();
      b.disconnect();
    });

    it("re-announces a registration made before the transport attached", async () => {
      const bus = createMemoryBus();
      const listener = await openScreen(bus, "listener");
      const late = await openScreen(bus, "late", { connect: false });

      late.store.getState().registerWorkspace({
        workspaceId: "wall-1",
        canvasType: "wall",
        label: "Shack wall",
        capabilities: { canTune: false, canCommand: false },
      });
      expect(listener.store.getState().registrations).toEqual({});

      late.connect();

      expect(
        Object.values(listener.store.getState().registrations),
      ).toHaveLength(1);
      expect(
        Object.values(listener.store.getState().registrations)[0],
      ).toMatchObject({
        workspaceId: "wall-1",
        canvasType: "wall",
      });

      late.disconnect();
      listener.disconnect();
    });
  });

  it("publishes a cursor edited before the transport attached, once it does (#698 fix round)", async () => {
    const bus = createMemoryBus();
    const listener = await openScreen(bus, "listener");
    // Simulates the account transport (#698) attaching well after this
    // screen already has local edits: `late` starts disconnected, so
    // `setBand` here updates its own state without anything going out —
    // there is no `activeTransport` yet for `post` to use.
    const late = await openScreen(bus, "late", { connect: false });

    late.store.getState().setBand("20m");
    expect(listener.store.getState().cursor.band).toBeNull();

    late.connect();

    expect(listener.store.getState().cursor.band).toBe("20m");

    late.disconnect();
    listener.disconnect();
  });

  it("emits a wire message a bundle already deployed can still read", async () => {
    // The compatibility direction that cannot be fixed later (#859 round 7).
    // Every parser already shipped hard-rejects a version it does not know,
    // so emitting a new one would make this bundle invisible to a tab left
    // open across the deploy — silently, and until that tab is reloaded.
    // `by` is therefore additive on v1: the old parser reads `value`/`at` and
    // ignores the rest.
    const bus = createMemoryBus();
    const sent: OperatingMessage[] = [];
    bus.connect("tap").subscribe((message) => sent.push(message));
    const a = await openScreen(bus, "a");

    a.store.getState().setBand("20m");

    const states = sent.filter((message) => message.kind === "state");
    expect(states.length).toBeGreaterThan(0);
    for (const message of states) {
      // Mirrors `parseOperatingMessage` as it stands on `main` (the deployed
      // bundle): a strict version equality, and a patch entry validated on
      // `at` and `value` alone with no unknown-key rejection.
      expect(legacyWouldAccept(message)).toBe(true);
    }
    // ...and the author really is on the wire, or the round 5 fix travels
    // nowhere.
    expect(
      states.every(
        (message) => message.kind === "state" && message.patch.band?.by,
      ),
    ).toBe(true);
    // And no write sequence, deliberately (round 11): this channel spans
    // devices, and a counter minted here orders nothing on a phone. Every
    // receiver numbers the write itself when it applies it.
    expect(
      states.every(
        (message) =>
          message.kind === "state" &&
          !("seq" in (message.patch.band as Record<string, unknown>)),
      ),
    ).toBe(true);
    // And no tie key either (round 13). It is retained on the held stamp so
    // an equal-`at` comparison has both sides, and it is *not* authorship:
    // if it travelled, a peer would read a deliverer's id as a first-hand
    // claim, which is exactly what round 8 forbade.
    expect(
      states.every(
        (message) =>
          message.kind === "state" &&
          !("tieKey" in (message.patch.band as Record<string, unknown>)),
      ),
    ).toBe(true);

    a.disconnect();
  });

  it("never puts anything but state, a sender and a timestamp on the wire", async () => {
    const bus = createMemoryBus();
    const sent: OperatingMessage[] = [];
    bus.connect("tap").subscribe((message) => sent.push(message));
    const a = await openScreen(bus, "a");

    a.store.getState().setContact({ callsign: "K1ABC", band: "20m" });
    a.store.getState().selectSpot({
      id: null,
      callsign: "K1ABC",
      band: "20m",
      frequency: null,
      mode: null,
      grid: null,
    });

    expect(sent.length).toBeGreaterThan(0);
    for (const message of sent) {
      expect(Object.keys(message).sort()).toEqual(
        expect.arrayContaining(["kind", "senderId", "sentAt", "v"]),
      );
      const serialized = JSON.stringify(message);
      expect(serialized).not.toMatch(
        /token|password|secret|apikey|access_token/i,
      );
    }

    a.disconnect();
  });
});
