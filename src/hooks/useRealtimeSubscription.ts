/**
 * useRealtimeSubscription — Generic Supabase Realtime hook.
 *
 * Subscribe to INSERT/DELETE events on any Supabase table.
 * Automatically unsubscribes on cleanup. No-op if Supabase is not configured.
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

/**
 * Subscribe to Supabase Realtime changes on a table.
 *
 * @param table   - The table name to subscribe to (e.g. "follows", "activity_feed")
 * @param filter  - Optional Postgres filter string (e.g. "user_id=eq.abc123")
 * @param onInsert - Callback fired on INSERT events
 * @param onDelete - Callback fired on DELETE events
 * @param enabled  - Whether to activate the subscription (default: true)
 */
export function useRealtimeSubscription(
  table: string,
  filter: string | null,
  onInsert?: (payload: Record<string, unknown>) => void,
  onDelete?: (payload: Record<string, unknown>) => void,
  enabled = true,
): void {
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Stable callback refs to avoid resubscribing on every render
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;

    const supabase = getSupabase();
    const channelName = `realtime-${table}-${filter ?? "all"}-${Date.now()}`;

    // Build the subscription config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channelConfig: Record<string, any> = {
      event: "*",
      schema: "public",
      table,
    };
    if (filter) {
      channelConfig.filter = filter;
    }

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
          if (payload.eventType === "INSERT" && onInsertRef.current) {
            onInsertRef.current(payload.new);
          }
          if (payload.eventType === "DELETE" && onDeleteRef.current) {
            onDeleteRef.current(payload.old);
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
  }, [table, filter, enabled]);
}
