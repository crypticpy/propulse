/**
 * NetDetailPage -- Detailed view of a single net.
 *
 * Fetches net, managers, sessions, and user subscriptions.
 * Desktop: two-column layout (sidebar info card + main content area).
 * Mobile: single column, stacked layout.
 *
 * Shows live banner if active session, NCS dashboard link for managers,
 * description, NCS roster, and session history.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import { useAuthStore } from "@/stores/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { NetTypeBadge } from "@/components/nets/NetTypeBadge";
import { NetLiveIndicator } from "@/components/nets/NetLiveIndicator";
import { SubscribeButton } from "@/components/nets/SubscribeButton";
import { NetSessionHistory } from "@/components/nets/NetSessionHistory";
import { AddToCalendarDropdown } from "@/components/nets/AddToCalendarDropdown";
import { FormalityBadge } from "@/components/nets/FormalityBadge";
import { ProtocolCheatSheet } from "@/components/nets/ProtocolCheatSheet";
import { VoIPNodeList } from "@/components/nets/VoIPNodeList";
import { RSVPButton } from "@/components/nets/RSVPButton";
import { NetRegulars } from "@/components/nets/NetRegulars";
import { NetRecommendations } from "@/components/nets/NetRecommendations";
import { NetParticipationLog } from "@/components/nets/NetParticipationLog";
import TuneToNetButton from "@/components/nets/TuneToNetButton";
import { downloadADIF, sessionToADIF } from "@/lib/export/adif";
import { getNextSessionTime } from "@/lib/utils/netSchedule";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { NetCheckin, NetSession } from "@/types/net";

/** Helper: get ordinal suffix for a number (1st, 2nd, 3rd, etc.) */
function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function NetDetailPage() {
  const { netId } = useParams<{ netId: string }>();
  const isMobile = useIsMobile();

  // Store selectors
  const currentNet = useNetStore((s) => s.currentNet);
  const managers = useNetStore((s) => s.managers);
  const sessions = useNetStore((s) => s.sessions);
  const currentSession = useNetStore((s) => s.currentSession);
  const isLoading = useNetStore((s) => s.isLoading);
  const fetchNet = useNetStore((s) => s.fetchNet);
  const fetchManagers = useNetStore((s) => s.fetchManagers);
  const fetchSessions = useNetStore((s) => s.fetchSessions);
  const fetchMySubscriptions = useNetStore((s) => s.fetchMySubscriptions);
  const isSubscribed = useNetStore((s) => s.isSubscribed);
  const subscribe = useNetStore((s) => s.subscribe);
  const unsubscribe = useNetStore((s) => s.unsubscribe);
  const isManagerFn = useNetStore((s) => s.isManager);
  const fetchRsvps = useNetStore((s) => s.fetchRsvps);
  const addRsvp = useNetStore((s) => s.addRsvp);
  const removeRsvp = useNetStore((s) => s.removeRsvp);
  const getRsvpCount = useNetStore((s) => s.getRsvpCount);
  const hasRsvpdFn = useNetStore((s) => s.hasRsvpd);

  const authUser = useAuthStore((s) => s.user);

  const [notFound, setNotFound] = useState(false);

  // ADIF export handler — fetches checkins for a given session and downloads ADIF
  const handleExportSession = useCallback(
    async (sessionId: string) => {
      if (!isSupabaseConfigured || !currentNet) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabase() as any;

        // Fetch checkins for the target session
        const { data: rows, error: fetchErr } = await supabase
          .from("net_checkins")
          .select("*")
          .eq("session_id", sessionId)
          .order("queue_position", { ascending: true });

        if (fetchErr || !rows) {
          console.error(
            "[NetDetailPage] ADIF export – fetch error:",
            fetchErr?.message,
          );
          return;
        }

        // Map rows to typed checkins
        const checkins: NetCheckin[] = (rows as Record<string, unknown>[]).map(
          (row) => ({
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
          }),
        );

        // Find the matching session object
        const session: NetSession | undefined = sessions.find(
          (s) => s.id === sessionId,
        );
        if (!session) return;

        const dateStr = new Date(session.startedAt)
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "");
        const filename = `${currentNet.name.replace(/[^a-zA-Z0-9]/g, "_")}_${dateStr}.adi`;

        downloadADIF(sessionToADIF(checkins, currentNet, session), filename);
      } catch (err) {
        console.error("[NetDetailPage] ADIF export exception:", err);
      }
    },
    [currentNet, sessions],
  );

  // Fetch all data on mount
  useEffect(() => {
    if (!netId) return;

    let cancelled = false;

    const loadData = async () => {
      const net = await fetchNet(netId);
      if (cancelled) return;
      if (!net) {
        setNotFound(true);
        return;
      }

      // Fetch related data in parallel
      void fetchManagers(netId);
      void fetchSessions(netId);
      void fetchMySubscriptions();
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [netId, fetchNet, fetchManagers, fetchSessions, fetchMySubscriptions]);

  // Compute next session date string (YYYY-MM-DD)
  const nextSessionDate = useMemo(() => {
    if (!currentNet?.schedule) return null;
    const nextTime = getNextSessionTime(currentNet.schedule);
    if (!nextTime) return null;
    return nextTime.toISOString().slice(0, 10);
  }, [currentNet?.schedule]);

  // Fetch RSVPs when net loads and we have a next session date
  useEffect(() => {
    if (!netId || !nextSessionDate) return;
    void fetchRsvps(netId, nextSessionDate);
  }, [netId, nextSessionDate, fetchRsvps]);

  // Format schedule for display
  const formatSchedule = () => {
    if (!currentNet?.schedule) return "Ad-hoc / On demand";

    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const { pattern, dayOfWeek, dayOfMonth, timeUtc, timezone } =
      currentNet.schedule;

    const parts: string[] = [];

    if (pattern === "daily") {
      parts.push("Daily");
    } else if (
      (pattern === "weekly" || pattern === "biweekly") &&
      dayOfWeek !== undefined
    ) {
      parts.push(
        pattern === "biweekly"
          ? `Every other ${days[dayOfWeek]}`
          : `Every ${days[dayOfWeek]}`,
      );
    } else if (pattern === "monthly" && dayOfMonth !== undefined) {
      parts.push(`Monthly on the ${dayOfMonth}${getOrdinalSuffix(dayOfMonth)}`);
    } else {
      parts.push("Ad-hoc");
    }

    if (timeUtc) {
      parts.push(`at ${timeUtc} UTC`);
    }

    if (timezone) {
      parts.push(`(${timezone})`);
    }

    return parts.join(" ");
  };

  // Loading state
  if (isLoading && !currentNet) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" text="Loading net details..." />
      </div>
    );
  }

  // Not found state
  if (notFound || (!isLoading && !currentNet)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <svg
          className="w-12 h-12 text-gray-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-400 text-sm mb-2">Net not found</p>
        <p className="text-gray-500 text-xs mb-4">
          This net may have been removed or the link is incorrect.
        </p>
        <Link
          to="/nets"
          className="text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
        >
          Back to Net Registry
        </Link>
      </div>
    );
  }

  if (!currentNet) return null;

  const net = currentNet;
  const isLive = currentSession?.status === "live";
  const subscribed = isSubscribed(net.id);
  const userIsManager = isManagerFn(net.id);

  // Shared panel class
  const panelClass = isMobile
    ? "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6";

  // --- Sidebar content (shared between desktop sidebar and mobile stacked) ---

  const sidebarContent = (
    <div className="space-y-5">
      {/* Net name + type */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <NetTypeBadge type={net.type} size="md" />
          {net.formalityLevel != null && (
            <FormalityBadge level={net.formalityLevel} size="md" />
          )}
        </div>
        <h1 className="text-lg font-bold text-white mt-2">{net.name}</h1>
      </div>

      {/* Frequency / Mode */}
      <div>
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          Frequency
        </h4>
        <p className="text-sm font-mono text-gray-200">
          {net.frequency} &middot; {net.mode}
        </p>
        {net.altFrequency && (
          <p className="text-xs font-mono text-gray-500 mt-0.5">
            Alt: {net.altFrequency}
          </p>
        )}
        <div className="mt-2">
          <TuneToNetButton frequency={net.frequency} mode={net.mode} />
        </div>
      </div>

      {/* Band */}
      <div>
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          Band
        </h4>
        <p className="text-sm text-gray-200">{net.band}</p>
      </div>

      {/* Schedule */}
      <div>
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          Schedule
        </h4>
        <p className="text-sm text-gray-200">{formatSchedule()}</p>
        {net.durationMinutes && (
          <p className="text-xs text-gray-500 mt-0.5">
            ~{net.durationMinutes} min typical duration
          </p>
        )}
      </div>

      {/* Region */}
      {net.region && (
        <div>
          <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Region
          </h4>
          <p className="text-sm text-gray-200">{net.region}</p>
        </div>
      )}

      {/* Repeater info */}
      {net.repeaterInfo && (
        <div>
          <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
            Repeater
          </h4>
          <div className="text-sm text-gray-200 space-y-0.5">
            <p className="font-mono">{net.repeaterInfo.callsign}</p>
            <p className="text-xs text-gray-400">
              Offset: {net.repeaterInfo.offset}
            </p>
            <p className="text-xs text-gray-400">
              Tone: {net.repeaterInfo.tone}
            </p>
          </div>
        </div>
      )}

      {/* Subscriber count */}
      <div>
        <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          Subscribers
        </h4>
        <p className="text-sm text-gray-200">
          {net.subscriberCount.toLocaleString()}
        </p>
      </div>

      {/* VoIP Access */}
      <VoIPNodeList
        echolinkNode={net.echolinkNode}
        allstarNode={net.allstarNode}
        irlpNode={net.irlpNode}
      />

      {/* Website link */}
      {net.websiteUrl && /^https?:\/\//i.test(net.websiteUrl) && (
        <div>
          <a
            href={net.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Website
          </a>
        </div>
      )}

      {/* Subscribe button */}
      <SubscribeButton
        netId={net.id}
        isSubscribed={subscribed}
        onSubscribe={() => subscribe(net.id)}
        onUnsubscribe={() => unsubscribe(net.id)}
      />

      {/* Add to calendar */}
      <AddToCalendarDropdown net={net} />

      {/* Net Regulars */}
      <NetRegulars netId={net.id} />

      {/* Also popular with these operators */}
      <NetRecommendations netId={net.id} />
    </div>
  );

  // --- Main content area ---

  const mainContent = (
    <div className="space-y-6">
      {/* Live banner */}
      {isLive && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <NetLiveIndicator size="md" />
            <span className="text-sm text-gray-200">
              Net is currently in session
              {currentSession?.ncsCallsign && (
                <>
                  {" "}
                  &middot; NCS:{" "}
                  <span className="font-mono text-plasma-orange">
                    {currentSession.ncsCallsign}
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Controller link (managers only) */}
      {userIsManager && (
        <Link
          to={`/ncs/${net.id}`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/[0.03] text-gray-300 border border-white/5 hover:bg-white/[0.06] transition-all"
        >
          <span className="text-base">🎙️</span>
          You manage this net — go to Controller
          <svg
            className="w-3.5 h-3.5 ml-auto text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      )}

      {/* Protocol Cheat Sheet */}
      {net.protocolNotes && (
        <ProtocolCheatSheet
          protocolNotes={net.protocolNotes}
          newcomerFriendly={net.newcomerFriendly}
        />
      )}

      {/* Description */}
      {net.description && (
        <div className={panelClass}>
          <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
            About This Net
          </h3>
          <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {net.description}
          </p>
        </div>
      )}

      {/* RSVP */}
      {nextSessionDate && (
        <div className={panelClass}>
          <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
            Next Session
          </h3>
          <RSVPButton
            hasRsvpd={hasRsvpdFn(net.id, nextSessionDate)}
            rsvpCount={getRsvpCount(net.id, nextSessionDate)}
            onRsvp={() => addRsvp(net.id, nextSessionDate)}
            onUnrsvp={() => removeRsvp(net.id, nextSessionDate)}
          />
        </div>
      )}

      {/* NCS Roster (legacy inline list) */}
      <div className={panelClass}>
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
          NCS Roster
        </h3>
        {managers.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No managers assigned yet.
          </p>
        ) : (
          <div className="space-y-2">
            {managers.map((manager) => (
              <div
                key={`${manager.netId}-${manager.userId}`}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
              >
                <span className="text-sm font-mono text-gray-200">
                  {manager.callsign || manager.userId.slice(0, 8)}
                </span>
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    manager.role === "owner"
                      ? "bg-plasma-orange/20 text-plasma-orange"
                      : manager.role === "manager"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-cyan-500/20 text-cyan-400"
                  }`}
                >
                  {manager.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session History */}
      <div className={panelClass}>
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
          Session History
        </h3>
        <NetSessionHistory
          sessions={sessions}
          onExportSession={handleExportSession}
        />
      </div>

      {/* Participation Log (authenticated users only) */}
      {authUser && <NetParticipationLog netId={netId} />}
    </div>
  );

  // --- Desktop layout: two-column ---

  if (!isMobile) {
    return (
      <div className="flex gap-8 max-w-[1080px] mx-auto px-6 py-6">
        {/* Back link + Sidebar */}
        <div className="w-[320px] shrink-0 space-y-4">
          <Link
            to="/nets"
            className="inline-flex items-center gap-1 text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Registry
          </Link>
          <div className={panelClass}>{sidebarContent}</div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">{mainContent}</div>
      </div>
    );
  }

  // --- Mobile layout: single column stacked ---

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Back link */}
      <Link
        to="/nets"
        className="inline-flex items-center gap-1 text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to Registry
      </Link>

      {/* Sidebar content (stacked on mobile) */}
      <div className={panelClass}>{sidebarContent}</div>

      {/* Main content */}
      {mainContent}
    </div>
  );
}
