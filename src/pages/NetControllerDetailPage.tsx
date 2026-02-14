/**
 * NetControllerDetailPage -- Manager-focused detail view for a net at /ncs/:netId.
 *
 * Auth + manager gated: only authenticated users who are managers of this net
 * can access the management tools. Shows "Not Authorized" with link back to /ncs
 * otherwise.
 *
 * Provides action buttons for the live NCS dashboard and analytics, plus
 * management sections for roster, rotation calendar, and session history
 * with ADIF export.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { NetTypeBadge } from "@/components/nets/NetTypeBadge";
import { FormalityBadge } from "@/components/nets/FormalityBadge";
import { ManagerRoster } from "@/components/nets/ManagerRoster";
import {
  NCSRotationCalendar,
  type NCSRotationEntry,
} from "@/components/nets/NCSRotationCalendar";
import { NetSessionHistory } from "@/components/nets/NetSessionHistory";
import { downloadADIF, sessionToADIF } from "@/lib/export/adif";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { NetManagerRole, NetCheckin, NetSession } from "@/types/net";

export function NetControllerDetailPage() {
  const { netId } = useParams<{ netId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Auth
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const authUser = useAuthStore((s) => s.user);

  // Store selectors
  const currentNet = useNetStore((s) => s.currentNet);
  const managers = useNetStore((s) => s.managers);
  const sessions = useNetStore((s) => s.sessions);
  const isLoading = useNetStore((s) => s.isLoading);
  const fetchNet = useNetStore((s) => s.fetchNet);
  const fetchManagers = useNetStore((s) => s.fetchManagers);
  const fetchSessions = useNetStore((s) => s.fetchSessions);
  const isManagerFn = useNetStore((s) => s.isManager);
  const addManagerAction = useNetStore((s) => s.addManager);
  const removeManagerAction = useNetStore((s) => s.removeManager);

  const [notFound, setNotFound] = useState(false);

  const userIsManager = netId ? isManagerFn(netId) : false;
  const userIsOwner = !!(
    authUser &&
    currentNet &&
    authUser.id === currentNet.createdBy
  );

  // ── Data fetching ────────────────────────────────────────────────────

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

      void fetchManagers(netId);
      void fetchSessions(netId);
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [netId, fetchNet, fetchManagers, fetchSessions]);

  // ── NCS rotation (localStorage-backed per net) ───────────────────────

  const rotationKey = netId ? `propulse-ncs-rotation-${netId}` : "";

  const [ncsRotation, setNcsRotation] = useState<NCSRotationEntry[]>(() => {
    if (!rotationKey) return [];
    try {
      const raw = localStorage.getItem(rotationKey);
      return raw ? (JSON.parse(raw) as NCSRotationEntry[]) : [];
    } catch {
      return [];
    }
  });

  const handleUpdateRotation = useCallback(
    (updated: NCSRotationEntry[]) => {
      setNcsRotation(updated);
      if (rotationKey) {
        localStorage.setItem(rotationKey, JSON.stringify(updated));
      }
    },
    [rotationKey],
  );

  // ── Manager add / remove handlers ────────────────────────────────────

  const handleAddManager = useCallback(
    (callsign: string, role: NetManagerRole) => {
      if (!netId) return;
      void addManagerAction(netId, callsign, role);
    },
    [netId, addManagerAction],
  );

  const handleRemoveManager = useCallback(
    (userId: string) => {
      if (!netId) return;
      void removeManagerAction(netId, userId);
    },
    [netId, removeManagerAction],
  );

  // ── ADIF export handler ──────────────────────────────────────────────

  const handleExportSession = useCallback(
    async (sessionId: string) => {
      if (!isSupabaseConfigured || !currentNet) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supabase = getSupabase() as any;

        const { data: rows, error: fetchErr } = await supabase
          .from("net_checkins")
          .select("*")
          .eq("session_id", sessionId)
          .order("queue_position", { ascending: true });

        if (fetchErr || !rows) {
          console.error(
            "[NetControllerDetailPage] ADIF export -- fetch error:",
            fetchErr?.message,
          );
          return;
        }

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
        console.error("[NetControllerDetailPage] ADIF export exception:", err);
      }
    },
    [currentNet, sessions],
  );

  // ── Shared panel class ───────────────────────────────────────────────

  const panelClass = isMobile
    ? "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6";

  // ── Loading state ────────────────────────────────────────────────────

  if (isLoading && !currentNet) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingSpinner size="lg" text="Loading net details..." />
      </div>
    );
  }

  // ── Not found state ──────────────────────────────────────────────────

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
          to="/ncs"
          className="text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
        >
          Back to Net Controller
        </Link>
      </div>
    );
  }

  if (!currentNet) return null;

  const net = currentNet;

  // ── Authorization gate ───────────────────────────────────────────────

  if (!isAuthenticated || !userIsManager) {
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
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <p className="text-gray-400 text-sm mb-2">Not Authorized</p>
        <p className="text-gray-500 text-xs mb-4">
          You must be a manager of this net to access the controller dashboard.
        </p>
        <Link
          to="/ncs"
          className="text-sm text-plasma-orange hover:text-plasma-orange/80 transition-colors"
        >
          Back to Net Controller
        </Link>
      </div>
    );
  }

  // ── Back link ────────────────────────────────────────────────────────

  const backLink = (
    <Link
      to="/ncs"
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
      Back to Net Controller
    </Link>
  );

  // ── Header ───────────────────────────────────────────────────────────

  const headerSection = (
    <div className={panelClass}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <NetTypeBadge type={net.type} size="md" />
        {net.formalityLevel != null && (
          <FormalityBadge level={net.formalityLevel} size="md" />
        )}
      </div>
      <h1 className="text-lg font-bold text-white">{net.name}</h1>
      <Link
        to={`/nets/${netId}`}
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-plasma-orange transition-colors mt-1"
      >
        <svg
          className="w-3 h-3"
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
        View public listing
      </Link>
    </div>
  );

  // ── Action buttons ───────────────────────────────────────────────────

  const actionButtons = (
    <div className={`flex ${isMobile ? "flex-col" : "flex-row"} gap-3`}>
      <button
        type="button"
        onClick={() => navigate(`/ncs/${netId}/live`)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-plasma-orange text-white hover:bg-plasma-orange/90 transition-all justify-center flex-1"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        Open NCS Dashboard
      </button>
      <button
        type="button"
        onClick={() => navigate(`/ncs/${netId}/analytics`)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-200 border border-white/10 hover:bg-white/10 transition-all justify-center flex-1"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        View Analytics
      </button>
    </div>
  );

  // ── Management sections ──────────────────────────────────────────────

  const managementSections = (
    <div className="space-y-6">
      {/* Manager Roster */}
      <ManagerRoster
        netId={net.id}
        managers={managers}
        isOwner={userIsOwner}
        onAddManager={handleAddManager}
        onRemoveManager={handleRemoveManager}
      />

      {/* NCS Rotation Calendar */}
      <NCSRotationCalendar
        rotation={ncsRotation}
        isManager={userIsManager}
        onUpdateRotation={handleUpdateRotation}
      />

      {/* Session History with ADIF export */}
      <div className={panelClass}>
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
          Session History
        </h3>
        <NetSessionHistory
          sessions={sessions}
          onExportSession={handleExportSession}
        />
      </div>
    </div>
  );

  // ── Desktop layout ──────────────────────────────────────────────────

  if (!isMobile) {
    return (
      <div className="max-w-[860px] mx-auto px-6 py-6 space-y-6">
        {backLink}
        {headerSection}
        {actionButtons}
        {managementSections}
      </div>
    );
  }

  // ── Mobile layout ───────────────────────────────────────────────────

  return (
    <div className="px-4 py-4 space-y-4">
      {backLink}
      {headerSection}
      {actionButtons}
      {managementSections}
    </div>
  );
}
