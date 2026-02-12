/**
 * useNetSession -- Subscribe to live session state for the NCS dashboard.
 *
 * Creates a direct Supabase Realtime channel for a specific `net_sessions` row,
 * handling UPDATE events to keep `netStore.currentSession` in sync.
 * Returns current session data, elapsed time, and live status.
 *
 * Uses a direct channel subscription (not useRealtimeSubscription) because
 * the generic hook only wires INSERT and DELETE callbacks -- we need UPDATE
 * handling for session status transitions.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useNetStore } from "@/stores/netStore";
import type { NetSession, SessionStatus } from "@/types/net";

// ── Elapsed-time refresh interval (ms) ──────────────────────────────

const ELAPSED_INTERVAL_MS = 30_000;

// ── Row-to-model mapper (mirrors netStore's private rowToSession) ────

function rowToSession(row: Record<string, unknown>): NetSession {
  return {
    id: row.id as string,
    netId: row.net_id as string,
    ncsUserId: row.ncs_user_id as string,
    ncsCallsign: row.ncs_callsign as string,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? undefined,
    status: row.status as SessionStatus,
    checkinCount: (row.checkin_count as number) ?? 0,
    notes: (row.notes as string) ?? undefined,
    summary: (row.summary as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Return type for the useNetSession hook */
export interface UseNetSessionResult {
  /** Current session data from the store */
  session: NetSession | null;
  /** Whether the session is currently live */
  isLive: boolean;
  /** Minutes elapsed since session started (updates every 30s) */
  elapsedMinutes: number;
}

/**
 * Subscribe to real-time UPDATE events on a specific `net_sessions` row.
 * Returns current session data, elapsed time, and live status.
 *
 * @param sessionId - The session ID to subscribe to (null = disabled)
 * @param enabled   - Whether the subscription is active (default: true)
 */
export function useNetSession(
  sessionId: string | null,
  enabled = true,
): UseNetSessionResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const session = useNetStore((s) => s.currentSession);

  // ── Elapsed time state ─────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session?.startedAt || session.status !== "live") return;

    const interval = setInterval(() => {
      setNow(Date.now());
    }, ELAPSED_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [session?.startedAt, session?.status]);

  const elapsedMinutes = useMemo(() => {
    if (!session?.startedAt) return 0;
    const startMs = new Date(session.startedAt).getTime();
    return Math.max(0, Math.floor((now - startMs) / 60_000));
  }, [session?.startedAt, now]);

  const isLive = session?.status === "live";

  // ── Realtime subscription ──────────────────────────────────────────

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled || !sessionId) return;

    const supabase = getSupabase();
    const channelName = `net-session-${sessionId}-${Date.now()}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelConfig: Record<string, any> = {
      event: "*",
      schema: "public",
      table: "net_sessions",
      filter: `id=eq.${sessionId}`,
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        channelConfig,
        (payload: {
          eventType: string;
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          if (payload.eventType === "UPDATE") {
            const updated = rowToSession(payload.new);
            useNetStore.setState({ currentSession: updated });
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, enabled]);

  return { session, isLive, elapsedMinutes };
}
