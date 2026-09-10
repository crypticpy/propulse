import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryBus, type OperatingMessage } from "@/lib/workspace/operatingChannel";
import { REGISTRATION_HEARTBEAT_MS, REGISTRATION_TTL_MS } from "./operatingStateStore";

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
      stamps: { ...a.store.getState().stamps, band: { at: 5_000, by: "aaa", appliedAt: 5_000, appliedSeq: 0 } },
    });

    const patch = (band: string) =>
      ({ kind: "state", patch: { band: { value: band, at: 5_000 } } }) as const;

    a.store.getState().applyMessage({ v: 1, senderId: "aa", sentAt: 1, ...patch("80m") });
    expect(a.store.getState().cursor.band).toBe("20m");

    a.store.getState().applyMessage({ v: 1, senderId: "zzz", sentAt: 1, ...patch("40m") });
    expect(a.store.getState().cursor.band).toBe("40m");

    a.disconnect();
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
      expect(b.store.getState().lastCommand?.command).toMatchObject({ type: "selectSpot" });
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
      expect(a.store.getState().lastCommand?.command).toMatchObject({ frequencyKHz: 14195 });

      // A replay of the same (or an older) message must be dropped.
      tuneAt(1_000, 21_000);
      expect(a.store.getState().lastCommand?.command).toMatchObject({ frequencyKHz: 14195 });

      // A genuinely newer tune from the same sender still applies.
      tuneAt(2_000, 7_074);
      expect(a.store.getState().lastCommand?.command).toMatchObject({ frequencyKHz: 7_074 });

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
      expect(a.selectLiveRegistrations(state, Date.now() + 120_000)).toHaveLength(0);

      a.disconnect();
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
      a.store.setState({ registrations: { [`${b.deviceId}::phone-default`]: stale } });

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

      expect(Object.values(listener.store.getState().registrations)).toHaveLength(1);
      expect(Object.values(listener.store.getState().registrations)[0]).toMatchObject({
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
      expect(serialized).not.toMatch(/token|password|secret|apikey|access_token/i);
    }

    a.disconnect();
  });
});
