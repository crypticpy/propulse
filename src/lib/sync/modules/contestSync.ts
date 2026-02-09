/**
 * Contest sync module — Tier 2 (Incremental)
 *
 * Syncs `contest_sessions` and `contest_qsos` tables.
 * Only completed (inactive) sessions are synced — active sessions stay local.
 * Sessions are immutable after sync (per PRD).
 *
 * Push: Single batch when endContest() is called.
 * Pull: Fetch sessions where updated_at > lastSyncedAt.
 */

import { getSupabase } from "@/lib/supabase";
import { useContestStore } from "@/stores/contestStore";
import type {
  ContestSession,
  ContestQSO,
  ContestCategories,
  CabrilloMeta,
} from "@/stores/contestStore";
import type { SyncModule, SyncableTable, WriteQueueEntry } from "../types";
import type { Tables, TablesInsert } from "@/types/supabase";
import type { Json } from "@/types/supabase";

/** Max QSOs per batch for upsert/pull */
const QSO_BATCH_SIZE = 100;

/** Max sessions per pull page */
const SESSION_BATCH_SIZE = 50;

// ─── Row Mappers ──────────────────────────────────────────────────────

function rowToSession(
  row: Tables<"contest_sessions">,
  qsos: ContestQSO[],
): ContestSession {
  const categories = row.categories as unknown as ContestCategories;
  const cabrilloMeta = row.cabrillo_meta as unknown as CabrilloMeta | null;

  return {
    id: row.id,
    contestId: row.contest_id,
    myExchange: row.my_exchange,
    categories,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    isActive: row.is_active,
    qsos,
    currentSerial: row.current_serial,
    multipliers: [], // Recomputed from QSOs, not stored in session row
    totalPoints: row.total_points,
    totalMultipliers: row.total_multipliers,
    totalScore: row.total_score,
    runMode: "run", // Default — not persisted server-side
    cabrilloMeta: cabrilloMeta ?? undefined,
  };
}

function sessionToRow(
  session: ContestSession,
  userId: string,
): TablesInsert<"contest_sessions"> {
  return {
    id: session.id,
    user_id: userId,
    contest_id: session.contestId,
    my_exchange: session.myExchange,
    categories: session.categories as unknown as Json,
    start_time: session.startTime,
    end_time: session.endTime ?? null,
    is_active: session.isActive,
    current_serial: session.currentSerial,
    total_points: session.totalPoints,
    total_multipliers: session.totalMultipliers,
    total_score: session.totalScore,
    cabrillo_meta: session.cabrilloMeta
      ? (session.cabrilloMeta as unknown as Json)
      : null,
    updated_at: new Date().toISOString(),
  };
}

function rowToQSO(row: Tables<"contest_qsos">): ContestQSO {
  return {
    id: row.id,
    timestamp: row.timestamp,
    callsign: row.callsign,
    band: row.band,
    mode: row.mode,
    rstSent: row.rst_sent,
    rstReceived: row.rst_received,
    exchangeSent: row.exchange_sent,
    exchangeReceived: row.exchange_received,
    serialSent: row.serial_sent ?? undefined,
    serialReceived: row.serial_received ?? undefined,
    points: row.points,
    isMultiplier: row.is_multiplier,
    isDupe: row.is_dupe,
    frequencyKHz: row.frequency_khz ?? undefined,
    // Note: multiplier_value is a single string on server, multipliers is a
    // string[] locally. Only the first multiplier survives the round-trip.
    // This is acceptable — multi-multiplier QSOs are rare and contest rules
    // typically use a single multiplier per QSO.
    multipliers: row.multiplier_value ? [row.multiplier_value] : undefined,
  };
}

function qsoToRow(
  qso: ContestQSO,
  sessionId: string,
  userId: string,
): TablesInsert<"contest_qsos"> {
  return {
    id: qso.id,
    user_id: userId,
    session_id: sessionId,
    timestamp: qso.timestamp,
    callsign: qso.callsign,
    band: qso.band,
    mode: qso.mode,
    rst_sent: qso.rstSent,
    rst_received: qso.rstReceived,
    exchange_sent: qso.exchangeSent,
    exchange_received: qso.exchangeReceived,
    serial_sent: qso.serialSent ?? null,
    serial_received: qso.serialReceived ?? null,
    points: qso.points,
    is_multiplier: qso.isMultiplier,
    is_dupe: qso.isDupe ?? false,
    frequency_khz: qso.frequencyKHz ?? null,
    multiplier_value: qso.multipliers?.[0] ?? null,
  };
}

export const contestSync: SyncModule = {
  name: "contests",
  tier: "incremental",
  tables: ["contest_sessions", "contest_qsos"] as SyncableTable[],

  async pull(userId: string, since: string | null): Promise<string | null> {
    const supabase = getSupabase();
    let maxTimestamp: string | null = since;

    // Paginated fetch of completed sessions
    let hasMore = true;
    let cursor = since;
    const allSessions: Tables<"contest_sessions">[] = [];

    while (hasMore) {
      let query = supabase
        .from("contest_sessions")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", false)
        .order("updated_at", { ascending: true })
        .limit(SESSION_BATCH_SIZE);

      if (cursor) {
        query = query.gt("updated_at", cursor);
      }

      const { data: sessions, error: sessionError } = await query;

      if (sessionError) {
        throw new Error(
          `Contest sessions pull failed: ${sessionError.message}`,
        );
      }

      if (!sessions || sessions.length === 0) {
        hasMore = false;
        break;
      }

      allSessions.push(...sessions);
      cursor = sessions[sessions.length - 1].updated_at;
      hasMore = sessions.length === SESSION_BATCH_SIZE;
    }

    if (allSessions.length === 0) {
      return maxTimestamp;
    }

    // Paginated fetch of QSOs for all pulled sessions
    const sessionIds = allSessions.map((s) => s.id);
    const qsosBySession = new Map<string, ContestQSO[]>();

    // Fetch QSOs per session to avoid massive IN queries
    for (const sessionId of sessionIds) {
      let qsoHasMore = true;
      let qsoOffset = 0;

      while (qsoHasMore) {
        const { data: qsoRows, error: qsoError } = await supabase
          .from("contest_qsos")
          .select("*")
          .eq("user_id", userId)
          .eq("session_id", sessionId)
          .order("timestamp", { ascending: true })
          .range(qsoOffset, qsoOffset + QSO_BATCH_SIZE - 1);

        if (qsoError) {
          throw new Error(`Contest QSOs pull failed: ${qsoError.message}`);
        }

        if (!qsoRows || qsoRows.length === 0) {
          qsoHasMore = false;
          break;
        }

        const list = qsosBySession.get(sessionId) ?? [];
        list.push(...qsoRows.map(rowToQSO));
        qsosBySession.set(sessionId, list);

        qsoOffset += qsoRows.length;
        qsoHasMore = qsoRows.length === QSO_BATCH_SIZE;
      }
    }

    // Build sessions with their QSOs
    const serverSessions = allSessions.map((row) =>
      rowToSession(row, qsosBySession.get(row.id) ?? []),
    );

    // Merge into contest store's session history
    const state = useContestStore.getState();
    const localHistoryMap = new Map(state.sessionHistory.map((s) => [s.id, s]));

    for (const serverSession of serverSessions) {
      localHistoryMap.set(serverSession.id, serverSession);
    }

    useContestStore.setState({
      sessionHistory: Array.from(localHistoryMap.values()),
    });

    // Track max timestamp
    for (const session of allSessions) {
      if (!maxTimestamp || session.updated_at > maxTimestamp) {
        maxTimestamp = session.updated_at;
      }
    }

    return maxTimestamp;
  },

  async push(userId: string): Promise<void> {
    const supabase = getSupabase();
    const { sessionHistory } = useContestStore.getState();

    // Only push completed sessions (not active)
    const completedSessions = sessionHistory.filter((s) => !s.isActive);

    for (const session of completedSessions) {
      // Upsert session row
      const sessionRow = sessionToRow(session, userId);
      const { error: sessionError } = await supabase
        .from("contest_sessions")
        .upsert(sessionRow, { onConflict: "user_id,id" });

      if (sessionError) {
        throw new Error(`Contest session push failed: ${sessionError.message}`);
      }

      // Upsert QSOs in batches
      if (session.qsos.length > 0) {
        for (let i = 0; i < session.qsos.length; i += QSO_BATCH_SIZE) {
          const batch = session.qsos.slice(i, i + QSO_BATCH_SIZE);
          const rows = batch.map((q) => qsoToRow(q, session.id, userId));

          const { error: qsoError } = await supabase
            .from("contest_qsos")
            .upsert(rows, { onConflict: "user_id,session_id,id" });

          if (qsoError) {
            throw new Error(`Contest QSOs push failed: ${qsoError.message}`);
          }
        }
      }
    }
  },

  async processQueue(
    userId: string,
    entries: WriteQueueEntry[],
  ): Promise<string[]> {
    const supabase = getSupabase();
    const processed: string[] = [];

    // Process session entries
    const sessionEntries = entries.filter(
      (e) => e.table === "contest_sessions",
    );
    for (const entry of sessionEntries) {
      if (entry.operation === "upsert") {
        const { user_id: _uid, ...data } = entry.data as Record<
          string,
          unknown
        > & { user_id?: unknown };
        const { error } = await supabase.from("contest_sessions").upsert(
          {
            ...data,
            user_id: userId,
          } as TablesInsert<"contest_sessions">,
          { onConflict: "user_id,id" },
        );
        if (!error) processed.push(entry.queueId);
      }
    }

    // Process QSO entries in batches
    const qsoEntries = entries.filter((e) => e.table === "contest_qsos");
    if (qsoEntries.length > 0) {
      for (let i = 0; i < qsoEntries.length; i += QSO_BATCH_SIZE) {
        const batch = qsoEntries.slice(i, i + QSO_BATCH_SIZE);
        const upserts = batch.filter((e) => e.operation === "upsert");

        if (upserts.length > 0) {
          const rows = upserts.map((e) => {
            const { user_id: _uid, ...d } = e.data as Record<
              string,
              unknown
            > & { user_id?: unknown };
            return { ...d, user_id: userId } as TablesInsert<"contest_qsos">;
          });

          const { error } = await supabase
            .from("contest_qsos")
            .upsert(rows, { onConflict: "user_id,session_id,id" });

          if (!error) {
            for (const entry of upserts) {
              processed.push(entry.queueId);
            }
          }
        }
      }
    }

    return processed;
  },
};
