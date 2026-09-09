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

/** Which write won a field, and when. */
export interface FieldStamp {
  at: number;
  by: string;
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
  tune: (deviceId: string, workspaceId: string, frequencyKHz: number, mode: string | null) => void;
  /** PR #694 review: the tuned screen reports back so TUNE is no longer fire-and-forget. */
  reportTuneResult: (deviceId: string, workspaceId: string, ok: boolean, reason: string | null) => void;
  setFollowScreens: (next: boolean) => void;
  /** Announces this screen; the returned function withdraws it. */
  registerWorkspace: (input: RegisterWorkspaceInput) => () => void;
  /** Attaches a transport (defaults to `BroadcastChannel`); the returned function detaches it. */
  connect: (transport?: OperatingTransport) => () => void;
  /** Exported for tests and for transports; applies one validated inbound message. */
  applyMessage: (message: OperatingMessage) => void;
  reset: () => void;
}

export type OperatingStateStore = OperatingStateStoreState & OperatingStateStoreActions;

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
    sessionId: { at: 0, by: "" },
    band: { at: 0, by: "" },
    target: { at: 0, by: "" },
    contact: { at: 0, by: "" },
  };
}

/** Strictly increasing per screen, so two writes in the same millisecond still order. */
let lastIssuedStamp = 0;
function nextStamp(): number {
  lastIssuedStamp = Math.max(Date.now(), lastIssuedStamp + 1);
  return lastIssuedStamp;
}

/** Deterministic on every screen: newer wins, and the higher sender id breaks a tie. */
function beats(incoming: FieldStamp, current: FieldStamp): boolean {
  if (incoming.at !== current.at) return incoming.at > current.at;
  return incoming.by > current.by;
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
  const refreshed: WorkspaceRegistration = { ...registration, lastSeen: Date.now() };
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

/** The full cursor as a patch, used to answer a `hello` from a screen that just opened. */
function currentPatch(state: OperatingStateStoreState): CursorPatch {
  const patch: CursorPatch = {};
  for (const field of CURSOR_FIELDS) {
    const stamp = state.stamps[field];
    if (stamp.at === 0) continue;
    Object.assign(patch, { [field]: { value: state.cursor[field], at: stamp.at } });
  }
  return patch;
}

/**
 * Applies a patch under the per-field last-writer-wins rule. `by` is the
 * writer's id — this screen's own for a local edit.
 */
function mergePatch(
  state: OperatingStateStoreState,
  patch: CursorPatch,
  by: string,
): Partial<OperatingStateStoreState> | null {
  const cursor = { ...state.cursor };
  const stamps = { ...state.stamps };
  let changed = false;

  for (const field of CURSOR_FIELDS) {
    const entry = patch[field];
    if (!entry) continue;
    const incoming: FieldStamp = { at: entry.at, by };
    if (!beats(incoming, stamps[field])) continue;
    Object.assign(cursor, { [field]: entry.value });
    stamps[field] = incoming;
    changed = true;
  }

  return changed ? { cursor, stamps } : null;
}

/** Writes one field locally and, when following, sends it. */
function writeField<K extends CursorField>(field: K, value: WorkflowCursor[K]): void {
  const at = nextStamp();
  const patch = { [field]: { value, at } } as CursorPatch;
  const state = useOperatingStateStore.getState();
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
        const command: OperatingCommand = { type: "flipPage", workspaceId, pageIndex };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      setView: (workspaceId, viewId) => {
        const command: OperatingCommand = { type: "setView", workspaceId, viewId };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      tune: (deviceId, workspaceId, frequencyKHz, mode) => {
        const command: OperatingCommand = { type: "tune", deviceId, workspaceId, frequencyKHz, mode };
        recordCommand(command, get().deviceId);
        post({ kind: "command", command });
      },

      reportTuneResult: (deviceId, workspaceId, ok, reason) => {
        const command: OperatingCommand = { type: "tuneResult", deviceId, workspaceId, ok, reason };
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
        set((state) => ({ registrations: { ...state.registrations, [key]: registration } }));
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
            if (message.command.type === "tune" || message.command.type === "tuneResult") {
              const lastSentAt = state.lastAppliedTuneSentAt[message.senderId] ?? 0;
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
            const key = registrationKey(message.registration.deviceId, message.registration.workspaceId);
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
      if (a.deviceId === b.deviceId) return a.workspaceId.localeCompare(b.workspaceId);
      if (a.deviceId === state.deviceId) return -1;
      if (b.deviceId === state.deviceId) return 1;
      return a.deviceId.localeCompare(b.deviceId);
    });
}
