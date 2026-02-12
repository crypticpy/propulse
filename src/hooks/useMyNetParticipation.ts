/**
 * useMyNetParticipation — fetch the current user's net check-in history.
 *
 * Queries `net_checkins` joined with `net_sessions` and `nets` to build a
 * chronological participation log.  When filtered to a single net, also
 * computes streak metrics via `computeStreak`.
 *
 * Note: net_checkins / net_sessions / nets are not yet in the generated
 * Supabase types, so we cast through `any` — matching the pattern used
 * throughout netStore.ts.
 */

import { useEffect, useState, useCallback } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { computeStreak, type StreakResult } from "@/lib/utils/netStreaks";

// ── Row shapes returned by Supabase (snake_case) ────────────────────────────

interface CheckinRow {
  id: string;
  session_id: string;
  checked_in_at: string;
  queue_position: number;
  status: string;
}

interface SessionRow {
  id: string;
  net_id: string;
  started_at: string;
}

interface NetRow {
  id: string;
  name: string;
}

// ── Public Types ─────────────────────────────────────────────────────────────

export interface ParticipationEntry {
  netId: string;
  netName: string;
  sessionId: string;
  /** ISO from session.started_at */
  sessionDate: string;
  /** ISO from checkin.checked_in_at */
  checkedInAt: string;
  queuePosition: number;
  status: string;
}

export interface NetParticipationData {
  entries: ParticipationEntry[];
  isLoading: boolean;
  error: string | null;
  /** Computed only when a specific netId is provided */
  streak: StreakResult | null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the current user's net check-in history.
 *
 * @param netId - if provided, filter to a single net; otherwise all nets
 */
export function useMyNetParticipation(netId?: string): NetParticipationData {
  const user = useAuthStore((s) => s.user);
  const [entries, setEntries] = useState<ParticipationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakResult | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id || !isSupabaseConfigured) return;

    setIsLoading(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Step 1: Fetch checkins for the current user
      const { data: checkins, error: checkinErr } = await supabase
        .from("net_checkins")
        .select("id, session_id, checked_in_at, queue_position, status")
        .eq("user_id", user.id)
        .order("checked_in_at", { ascending: false });

      if (checkinErr) throw checkinErr;
      const checkinRows = (checkins ?? []) as CheckinRow[];
      if (checkinRows.length === 0) {
        setEntries([]);
        setStreak(netId ? computeStreak([]) : null);
        return;
      }

      // Step 2: Fetch corresponding sessions
      const sessionIds = [...new Set(checkinRows.map((c) => c.session_id))];

      let sessionQuery = supabase
        .from("net_sessions")
        .select("id, net_id, started_at")
        .in("id", sessionIds);

      if (netId) {
        sessionQuery = sessionQuery.eq("net_id", netId);
      }

      const { data: sessions, error: sessionErr } = await sessionQuery;
      if (sessionErr) throw sessionErr;

      const sessionRows = (sessions ?? []) as SessionRow[];
      const sessionMap = new Map(
        sessionRows.map((s) => [
          s.id,
          { netId: s.net_id, startedAt: s.started_at },
        ]),
      );

      // Step 3: Fetch net names
      const netIds = [...new Set([...sessionMap.values()].map((s) => s.netId))];

      if (netIds.length === 0) {
        setEntries([]);
        setStreak(netId ? computeStreak([]) : null);
        return;
      }

      const { data: nets, error: netErr } = await supabase
        .from("nets")
        .select("id, name")
        .in("id", netIds);
      if (netErr) throw netErr;

      const netRows = (nets ?? []) as NetRow[];
      const netNameMap = new Map(netRows.map((n) => [n.id, n.name]));

      // Step 4: Assemble participation entries
      const result: ParticipationEntry[] = [];

      for (const c of checkinRows) {
        const session = sessionMap.get(c.session_id);
        if (!session) continue;

        result.push({
          netId: session.netId,
          netName: netNameMap.get(session.netId) ?? "Unknown Net",
          sessionId: c.session_id,
          sessionDate: session.startedAt,
          checkedInAt: c.checked_in_at,
          queuePosition: c.queue_position,
          status: c.status,
        });
      }

      setEntries(result);

      // Step 5: Compute streak if filtered to a single net
      if (netId) {
        const dates = result.map((e) => e.sessionDate);
        setStreak(computeStreak(dates));
      } else {
        setStreak(null);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load participation data";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, netId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { entries, isLoading, error, streak };
}
