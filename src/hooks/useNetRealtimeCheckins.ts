/**
 * useNetRealtimeCheckins -- Subscribe to live check-in updates for a session.
 *
 * Creates a direct Supabase Realtime channel for the `net_checkins` table,
 * handling INSERT, UPDATE, and DELETE events. Side-effect only: updates
 * netStore.checkins on each event.
 *
 * Uses a direct channel subscription (not useRealtimeSubscription) because
 * the generic hook only wires INSERT and DELETE callbacks -- we also need
 * UPDATE handling for live queue management.
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useNetStore } from "@/stores/netStore";
import type { NetCheckin, CheckinStatus } from "@/types/net";

// ── Row-to-model mapper (mirrors netStore's private rowToCheckin) ────

function rowToCheckin(row: Record<string, unknown>): NetCheckin {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    callsign: row.callsign as string,
    userId: (row.user_id as string) ?? undefined,
    checkedInAt: row.checked_in_at as string,
    status: row.status as CheckinStatus,
    isRelay: (row.is_relay as boolean) ?? false,
    relayVia: (row.relay_via as string) ?? undefined,
    trafficNotes: (row.traffic_notes as string) ?? undefined,
    queuePosition: row.queue_position as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Subscribe to real-time INSERT/UPDATE/DELETE events on `net_checkins`
 * for a given session. Updates `netStore.checkins` as a side-effect.
 *
 * @param sessionId - The session ID to filter check-ins for (null = disabled)
 * @param enabled   - Whether the subscription is active (default: true)
 */
export function useNetRealtimeCheckins(
  sessionId: string | null,
  enabled = true,
): void {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled || !sessionId) return;

    const supabase = getSupabase();
    const channelName = `net-checkins-${sessionId}-${Date.now()}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelConfig: Record<string, any> = {
      event: "*",
      schema: "public",
      table: "net_checkins",
      filter: `session_id=eq.${sessionId}`,
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
          const store = useNetStore.getState();

          if (payload.eventType === "INSERT") {
            const checkin = rowToCheckin(payload.new);
            useNetStore.setState({
              checkins: [...store.checkins, checkin],
            });
          }

          if (payload.eventType === "UPDATE") {
            const updated = rowToCheckin(payload.new);
            useNetStore.setState({
              checkins: store.checkins.map((c) =>
                c.id === updated.id ? updated : c,
              ),
            });
          }

          if (payload.eventType === "DELETE") {
            const oldId = payload.old.id as string;
            useNetStore.setState({
              checkins: store.checkins.filter((c) => c.id !== oldId),
            });
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
}
