/**
 * Net Analytics Page — CSS-only charts for net managers.
 *
 * Route: /nets/:netId/analytics
 * Auth-gated: only net managers can view.
 *
 * Displays attendance trends, top participants, session duration,
 * and day-of-week distribution using SVG + div-based charts.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { useNetStore } from "@/stores/netStore";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { NetSession, NetCheckin } from "@/types/net";

// ── Chart Constants (matching QSOByBandChart) ──────────────────────────

const BAR_HEIGHT = 20;
const BAR_GAP = 6;
const LABEL_WIDTH = 60;
const COUNT_WIDTH = 44;
const BAR_COLOR = "rgb(255,107,53)"; // plasma-orange

// ── Day-of-week labels ─────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Helpers ────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatSessionDate(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Component ──────────────────────────────────────────────────────────

export function NetAnalyticsPage() {
  const { netId } = useParams<{ netId: string }>();
  const user = useAuthStore((s) => s.user);
  const fetchNet = useNetStore((s) => s.fetchNet);
  const fetchManagers = useNetStore((s) => s.fetchManagers);
  const currentNet = useNetStore((s) => s.currentNet);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sessions, setSessions] = useState<NetSession[]>([]);
  const [checkins, setCheckins] = useState<NetCheckin[]>([]);

  // ── Data Fetching ──────────────────────────────────────────────────

  useEffect(() => {
    if (!netId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      // Fetch net + managers in parallel to check authorization
      await Promise.all([fetchNet(netId!), fetchManagers(netId!)]);

      if (cancelled) return;

      // Check manager status after managers are loaded
      const managerCheck = useNetStore.getState().isManager(netId!);
      setAuthorized(managerCheck);

      if (!managerCheck) {
        setLoading(false);
        return;
      }

      // Fetch completed sessions (up to 24)
      const supabase = getSupabase();

      const { data: sessionRows } = await (supabase as any)
        .from("net_sessions")
        .select("*")
        .eq("net_id", netId!)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(24);

      if (cancelled) return;

      if (!sessionRows || sessionRows.length === 0) {
        setSessions([]);
        setCheckins([]);
        setLoading(false);
        return;
      }

      const mappedSessions: NetSession[] = (
        sessionRows as Record<string, unknown>[]
      ).map((row) => ({
        id: row.id as string,
        netId: row.net_id as string,
        ncsUserId: row.ncs_user_id as string,
        ncsCallsign: row.ncs_callsign as string,
        startedAt: row.started_at as string,
        endedAt: (row.ended_at as string) ?? undefined,
        status: row.status as NetSession["status"],
        checkinCount: (row.checkin_count as number) ?? 0,
        notes: (row.notes as string) ?? undefined,
        summary: (row.summary as string) ?? undefined,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }));

      setSessions(mappedSessions);

      // Fetch all check-ins for these sessions in a single query
      const sessionIds = mappedSessions.map((s) => s.id);
      const { data: checkinRows } = await (supabase as any)
        .from("net_checkins")
        .select("*")
        .in("session_id", sessionIds);

      if (cancelled) return;

      const mappedCheckins: NetCheckin[] = (
        (checkinRows ?? []) as Record<string, unknown>[]
      ).map((row) => ({
        id: row.id as string,
        sessionId: row.session_id as string,
        callsign: row.callsign as string,
        userId: (row.user_id as string) ?? undefined,
        checkedInAt: row.checked_in_at as string,
        status: row.status as NetCheckin["status"],
        isRelay: (row.is_relay as boolean) ?? false,
        relayVia: (row.relay_via as string) ?? undefined,
        trafficNotes: (row.traffic_notes as string) ?? undefined,
        queuePosition: row.queue_position as number,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }));

      setCheckins(mappedCheckins);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [netId, user?.id, fetchNet, fetchManagers]);

  // ── Computed Analytics ─────────────────────────────────────────────

  /** Sessions sorted chronologically (oldest first) for charts */
  const chronologicalSessions = useMemo(
    () =>
      [...sessions]
        .sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
        )
        .slice(-12),
    [sessions],
  );

  /** Attendance per session (last 12) */
  const attendanceData = useMemo(() => {
    return chronologicalSessions.map((session) => {
      const count = checkins.filter((c) => c.sessionId === session.id).length;
      return {
        label: formatSessionDate(session.startedAt),
        count,
      };
    });
  }, [chronologicalSessions, checkins]);

  /** Top 10 participants by total check-in count */
  const topParticipants = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of checkins) {
      counts.set(c.callsign, (counts.get(c.callsign) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([callsign, count]) => ({ callsign, count }));
  }, [checkins]);

  /** Summary stats */
  const stats = useMemo(() => {
    const totalSessions = sessions.length;
    const totalCheckins = checkins.length;
    const avgAttendance =
      totalSessions > 0 ? Math.round(totalCheckins / totalSessions) : 0;

    // Average duration from sessions that have endedAt
    const sessionsWithEnd = sessions.filter((s) => s.endedAt);
    const avgDuration =
      sessionsWithEnd.length > 0
        ? sessionsWithEnd.reduce((sum, s) => {
            const start = new Date(s.startedAt).getTime();
            const end = new Date(s.endedAt!).getTime();
            return sum + (end - start) / (1000 * 60);
          }, 0) / sessionsWithEnd.length
        : 0;

    return { totalSessions, totalCheckins, avgAttendance, avgDuration };
  }, [sessions, checkins]);

  /** Day-of-week distribution (count of sessions per day) */
  const dayOfWeekData = useMemo(() => {
    const counts = new Array(7).fill(0) as number[];
    for (const s of sessions) {
      const day = new Date(s.startedAt).getDay();
      counts[day]++;
    }
    return counts;
  }, [sessions]);

  const dayOfWeekMax = Math.max(...dayOfWeekData, 1);

  // ── Loading State ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner text="Loading analytics..." />
      </div>
    );
  }

  // ── Auth Gate ──────────────────────────────────────────────────────

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="text-4xl font-mono font-bold text-plasma-orange">
          403
        </div>
        <h1 className="text-xl font-semibold text-white">Not Authorized</h1>
        <p className="text-gray-400 max-w-md">
          Only net managers can access analytics for this net.
        </p>
        {netId && (
          <Link
            to={`/nets/${netId}`}
            className="px-4 py-2 rounded-lg bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium"
          >
            Back to Net
          </Link>
        )}
      </div>
    );
  }

  // ── Empty State ────────────────────────────────────────────────────

  const hasData = sessions.length > 0;

  // ── Top-Participants SVG Chart (horizontal bars, QSOByBandChart pattern) ──

  const participantBars = topParticipants.map((p) => ({
    label: p.callsign,
    count: p.count,
    widthPct:
      topParticipants.length > 0 && topParticipants[0].count > 0
        ? (p.count / topParticipants[0].count) * 100
        : 0,
  }));

  const participantChartWidth = 300;
  const participantBarArea = participantChartWidth - LABEL_WIDTH - COUNT_WIDTH;
  const participantSvgHeight =
    participantBars.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;

  // ── Attendance SVG Chart (vertical bars) ──────────────────────────

  const attendanceMax = Math.max(...attendanceData.map((d) => d.count), 1);
  const attendanceChartWidth = 300;
  const attendanceChartHeight = 160;
  const attendanceBarWidth =
    attendanceData.length > 0
      ? Math.min(24, (attendanceChartWidth - 20) / attendanceData.length - 4)
      : 20;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          to={`/nets/${netId}`}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; Back
        </Link>
        <h1 className="text-xl font-bold text-white">
          {currentNet?.name ?? "Net"} &mdash; Analytics
        </h1>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 text-sm gap-2">
          <p>No completed sessions yet.</p>
          <p className="text-gray-600 text-xs">
            Analytics will appear after your first completed session.
          </p>
        </div>
      ) : (
        <>
          {/* ── Stats Summary ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total Sessions"
              value={stats.totalSessions.toString()}
            />
            <StatCard
              label="Total Check-ins"
              value={stats.totalCheckins.toString()}
            />
            <StatCard
              label="Avg Attendance"
              value={stats.avgAttendance.toString()}
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(stats.avgDuration)}
            />
          </div>

          {/* ── Charts Grid ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance Chart (vertical bars) */}
            <ChartCard title="Attendance Over Time">
              {attendanceData.length > 0 ? (
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${attendanceChartWidth} ${attendanceChartHeight + 24}`}
                    width="100%"
                    className="block mx-auto max-w-full"
                    style={{
                      aspectRatio: `${attendanceChartWidth}/${attendanceChartHeight + 24}`,
                    }}
                    role="img"
                    aria-label="Attendance over time"
                  >
                    {attendanceData.map((d, i) => {
                      const barH =
                        (d.count / attendanceMax) * attendanceChartHeight;
                      const x =
                        10 +
                        i *
                          ((attendanceChartWidth - 20) /
                            attendanceData.length) +
                        ((attendanceChartWidth - 20) / attendanceData.length -
                          attendanceBarWidth) /
                          2;
                      const y = attendanceChartHeight - barH;

                      return (
                        <g key={i}>
                          {/* Bar background */}
                          <rect
                            x={x}
                            y={0}
                            width={attendanceBarWidth}
                            height={attendanceChartHeight}
                            rx={3}
                            fill="rgba(255,255,255,0.04)"
                          />
                          {/* Bar fill */}
                          <rect
                            x={x}
                            y={y}
                            width={attendanceBarWidth}
                            height={Math.max(barH, 2)}
                            rx={3}
                            fill={BAR_COLOR}
                            opacity={0.85}
                          />
                          {/* Count above bar */}
                          {d.count > 0 && (
                            <text
                              x={x + attendanceBarWidth / 2}
                              y={y - 4}
                              textAnchor="middle"
                              className="fill-gray-400"
                              fontSize={9}
                              fontFamily="monospace"
                            >
                              {d.count}
                            </text>
                          )}
                          {/* Date label */}
                          <text
                            x={x + attendanceBarWidth / 2}
                            y={attendanceChartHeight + 14}
                            textAnchor="middle"
                            className="fill-gray-500"
                            fontSize={8}
                            fontFamily="monospace"
                          >
                            {d.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            {/* Top Participants (horizontal bars) */}
            <ChartCard title="Most Active Participants">
              {participantBars.length > 0 ? (
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${participantChartWidth} ${participantSvgHeight}`}
                    width="100%"
                    className="block mx-auto max-w-full"
                    style={{
                      aspectRatio: `${participantChartWidth}/${participantSvgHeight}`,
                    }}
                    role="img"
                    aria-label="Most active participants"
                  >
                    {participantBars.map((bar, i) => {
                      const y = i * (BAR_HEIGHT + BAR_GAP);
                      const barWidth =
                        (bar.widthPct / 100) * participantBarArea;
                      return (
                        <g key={bar.label}>
                          {/* Callsign label */}
                          <text
                            x={LABEL_WIDTH - 6}
                            y={y + BAR_HEIGHT / 2 + 1}
                            textAnchor="end"
                            dominantBaseline="middle"
                            className="fill-gray-300"
                            fontSize={11}
                            fontFamily="monospace"
                          >
                            {bar.label}
                          </text>
                          {/* Bar background */}
                          <rect
                            x={LABEL_WIDTH}
                            y={y}
                            width={participantBarArea}
                            height={BAR_HEIGHT}
                            rx={3}
                            fill="rgba(255,255,255,0.04)"
                          />
                          {/* Bar fill */}
                          <rect
                            x={LABEL_WIDTH}
                            y={y}
                            width={Math.max(barWidth, 2)}
                            height={BAR_HEIGHT}
                            rx={3}
                            fill={BAR_COLOR}
                            opacity={0.85}
                          />
                          {/* Count label */}
                          <text
                            x={LABEL_WIDTH + participantBarArea + 6}
                            y={y + BAR_HEIGHT / 2 + 1}
                            textAnchor="start"
                            dominantBaseline="middle"
                            className="fill-gray-400"
                            fontSize={11}
                            fontFamily="monospace"
                          >
                            {bar.count}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            {/* Day of Week Distribution (div-based bars) */}
            <ChartCard title="Sessions by Day of Week">
              <div className="flex items-end justify-between gap-2 h-32 px-2">
                {dayOfWeekData.map((count, i) => {
                  const pct = (count / dayOfWeekMax) * 100;
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center flex-1 gap-1"
                    >
                      {count > 0 && (
                        <span className="text-[9px] text-gray-400 font-mono">
                          {count}
                        </span>
                      )}
                      <div className="w-full flex items-end justify-center h-20">
                        <div
                          className="w-full max-w-[28px] rounded-t-sm transition-all"
                          style={{
                            height: `${Math.max(pct, count > 0 ? 8 : 0)}%`,
                            backgroundColor:
                              count > 0
                                ? "rgb(255,107,53)"
                                : "rgba(255,255,255,0.04)",
                            opacity: count > 0 ? 0.85 : 1,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {DAY_LABELS[i]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel/30 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-gray-500">
        {label}
      </span>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel/30 border border-white/5 rounded-2xl p-4">
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
      No data yet
    </div>
  );
}
