/**
 * Operating-state transport (#658, refs #633).
 *
 * One operator's screens exchange a *workflow cursor* (session · band ·
 * target · selected contact), a workspace registration record and a small
 * command set. This module owns the wire format and the pipes; the merge
 * rules and the kill switch live in `src/stores/operatingStateStore.ts`.
 *
 * Two pipes, one interface:
 * - `createBroadcastTransport()` — same-browser screens, `BroadcastChannel`.
 * - `createAccountTransport()` — the same account on another device, over
 *   Supabase Realtime. **Stubbed today** (see its doc comment for the exact
 *   server pieces it still needs); it returns a transport that accepts and
 *   delivers nothing, so callers need no branch.
 *
 * Security rules this file enforces, and every future transport must keep:
 * - A message carries state, a command, a registration, a sender id and a
 *   monotonic `sentAt`. Never a token, a session, an API key or a credential
 *   of any kind — the account channel is a fan-out to screens the operator
 *   already signed in, not an auth path.
 * - Nothing arriving from a channel is trusted: `parseOperatingMessage`
 *   re-validates every field before it reaches a store, and anything that
 *   does not match the shape is dropped silently (a peer on a shared channel
 *   name is not necessarily this app, let alone this version).
 */

import type { CanvasType } from "@/lib/workspace/types";

/** Bumped only for a breaking wire change; mismatched versions are dropped. */
export const OPERATING_PROTOCOL_VERSION = 1;

/**
 * A command older than this is dropped rather than applied (PR #694 review,
 * item 5): a `tune` replayed off a stale channel snapshot must not be able
 * to re-key the rig long after the operator moved on. Scoped to commands
 * only — state/register/hello messages have no comparable "acting on a
 * replay" risk, and giving them the same 30 s window would make a screen
 * that reconnects after a short network blip drop its own recent cursor
 * writes for no safety benefit.
 */
const COMMAND_MAX_AGE_MS = 30_000;

/** `BroadcastChannel` name for same-browser screens. Versioned with the protocol. */
export const OPERATING_CHANNEL_NAME = "propulse-operating-state-v1";

/** Cursor fields that merge independently — last writer wins *per field*, not per message. */
export const CURSOR_FIELDS = ["sessionId", "band", "target", "contact"] as const;

export type CursorField = (typeof CURSOR_FIELDS)[number];

/** A spot as it travels between screens. Deliberately smaller than `DXSpot`. */
export interface SpotRef {
  /** Cluster spot id when the source has one; null for a map or manual pick. */
  id: string | null;
  callsign: string;
  band: string | null;
  /** kHz, matching `DXSpot.frequency`. */
  frequency: number | null;
  mode: string | null;
  grid: string | null;
}

/** Where every `scope: "target"` widget points. */
export interface OperatingTarget {
  callsign: string;
  grid: string | null;
  lat: number | null;
  lon: number | null;
  /** Set when the target came from a spot, so a spot list can highlight the row. */
  spotId: string | null;
}

/** The station actually being worked — `opsPostureStore`'s Contact, shared. */
export interface OperatingContact {
  callsign: string;
  band: string | null;
}

/** The #633 object: one cursor every canvas on every device reads and writes. */
export interface WorkflowCursor {
  sessionId: string | null;
  band: string | null;
  target: OperatingTarget | null;
  contact: OperatingContact | null;
}

/** What a registered screen can be asked to do. Absent capability = never commanded. */
export interface WorkspaceCapabilities {
  /** A bridge host is reachable from this screen, so it can retune the rig. */
  canTune: boolean;
  /** This screen accepts commands at all. False on a wall (owner rule: the wall is view-only). */
  canCommand: boolean;
}

/** One live screen, as the other screens see it. */
export interface WorkspaceRegistration {
  /** The browsing context that owns the screen. One per tab, never persisted. */
  deviceId: string;
  workspaceId: string;
  canvasType: CanvasType;
  /** Operator-facing name, e.g. the workspace's `name`. */
  label: string;
  capabilities: WorkspaceCapabilities;
  /** ms epoch of the last message heard from this screen. */
  lastSeen: number;
}

/**
 * Owner round 2: the phone acts as a remote for the wall and the
 * workstation. Commands ride the same transports and the same kill switch as
 * the cursor.
 */
export type OperatingCommand =
  | { type: "flipPage"; workspaceId: string; pageIndex: number }
  | { type: "selectSpot"; spot: SpotRef }
  | { type: "setView"; workspaceId: string; viewId: string }
  /**
   * #660 / PR #694 review: the phone acts as a remote for whichever screen
   * published `capabilities.canTune`. Carries a resolved frequency/mode
   * rather than a `SpotRef` — the sender (`ContactScreen`) already looked the
   * spot up in its own `useDXStore` to get one, and the receiving screen's
   * bridge path (`queueTune`) takes frequency + mode directly.
   *
   * `deviceId` names the exact registration (`deviceId` + `workspaceId`)
   * `pickTuneWorkspace` chose. `workspaceId` alone is not unique: every
   * non-phone canvas defaults to the same `DEFAULT_WORKSPACE_ID`, so two
   * bridge-connected tabs sharing that id would both retune on a
   * `workspaceId`-only match. The receiver in `useOperatingScreen` requires
   * both fields to equal its own before it acts. This does not bump
   * `OPERATING_PROTOCOL_VERSION`: that constant gates every message kind on
   * this channel (state, register, hello — not just commands), and a stray
   * old-shape `tune` (missing `deviceId`) is already dropped on its own by
   * `parseCommand` below, exactly like any other malformed message — no
   * whole-channel version bump is needed to make that safe.
   */
  | { type: "tune"; deviceId: string; workspaceId: string; frequencyKHz: number; mode: string | null }
  /**
   * PR #694 review: TUNE was fire-and-forget. The screen that handled (or
   * refused) a `tune` reports back so the requesting phone can show an
   * honest "SENT" / "FAILED: <reason>" instead of assuming success.
   * `deviceId`/`workspaceId` here name the *reporting* screen — the same
   * pair the phone read off `pickTuneWorkspace` when it sent the `tune`, so
   * the phone can match this result to the attempt it is currently showing
   * feedback for.
   */
  | { type: "tuneResult"; deviceId: string; workspaceId: string; ok: boolean; reason: string | null };

/** One field's proposed value plus the stamp that resolves the race. */
export type CursorPatch = {
  [K in CursorField]?: { value: WorkflowCursor[K]; at: number };
};

interface Envelope {
  v: number;
  /** The sending browsing context. Receivers drop their own echoes on this. */
  senderId: string;
  /** ms epoch, monotonic per sender. */
  sentAt: number;
}

/** A message without its envelope — what a caller hands to `post`. */
export type OperatingPayload =
  | { kind: "state"; patch: CursorPatch }
  | { kind: "command"; command: OperatingCommand }
  | { kind: "register"; registration: WorkspaceRegistration }
  | { kind: "unregister"; workspaceId: string }
  /** A screen that just opened asking the others to re-announce themselves. */
  | { kind: "hello" };

export type OperatingMessage = Envelope & OperatingPayload;

export type OperatingListener = (message: OperatingMessage) => void;

/** Every pipe the operating state can run over looks like this. */
export interface OperatingTransport {
  /** Diagnostic name, surfaced in tests and dev tooling only. */
  readonly name: string;
  post: (message: OperatingMessage) => void;
  subscribe: (listener: OperatingListener) => () => void;
  close: () => void;
}

// ─── Validation ─────────────────────────────────────────────────────────────
// Nothing below trusts its input. A channel name is not a capability: any
// script in the same origin (or, later, any peer on the account channel) can
// post arbitrary JSON, so each field is checked before a store sees it.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseTarget(value: unknown): OperatingTarget | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const callsign = asString(value.callsign);
  const grid = asNullableString(value.grid);
  const lat = asNullableNumber(value.lat);
  const lon = asNullableNumber(value.lon);
  const spotId = asNullableString(value.spotId);
  if (callsign === null || grid === undefined || lat === undefined) return undefined;
  if (lon === undefined || spotId === undefined) return undefined;
  return { callsign, grid, lat, lon, spotId };
}

function parseContact(value: unknown): OperatingContact | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const callsign = asString(value.callsign);
  const band = asNullableString(value.band);
  if (callsign === null || band === undefined) return undefined;
  return { callsign, band };
}

function parseSpotRef(value: unknown): SpotRef | null {
  if (!isRecord(value)) return null;
  const callsign = asString(value.callsign);
  const id = asNullableString(value.id);
  const band = asNullableString(value.band);
  const frequency = asNullableNumber(value.frequency);
  const mode = asNullableString(value.mode);
  const grid = asNullableString(value.grid);
  if (callsign === null || id === undefined || band === undefined) return null;
  if (frequency === undefined || mode === undefined || grid === undefined) return null;
  return { id, callsign, band, frequency, mode, grid };
}

/** One `{ value, at }` entry, validated against the field it claims to set. */
function parsePatchEntry(field: CursorField, raw: unknown): CursorPatch[CursorField] | null {
  if (!isRecord(raw)) return null;
  const at = asFiniteNumber(raw.at);
  if (at === null) return null;
  const value = raw.value;
  switch (field) {
    case "sessionId":
    case "band": {
      const parsed = asNullableString(value);
      return parsed === undefined ? null : { value: parsed, at };
    }
    case "target": {
      const parsed = parseTarget(value);
      return parsed === undefined ? null : { value: parsed, at };
    }
    case "contact": {
      const parsed = parseContact(value);
      return parsed === undefined ? null : { value: parsed, at };
    }
  }
}

/** Returns null when the patch carries no usable field, so an empty message is dropped. */
function parsePatch(raw: unknown): CursorPatch | null {
  if (!isRecord(raw)) return null;
  const patch: CursorPatch = {};
  let count = 0;
  for (const field of CURSOR_FIELDS) {
    if (!(field in raw)) continue;
    const entry = parsePatchEntry(field, raw[field]);
    // A malformed entry invalidates the whole message: a half-applied patch
    // is worse than a dropped one.
    if (entry === null) return null;
    Object.assign(patch, { [field]: entry });
    count += 1;
  }
  return count > 0 ? patch : null;
}

function parseCommand(raw: unknown): OperatingCommand | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "flipPage": {
      const workspaceId = asString(raw.workspaceId);
      const pageIndex = asFiniteNumber(raw.pageIndex);
      if (workspaceId === null || pageIndex === null) return null;
      if (!Number.isInteger(pageIndex) || pageIndex < 0) return null;
      return { type: "flipPage", workspaceId, pageIndex };
    }
    case "selectSpot": {
      const spot = parseSpotRef(raw.spot);
      return spot === null ? null : { type: "selectSpot", spot };
    }
    case "setView": {
      const workspaceId = asString(raw.workspaceId);
      const viewId = asString(raw.viewId);
      if (workspaceId === null || viewId === null) return null;
      return { type: "setView", workspaceId, viewId };
    }
    case "tune": {
      const deviceId = asString(raw.deviceId);
      const workspaceId = asString(raw.workspaceId);
      const frequencyKHz = asFiniteNumber(raw.frequencyKHz);
      const mode = asNullableString(raw.mode);
      if (deviceId === null || workspaceId === null) return null;
      if (frequencyKHz === null || frequencyKHz <= 0) return null;
      if (mode === undefined) return null;
      return { type: "tune", deviceId, workspaceId, frequencyKHz, mode };
    }
    case "tuneResult": {
      const deviceId = asString(raw.deviceId);
      const workspaceId = asString(raw.workspaceId);
      const ok = typeof raw.ok === "boolean" ? raw.ok : null;
      const reason = parseTuneResultReason(raw.reason);
      if (deviceId === null || workspaceId === null || ok === null || reason === undefined) return null;
      return { type: "tuneResult", deviceId, workspaceId, ok, reason };
    }
    default:
      return null;
  }
}

/** `reason` is optional on the wire: absent or explicit `null` both mean "no reason given". */
function parseTuneResultReason(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}

const CANVAS_TYPES: readonly CanvasType[] = ["phone", "tablet", "workstation", "wall"];

function parseRegistration(raw: unknown, senderId: string): WorkspaceRegistration | null {
  if (!isRecord(raw)) return null;
  const workspaceId = asString(raw.workspaceId);
  const label = asString(raw.label);
  const canvasType = CANVAS_TYPES.find((c) => c === raw.canvasType);
  const lastSeen = asFiniteNumber(raw.lastSeen);
  const capabilities = isRecord(raw.capabilities) ? raw.capabilities : null;
  if (workspaceId === null || label === null || !canvasType || lastSeen === null) return null;
  if (!capabilities) return null;
  if (typeof capabilities.canTune !== "boolean") return null;
  if (typeof capabilities.canCommand !== "boolean") return null;
  return {
    // The envelope's sender is authoritative: a peer cannot register a screen
    // under another screen's device id.
    deviceId: senderId,
    workspaceId,
    canvasType,
    label,
    capabilities: { canTune: capabilities.canTune, canCommand: capabilities.canCommand },
    lastSeen,
  };
}

/**
 * The single entry point for untrusted input. Returns the typed message, or
 * null for anything malformed, from another protocol version, or empty.
 */
export function parseOperatingMessage(raw: unknown): OperatingMessage | null {
  if (!isRecord(raw)) return null;
  if (raw.v !== OPERATING_PROTOCOL_VERSION) return null;
  const senderId = asString(raw.senderId);
  const sentAt = asFiniteNumber(raw.sentAt);
  if (senderId === null || sentAt === null) return null;
  const envelope = { v: OPERATING_PROTOCOL_VERSION, senderId, sentAt };

  switch (raw.kind) {
    case "state": {
      const patch = parsePatch(raw.patch);
      return patch === null ? null : { ...envelope, kind: "state", patch };
    }
    case "command": {
      if (Date.now() - sentAt > COMMAND_MAX_AGE_MS) return null;
      const command = parseCommand(raw.command);
      return command === null ? null : { ...envelope, kind: "command", command };
    }
    case "register": {
      const registration = parseRegistration(raw.registration, senderId);
      return registration === null ? null : { ...envelope, kind: "register", registration };
    }
    case "unregister": {
      const workspaceId = asString(raw.workspaceId);
      return workspaceId === null ? null : { ...envelope, kind: "unregister", workspaceId };
    }
    case "hello":
      return { ...envelope, kind: "hello" };
    default:
      return null;
  }
}

// ─── Transports ─────────────────────────────────────────────────────────────

/** A transport that goes nowhere. Used when a pipe is unavailable or not built. */
export function createNullTransport(name: string): OperatingTransport {
  const listeners = new Set<OperatingListener>();
  return {
    name,
    post: () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => listeners.clear(),
  };
}

/**
 * Same-browser screens. `BroadcastChannel` is absent in jsdom and in older
 * WebViews, so the guard is a runtime one and the caller gets a null
 * transport rather than a throw (tests inject a fake instead).
 */
export function createBroadcastTransport(
  channelName: string = OPERATING_CHANNEL_NAME,
): OperatingTransport {
  if (typeof BroadcastChannel === "undefined") {
    return createNullTransport("broadcast-unavailable");
  }

  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(channelName);
  } catch {
    return createNullTransport("broadcast-unavailable");
  }

  const listeners = new Set<OperatingListener>();

  const onMessage = (event: MessageEvent<unknown>) => {
    const message = parseOperatingMessage(event.data);
    if (!message) return;
    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        // One bad subscriber must not stop the others.
      }
    }
  };
  channel.addEventListener("message", onMessage);

  return {
    name: "broadcast",
    post: (message) => {
      try {
        channel.postMessage(message);
      } catch {
        // A closed channel or an unclonable payload: best effort, never throw
        // into the caller's action.
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      listeners.clear();
      channel.removeEventListener("message", onMessage);
      try {
        channel.close();
      } catch {
        // Already closed.
      }
    },
  };
}

export interface AccountTransportOptions {
  /** Supabase user id. The channel is per account, never per session token. */
  accountId: string;
}

/**
 * The same account's other devices, over Supabase Realtime broadcast.
 *
 * **Not implemented — this returns a null transport.** The client wiring
 * exists (`getSupabase()` in `src/lib/supabase.ts` already opens realtime
 * channels for `spot_history`), but shipping this safely needs server pieces
 * this task is not allowed to invent:
 *
 * 1. **A private channel policy.** A public broadcast channel named after the
 *    account id is guessable by any other authenticated client, so the
 *    operator's cursor would be readable off-account. The fix is Supabase
 *    Realtime Authorization: `channel(name, { config: { private: true } })`
 *    plus an RLS policy on `realtime.messages` restricting the topic
 *    `operating:<uid>` to `auth.uid()`. That policy is a migration, and the
 *    owner decides migrations.
 * 2. **`supabase.realtime.setAuth()`** must be called with the current access
 *    token on sign-in and on every refresh for private channels to
 *    authorize — there is no such call in the app today.
 * 3. **The paid `sync` entitlement gate.** Entitlements are server-side only
 *    (`api/_lib/entitlements.ts`, `profiles.subscription_tier`); the frontend
 *    has no entitlement reader at all. Cross-device sync is the paid value,
 *    so the transport must not open until the client can read that flag.
 *
 * Until those land, the account channel stays closed and same-browser screens
 * still converge over `createBroadcastTransport`.
 */
export function createAccountTransport(_options: AccountTransportOptions): OperatingTransport {
  return createNullTransport("account-stub");
}

/** Fans one message out to several pipes and merges their inbound streams. */
export function createCompositeTransport(
  transports: readonly OperatingTransport[],
): OperatingTransport {
  return {
    name: `composite(${transports.map((t) => t.name).join(",")})`,
    post: (message) => {
      for (const transport of transports) transport.post(message);
    },
    subscribe: (listener) => {
      const unsubscribes = transports.map((t) => t.subscribe(listener));
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },
    close: () => {
      for (const transport of transports) transport.close();
    },
  };
}

/**
 * In-memory bus with the same interface, for tests and for the jsdom
 * environments where `BroadcastChannel` is missing. Every transport made from
 * one `createMemoryBus()` sees the others' posts, exactly like real tabs —
 * including their own, which the store filters on `senderId`.
 */
export function createMemoryBus(): { connect: (name?: string) => OperatingTransport } {
  const listeners = new Set<OperatingListener>();

  return {
    connect: (name = "memory") => {
      const own = new Set<OperatingListener>();
      return {
        name,
        post: (message) => {
          // Round-trip through JSON so a test catches anything a real
          // structured clone / realtime payload could not carry, and so the
          // receiver validates a plain object like it would on the wire.
          const wire: unknown = JSON.parse(JSON.stringify(message));
          for (const listener of [...listeners]) {
            const parsed = parseOperatingMessage(wire);
            if (parsed) listener(parsed);
          }
        },
        subscribe: (listener) => {
          listeners.add(listener);
          own.add(listener);
          return () => {
            listeners.delete(listener);
            own.delete(listener);
          };
        },
        close: () => {
          for (const listener of own) listeners.delete(listener);
          own.clear();
        },
      };
    },
  };
}
