/**
 * contestEventBus - Typed in-process contest event bus (with BroadcastChannel mirroring)
 *
 * Purpose:
 * - Low-latency fan-out for contest events (UI, overlays, analytics, etc.)
 * - Future-proofing for multi-tab via BroadcastChannel without coupling stores together
 *
 * Notes:
 * - Events are JSON-serializable (BroadcastChannel requirement)
 * - Broadcast mirroring is best-effort and ignored when unavailable
 */

export type ContestEvent =
  | {
      type: "SESSION_STARTED";
      sessionId: string;
      contestId: string;
      ts: string;
    }
  | {
      type: "SESSION_ENDED";
      sessionId: string;
      ts: string;
    }
  | {
      type: "RUN_MODE_CHANGED";
      sessionId: string;
      mode: "run" | "sp";
      ts: string;
    }
  | {
      type: "QSO_LOGGED";
      sessionId: string;
      qsoId: string;
      actionId?: string;
      ts: string;
    }
  | {
      type: "QSO_EDITED";
      sessionId: string;
      qsoId: string;
      ts: string;
    }
  | {
      type: "QSO_UNDONE";
      sessionId: string;
      qsoId: string;
      ts: string;
    }
  | {
      type: "VOICE_CANDIDATES_READY";
      sessionId: string;
      transcript: string;
      candidates: string[];
      ts: string;
    }
  | {
      type: "VOICE_ERROR";
      sessionId: string;
      message: string;
      ts: string;
    };

export type ContestEventHandler = (event: ContestEvent) => void;

interface ContestEventBus {
  emit: (event: ContestEvent) => void;
  subscribe: (handler: ContestEventHandler) => () => void;
}

const CHANNEL_NAME = "propulse-contest-events-v1";

const clientId: string = (() => {
  try {
    return crypto.randomUUID();
  } catch {
    return `client-${Math.random().toString(16).slice(2)}`;
  }
})();

type ChannelMessage = { sourceId: string; event: ContestEvent };

function createBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

const channel = createBroadcastChannel();
const handlers = new Set<ContestEventHandler>();

function dispatch(event: ContestEvent) {
  for (const handler of handlers) {
    try {
      handler(event);
    } catch {
      // Swallow handler errors to keep the bus reliable
    }
  }
}

if (channel) {
  channel.addEventListener("message", (msg: MessageEvent<ChannelMessage>) => {
    const data = msg.data;
    if (!data || data.sourceId === clientId) {
      return;
    }
    dispatch(data.event);
  });
}

export const contestEventBus: ContestEventBus = {
  emit: (event) => {
    dispatch(event);
    if (channel) {
      try {
        channel.postMessage({ sourceId: clientId, event } satisfies ChannelMessage);
      } catch {
        // Ignore BroadcastChannel failures
      }
    }
  },
  subscribe: (handler) => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },
};

