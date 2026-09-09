import { describe, expect, it, vi } from "vitest";
import {
  OPERATING_PROTOCOL_VERSION,
  createBroadcastTransport,
  createCompositeTransport,
  createMemoryBus,
  createNullTransport,
  parseOperatingMessage,
  type OperatingMessage,
} from "./operatingChannel";

function envelope(senderId = "screen-a", sentAt = 1_000) {
  return { v: OPERATING_PROTOCOL_VERSION, senderId, sentAt };
}

describe("parseOperatingMessage", () => {
  it("accepts a well-formed state patch", () => {
    const message = parseOperatingMessage({
      ...envelope(),
      kind: "state",
      patch: { band: { value: "20m", at: 900 } },
    });
    expect(message).toEqual({
      ...envelope(),
      kind: "state",
      patch: { band: { value: "20m", at: 900 } },
    });
  });

  it("accepts a null-valued field, which is how a cursor field is cleared", () => {
    const message = parseOperatingMessage({
      ...envelope(),
      kind: "state",
      patch: { contact: { value: null, at: 900 } },
    });
    expect(message?.kind).toBe("state");
  });

  it.each([
    ["not an object", "nope"],
    ["a wrong protocol version", { ...envelope(), v: 99, kind: "hello" }],
    ["a missing sender", { v: OPERATING_PROTOCOL_VERSION, sentAt: 1, kind: "hello" }],
    ["a non-numeric timestamp", { ...envelope(), sentAt: "soon", kind: "hello" }],
    ["an unknown kind", { ...envelope(), kind: "shutdown" }],
    ["an empty patch", { ...envelope(), kind: "state", patch: {} }],
    ["a patch entry with no stamp", { ...envelope(), kind: "state", patch: { band: { value: "20m" } } }],
    [
      "a patch field of the wrong type",
      { ...envelope(), kind: "state", patch: { band: { value: 20, at: 1 } } },
    ],
    [
      "a target missing its callsign",
      { ...envelope(), kind: "state", patch: { target: { value: { grid: "FN31" }, at: 1 } } },
    ],
    ["a command with no type", { ...envelope(), kind: "command", command: {} }],
    [
      "a negative page index",
      { ...envelope(), kind: "command", command: { type: "flipPage", workspaceId: "w", pageIndex: -1 } },
    ],
    [
      "a fractional page index",
      { ...envelope(), kind: "command", command: { type: "flipPage", workspaceId: "w", pageIndex: 1.5 } },
    ],
    [
      "a selectSpot with no callsign",
      { ...envelope(), kind: "command", command: { type: "selectSpot", spot: { id: null } } },
    ],
    [
      "a tune with a zero frequency",
      { ...envelope(), kind: "command", command: { type: "tune", workspaceId: "w", frequencyKHz: 0, mode: null } },
    ],
    [
      "a tune with no workspaceId",
      { ...envelope(), kind: "command", command: { type: "tune", frequencyKHz: 14195, mode: null } },
    ],
    [
      "a tune with a non-string mode",
      { ...envelope(), kind: "command", command: { type: "tune", workspaceId: "w", frequencyKHz: 14195, mode: 7 } },
    ],
    [
      "a registration with an unknown canvas type",
      {
        ...envelope(),
        kind: "register",
        registration: {
          workspaceId: "w",
          canvasType: "watch",
          label: "L",
          capabilities: { canTune: false, canCommand: true },
          lastSeen: 1,
        },
      },
    ],
    [
      "a registration with no capabilities",
      {
        ...envelope(),
        kind: "register",
        registration: { workspaceId: "w", canvasType: "wall", label: "L", lastSeen: 1 },
      },
    ],
  ])("drops %s", (_label, raw) => {
    expect(parseOperatingMessage(raw)).toBeNull();
  });

  it("accepts a well-formed tune command with a null mode", () => {
    const message = parseOperatingMessage({
      ...envelope(),
      kind: "command",
      command: { type: "tune", workspaceId: "workstation-default", frequencyKHz: 14195, mode: null },
    });
    expect(message).toEqual({
      ...envelope(),
      kind: "command",
      command: { type: "tune", workspaceId: "workstation-default", frequencyKHz: 14195, mode: null },
    });
  });

  it("drops the whole patch when one field is malformed, rather than half-applying it", () => {
    expect(
      parseOperatingMessage({
        ...envelope(),
        kind: "state",
        patch: { band: { value: "20m", at: 1 }, target: { value: 7, at: 2 } },
      }),
    ).toBeNull();
  });

  it("takes the device id from the envelope, so a peer cannot register as another screen", () => {
    const message = parseOperatingMessage({
      ...envelope("screen-a"),
      kind: "register",
      registration: {
        deviceId: "screen-victim",
        workspaceId: "w",
        canvasType: "workstation",
        label: "My workstation",
        capabilities: { canTune: true, canCommand: true },
        lastSeen: 5,
      },
    });
    expect(message?.kind === "register" && message.registration.deviceId).toBe("screen-a");
  });
});

describe("createMemoryBus", () => {
  it("delivers a posted message to every connected transport", () => {
    const bus = createMemoryBus();
    const a = bus.connect("a");
    const b = bus.connect("b");
    const heard: OperatingMessage[] = [];
    b.subscribe((message) => heard.push(message));

    a.post({ ...envelope("a"), kind: "hello" });

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ kind: "hello", senderId: "a" });
  });

  it("validates on the way in, so a malformed post reaches nobody", () => {
    const bus = createMemoryBus();
    const a = bus.connect("a");
    const b = bus.connect("b");
    const heard: OperatingMessage[] = [];
    b.subscribe((message) => heard.push(message));

    a.post({ ...envelope("a"), kind: "state", patch: {} } as unknown as OperatingMessage);

    expect(heard).toHaveLength(0);
  });

  it("stops delivering to a closed transport", () => {
    const bus = createMemoryBus();
    const a = bus.connect("a");
    const b = bus.connect("b");
    const heard: OperatingMessage[] = [];
    b.subscribe((message) => heard.push(message));

    b.close();
    a.post({ ...envelope("a"), kind: "hello" });

    expect(heard).toHaveLength(0);
  });
});

describe("createBroadcastTransport", () => {
  it("falls back to a null transport where BroadcastChannel is absent", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const transport = createBroadcastTransport();
    expect(transport.name).toBe("broadcast-unavailable");
    // Posting is a no-op rather than a throw, so callers need no branch.
    expect(() => transport.post({ ...envelope(), kind: "hello" })).not.toThrow();
    transport.close();
  });

  it("validates inbound events and drops anything malformed", () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    class FakeChannel {
      addEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
        listeners.add(listener);
      }
      removeEventListener(_type: string, listener: (event: MessageEvent<unknown>) => void) {
        listeners.delete(listener);
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);

    const transport = createBroadcastTransport("test-channel");
    const heard: OperatingMessage[] = [];
    transport.subscribe((message) => heard.push(message));

    const emit = (data: unknown) => {
      for (const listener of listeners) listener({ data } as MessageEvent<unknown>);
    };
    emit({ hostile: true });
    emit({ ...envelope("other"), kind: "hello" });

    expect(heard).toHaveLength(1);
    expect(heard[0].senderId).toBe("other");
    transport.close();
  });
});

describe("createCompositeTransport", () => {
  it("posts to every pipe and merges their inbound streams", () => {
    const busA = createMemoryBus();
    const busB = createMemoryBus();
    const composite = createCompositeTransport([busA.connect("a"), busB.connect("b")]);

    const fromA: OperatingMessage[] = [];
    const fromB: OperatingMessage[] = [];
    busA.connect("a-peer").subscribe((m) => fromA.push(m));
    busB.connect("b-peer").subscribe((m) => fromB.push(m));

    composite.post({ ...envelope("composite"), kind: "hello" });

    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
    expect(composite.name).toContain("composite");
  });
});

describe("createNullTransport", () => {
  it("accepts subscribers and delivers nothing", () => {
    const transport = createNullTransport("account-stub");
    const heard: OperatingMessage[] = [];
    const unsubscribe = transport.subscribe((m) => heard.push(m));
    transport.post({ ...envelope(), kind: "hello" });
    unsubscribe();
    transport.close();
    expect(heard).toHaveLength(0);
  });
});
