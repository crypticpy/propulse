/**
 * NetControllerPage -- Landing page for the Net Controller tool (/ncs).
 *
 * Shows all nets the authenticated user owns or manages, with quick-access
 * action buttons for going live, viewing analytics, and managing each net.
 * Auth-gated: unauthenticated visitors see a sign-in prompt.
 */

import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useNetStore } from "@/stores/netStore";
import { useAuthStore } from "@/stores/authStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { NetTypeBadge } from "@/components/nets/NetTypeBadge";
import { NetLiveIndicator } from "@/components/nets/NetLiveIndicator";
import { getNextSessionTime } from "@/lib/utils/netSchedule";
import type { NetManagerRole } from "@/types/net";
import type { Net } from "@/types/net";

// ── Role badge helpers ──────────────────────────────────────────────────────

const ROLE_LABELS: Record<NetManagerRole, string> = {
  owner: "Owner",
  manager: "Manager",
  ncs: "NCS",
};

const ROLE_CLASSES: Record<NetManagerRole, string> = {
  owner: "bg-plasma-orange/20 text-plasma-orange",
  manager: "bg-purple-500/20 text-purple-400",
  ncs: "bg-cyan-500/20 text-cyan-400",
};

function RoleBadge({ role }: { role: NetManagerRole }) {
  return (
    <span
      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${ROLE_CLASSES[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

// ── Next session time formatter ─────────────────────────────────────────────

function formatNextSession(net: Net): string {
  if (!net.schedule) return "Ad-hoc schedule";

  const next = getNextSessionTime(net.schedule);
  if (!next) return "No upcoming session";

  const now = new Date();
  const diffMs = next.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs / (1000 * 60)) % 60);

  // Within the next 24 hours: show relative time
  if (diffHours < 24) {
    if (diffHours === 0) {
      return `Starting in ${diffMinutes}m`;
    }
    return `In ${diffHours}h ${diffMinutes}m`;
  }

  // Beyond 24 hours: show day and time
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = dayNames[next.getUTCDay()];
  const time = next.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return `${day} at ${time}`;
}

// ── Page Component ──────────────────────────────────────────────────────────

export function NetControllerPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const authUser = useAuthStore((s) => s.user);
  const managedNets = useNetStore((s) => s.managedNets);
  const isLoadingManagedNets = useNetStore((s) => s.isLoadingManagedNets);
  const fetchMyManagedNets = useNetStore((s) => s.fetchMyManagedNets);

  // Fetch managed nets on mount when authenticated
  useEffect(() => {
    if (authUser) {
      void fetchMyManagedNets();
    }
  }, [authUser, fetchMyManagedNets]);

  const panelClass = isMobile
    ? "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-4"
    : "bg-panel/30 backdrop-blur-sm border border-white/5 rounded-2xl p-6";

  // ── Auth gate ───────────────────────────────────────────────────────────

  if (!authUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <svg
          className="w-14 h-14 text-gray-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <p className="text-gray-400 text-base font-medium mb-1">
          Sign in to manage your nets
        </p>
        <p className="text-gray-500 text-sm">
          The Net Controller lets you operate, schedule, and analyze your nets.
        </p>
      </div>
    );
  }

  // ── Main content ────────────────────────────────────────────────────────

  return (
    <div
      className={
        isMobile
          ? "px-4 py-4 space-y-4"
          : "max-w-[1200px] mx-auto px-6 py-6 space-y-6"
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Net Controller</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage and operate your nets
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/ncs/create")}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/25 transition-all"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          {!isMobile && "Create Net"}
        </button>
      </div>

      {/* Loading state */}
      {isLoadingManagedNets && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <LoadingSpinner size="lg" text="Loading your nets..." />
        </div>
      )}

      {/* Empty state */}
      {!isLoadingManagedNets && managedNets.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[30vh] text-center">
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
              d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
            />
          </svg>
          <p className="text-gray-400 text-sm mb-2">
            You don't manage any nets yet.
          </p>
          <p className="text-gray-500 text-xs">
            Create one or get added as a manager to an existing net.
          </p>
        </div>
      )}

      {/* Managed nets grid */}
      {!isLoadingManagedNets && managedNets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {managedNets.map(({ net, role, hasLiveSession }) => (
            <div key={net.id} className={panelClass}>
              {/* Top row: badges + live indicator */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <NetTypeBadge type={net.type} size="sm" />
                  <RoleBadge role={role} />
                </div>
                {hasLiveSession && <NetLiveIndicator size="sm" />}
              </div>

              {/* Net name */}
              <h3 className="text-sm font-bold text-white truncate mb-1">
                {net.name}
              </h3>

              {/* Frequency + mode */}
              <p className="text-xs text-gray-400 font-mono mb-2">
                {net.frequency} &middot; {net.mode}
              </p>

              {/* Next session */}
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-4">
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{formatNextSession(net)}</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                <Link
                  to={`/ncs/${net.id}/live`}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    hasLiveSession
                      ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
                      : "bg-plasma-orange/15 text-plasma-orange border border-plasma-orange/30 hover:bg-plasma-orange/25"
                  }`}
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
                      d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 14.828a4 4 0 010-5.656m5.656 0a4 4 0 010 5.656M12 12h.01"
                    />
                  </svg>
                  {hasLiveSession ? "Rejoin" : "Go Live"}
                </Link>

                <Link
                  to={`/ncs/${net.id}/analytics`}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1.5"
                >
                  Analytics
                </Link>

                <Link
                  to={`/ncs/${net.id}`}
                  className="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1.5 ml-auto"
                >
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
