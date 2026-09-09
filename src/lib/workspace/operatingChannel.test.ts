import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OPERATING_PROTOCOL_VERSION,
  createAccountTransport,
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

/**
 * A command message must carry a recent `sentAt` (PR #694 review, item 5) or
 * `parseOperatingMessage` drops it regardless of the command's own shape.
 * Every "kind: command" fixture below that expects to be *accepted*, or
 * rejected for a reason other than staleness, uses this instead of the
 * fixed-epoch default so the test exercises the condition it names.
 */
function freshEnvelope(senderId = "screen-a") {
  return envelope(senderId, Date.now());
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
    ["a command with no type", { ...freshEnvelope(), kind: "command", command: {} }],
    [
      "a negative page index",
      { ...freshEnvelope(), kind: "command", command: { type: "flipPage", workspaceId: "w", pageIndex: -1 } },
    ],
    [
      "a fractional page index",
      { ...freshEnvelope(), kind: "command", command: { type: "flipPage", workspaceId: "w", pageIndex: 1.5 } },
    ],
    [
      "a selectSpot with no callsign",
      { ...freshEnvelope(), kind: "command", command: { type: "selectSpot", spot: { id: null } } },
    ],
    [
      "a tune with a zero frequency",
      {
        ...freshEnvelope(),
        kind: "command",
        command: { type: "tune", deviceId: "d1", workspaceId: "w", frequencyKHz: 0, mode: null },
      },
    ],
    [
      "a tune with no deviceId",
      {
        ...freshEnvelope(),
        kind: "command",
        command: { type: "tune", workspaceId: "w", frequencyKHz: 14195, mode: null },
      },
    ],
    [
      "a tune with no workspaceId",
      {
        ...freshEnvelope(),
        kind: "command",
        command: { type: "tune", deviceId: "d1", frequencyKHz: 14195, mode: null },
      },
    ],
    [
      "a tune with a non-string mode",
      {
        ...freshEnvelope(),
        kind: "command",
        command: { type: "tune", deviceId: "d1", workspaceId: "w", frequencyKHz: 14195, mode: 7 },
      },
    ],
    [
      "a tuneResult with a non-boolean ok",
      {
        ...freshEnvelope(),
        kind: "command",
        command: { type: "tuneResult", deviceId: "d1", workspaceId: "w", ok: "yes", reason: null },
      },
    ],
    [
      "a tuneResult with a non-string reason",
      {
        ...freshEnvelope(),
        kind: "command",
        command: { type: "tuneResult", deviceId: "d1", workspaceId: "w", ok: false, reason: 7 },
      },
    ],
    [
      "a stale command (sentAt more than 30s old)",
      {
        ...envelope("screen-a", Date.now() - 40_000),
        kind: "command",
        command: { type: "flipPage", workspaceId: "w", pageIndex: 0 },
      },
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
    const envelopeFields = freshEnvelope();
    const command = {
      type: "tune" as const,
      deviceId: "device-workstation",
      workspaceId: "workstation-default",
      frequencyKHz: 14195,
      mode: null,
    };
    const message = parseOperatingMessage({ ...envelopeFields, kind: "command", command });
    expect(message).toEqual({ ...envelopeFields, kind: "command", command });
  });

  it("accepts a well-formed tuneResult with a reason", () => {
    const envelopeFields = freshEnvelope();
    const command = {
      type: "tuneResult" as const,
      deviceId: "device-workstation",
      workspaceId: "workstation-default",
      ok: false,
      reason: "RIG WAITING",
    };
    const message = parseOperatingMessage({ ...envelopeFields, kind: "command", command });
    expect(message).toEqual({ ...envelopeFields, kind: "command", command });
  });

  it("accepts a tuneResult with no reason field, defaulting it to null", () => {
    const envelopeFields = freshEnvelope();
    const message = parseOperatingMessage({
      ...envelopeFields,
      kind: "command",
      command: { type: "tuneResult", deviceId: "device-workstation", workspaceId: "workstation-default", ok: true },
    });
    expect(message).toEqual({
      ...envelopeFields,
      kind: "command",
      command: {
        type: "tuneResult",
        deviceId: "device-workstation",
        workspaceId: "workstation-default",
        ok: true,
        reason: null,
      },
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

/**
 * A minimal, duck-typed stand-in for a Supabase `RealtimeChannel` — enough
 * of `.on` / `.subscribe` / `.send` / `.unsubscribe` for
 * `createAccountTransport` to drive, plus test-only hooks (`emit`,
 * `triggerStatus`, `sent`) to simulate the wire and inspect what was posted.
 */
function makeFakeChannel() {
  let broadcastHandler: ((message: { payload: unknown }) => void) | null = null;
  let statusHandler: ((status: string, err?: Error) => void) | null = null;
  const sent: unknown[] = [];

  const channel = {
    on(_type: string, _filter: { event: string }, cb: (message: { payload: unknown }) => void) {
      broadcastHandler = cb;
      return channel;
    },
    subscribe(cb?: (status: string, err?: Error) => void) {
      statusHandler = cb ?? null;
      return channel;
    },
    async send(args: { payload: unknown }) {
      sent.push(args.payload);
      return { ok: true };
    },
    async unsubscribe() {
      return "ok" as const;
    },
    emit(payload: unknown) {
      broadcastHandler?.({ payload });
    },
    triggerStatus(status: string, err?: Error) {
      statusHandler?.(status, err);
    },
    sent,
  };
  return channel;
}

function makeFakeClient(channel: ReturnType<typeof makeFakeChannel> = makeFakeChannel()) {
  const channelSpy = vi.fn(() => channel);
  const client = { channel: channelSpy } as unknown as SupabaseClient;
  return { client, channelSpy, channel };
}

describe("createAccountTransport", () => {
  it("opens a private, self-excluding channel named for the account and posts through send", () => {
    const { client, channelSpy, channel } = makeFakeClient();
    const transport = createAccountTransport({ accountId: "uid-1", client });

    expect(channelSpy).toHaveBeenCalledWith("operating:uid-1", {
      config: { private: true, broadcast: { self: false } },
    });

    const message = { ...envelope(), kind: "hello" } as const;
    transport.post(message);
    expect(channel.sent).toEqual([message]);
    transport.close();
  });

  it("validates inbound broadcast payloads and drops anything malformed", () => {
    const { client, channel } = makeFakeClient();
    const transport = createAccountTransport({ accountId: "uid-1", client });
    const heard: OperatingMessage[] = [];
    transport.subscribe((m) => heard.push(m));

    channel.emit({ hostile: true });
    channel.emit({ ...envelope("other"), kind: "hello" });

    expect(heard).toHaveLength(1);
    expect(heard[0].senderId).toBe("other");
    transport.close();
  });

  it("closes and stops posting after a subscribe error, logging once", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client, channel } = makeFakeClient();
    const transport = createAccountTransport({ accountId: "uid-1", client });

    channel.triggerStatus("CHANNEL_ERROR", new Error("denied"));
    channel.triggerStatus("CHANNEL_ERROR", new Error("denied again"));

    expect(consoleError).toHaveBeenCalledTimes(1);
    transport.post({ ...envelope(), kind: "hello" });
    expect(channel.sent).toHaveLength(0);
    transport.close();
    consoleError.mockRestore();
  });

  it("falls back to a null transport when opening the channel throws", () => {
    const client = {
      channel: () => {
        throw new Error("realtime unavailable");
      },
    } as unknown as SupabaseClient;
    const transport = createAccountTransport({ accountId: "uid-1", client });

    expect(transport.name).toBe("account-unavailable");
    expect(() => transport.post({ ...envelope(), kind: "hello" })).not.toThrow();
    transport.close();
  });
});
