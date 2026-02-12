/**
 * NetRegulars -- Top 10 participants by check-in count for a given net.
 *
 * Queries `net_sessions` + `net_checkins` from Supabase, groups by callsign,
 * sorts descending, and renders a compact roster list.
 *
 * Note: net_checkins / net_sessions are not yet in the generated Supabase
 * types, so we cast through `any` — matching the pattern used throughout
 * netStore.ts and useMyNetParticipation.ts.
 */

import { useState, useEffect, useCallback } from "react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────────────────────

interface NetRegularsProps {
  netId: string;
}

interface RegularEntry {
  callsign: string;
  count: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export function NetRegulars({ netId }: NetRegularsProps) {
  const [regulars, setRegulars] = useState<RegularEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRegulars = useCallback(async () => {
    if (!isSupabaseConfigured || !netId) return;

    setIsLoading(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Step 1: Get completed session IDs for this net
      const { data: sessions, error: sessionErr } = await supabase
        .from("net_sessions")
        .select("id")
        .eq("net_id", netId)
        .eq("status", "completed");

      if (sessionErr) throw sessionErr;

      const sessionIds: string[] = (sessions ?? []).map(
        (s: { id: string }) => s.id,
      );

      if (sessionIds.length === 0) {
        setRegulars([]);
        return;
      }

      // Step 2: Get all checkins for those sessions
      const { data: checkins, error: checkinErr } = await supabase
        .from("net_checkins")
        .select("callsign")
        .in("session_id", sessionIds);

      if (checkinErr) throw checkinErr;

      // Step 3: Count check-ins per callsign
      const countMap = new Map<string, number>();
      for (const row of (checkins ?? []) as { callsign: string }[]) {
        if (row.callsign) {
          countMap.set(row.callsign, (countMap.get(row.callsign) ?? 0) + 1);
        }
      }

      // Step 4: Sort descending and take top 10
      const sorted = [...countMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([callsign, count]) => ({ callsign, count }));

      setRegulars(sorted);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load regulars";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [netId]);

  useEffect(() => {
    void fetchRegulars();
  }, [fetchRegulars]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-white/5 bg-panel/30 p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-32 rounded bg-white/10" />
          <div className="h-3 w-48 rounded bg-white/5" />
          <div className="h-3 w-40 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (regulars.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-panel/30 p-4 text-center text-sm text-gray-500">
        No session history yet
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-white/5 bg-panel/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-200">
          Regular Check-Ins
        </h3>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-gray-400">
          {regulars.length}
        </span>
      </div>

      <div className="space-y-0.5">
        {regulars.map((entry, idx) => (
          <div key={entry.callsign} className="flex items-center gap-3 py-1.5">
            <span className="w-5 text-right text-[10px] text-gray-500">
              {idx + 1}
            </span>
            <span className="font-mono text-sm text-white">
              {entry.callsign}
            </span>
            <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-400">
              {entry.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

NetRegulars.displayName = "NetRegulars";

export default NetRegulars;
