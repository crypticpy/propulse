import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { formatUTC } from "@/lib/utils/time";
import { useUserStore } from "@/stores/userStore";
import { HealthStatusIndicator } from "@/components/ui/HealthStatusIndicator";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";
import {
  useActiveLocation,
  useIsTemporaryActive,
} from "@/hooks/useActiveLocation";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { useProfileStore } from "@/stores/profileStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { RankBadge } from "@/components/rank/RankBadge";
import { ConflictBadge } from "@/components/qso/ConflictBadge";
import { ConnectivityBadge } from "@/components/ui/ConnectivityBadge";

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface HeaderProps {
  /** Number of active alerts */
  alertCount?: number;
  /** Number of critical alerts */
  criticalAlertCount?: number;
  /** Callback when alert indicator is clicked */
  onAlertClick?: () => void;
}

/**
 * Header - Main application header with navigation and user info
 */
export function Header({
  alertCount = 0,
  criticalAlertCount = 0,
  onAlertClick,
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  // Skip the tick on /map, where the clock is not rendered -- otherwise the
  // masthead re-renders once a second on top of the heaviest page in the app
  // to update something nobody can see.
  const clockVisible = location.pathname !== "/map";
  useEffect(() => {
    if (!clockVisible) return;
    // Catch up immediately: the clock froze while it was hidden, so without
    // this the masthead shows the time you left /map for up to a second.
    setCurrentTime(new Date());
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [clockVisible]);
  const { station } = useUserStore();
  const activeLocation = useActiveLocation();
  const isTemporaryActive = useIsTemporaryActive();

  // Main nav items (always visible)
  const mainNavItems: NavItem[] = [
    { path: "/", label: "Home", icon: "🏠" },
    { path: "/solar", label: "Solar Pulse", icon: "☀️" },
    { path: "/map", label: "PropSphere", icon: "🌍" },
  ];

  // Tools items (in dropdown on desktop, inline on mobile)
  const toolsItems: NavItem[] = [
    { path: "/atmos", label: "AtmosPulse", icon: "🌩️" },
    { path: "/dx", label: "DX Wizard", icon: "🧙" },
    { path: "/planner", label: "Band Planner", icon: "📡" },
    { path: "/sdr", label: "SDR Console", icon: "📻" },
    { path: "/log", label: "Logbook", icon: "📝" },
    { path: "/contest", label: "Contest", icon: "🏆" },
    { path: "/nets", label: "Net Registry", icon: "📡" },
    { path: "/ncs", label: "Net Controller", icon: "🎙️" },
    { path: "/awards", label: "Awards", icon: "🎖️" },
    { path: "/contests", label: "Contest Explorer", icon: "📅" },
    { path: "/activation", label: "Activation", icon: "🏕️" },
    { path: "/satellites", label: "Satellite Database", icon: "🛰️" },
  ];

  // Check if any tool is active
  const isToolActive = toolsItems.some(
    (item) =>
      location.pathname === item.path ||
      location.pathname.startsWith(item.path + "/"),
  );
  const activeToolLabel = toolsItems.find(
    (item) =>
      location.pathname === item.path ||
      location.pathname.startsWith(item.path + "/"),
  )?.label;

  // On /map the masthead's job is navigation only. Time, grid and system
  // health are properties of what you are looking at, so PropSphere's
  // MapStatusChip owns them there -- and the masthead clock was a literal
  // duplicate of TimeControl's, two clocks competing for the same fact.
  // Every other route keeps them here; nothing else renders them.
  const showStatusCluster = clockVisible;

  return (
    <>
      <header className="glass-panel sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <span className="text-2xl md:text-3xl animate-pulse-glow">
                ☀️
              </span>
              <div className="hidden sm:block">
                <h1 className="font-orbitron text-lg md:text-xl font-black text-gradient-orange tracking-wider">
                  PROPULSE
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider -mt-1">
                  The ionosphere, visualized
                </p>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-1 md:gap-2 overflow-x-auto sm:overflow-visible max-w-[60vw] sm:max-w-none">
              {/* Main nav items */}
              {mainNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    className={`
                      flex-shrink-0 flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-lg text-sm font-medium
                      transition-colors
                      ${
                        isActive
                          ? "bg-plasma-orange/20 text-plasma-orange"
                          : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                      }
                    `}
                  >
                    <span>{item.icon}</span>
                    <span className="hidden md:inline">{item.label}</span>
                  </Link>
                );
              })}

              {/* Tools dropdown - desktop only (hover to open) */}
              <div className="relative hidden md:block group">
                <button
                  className={`
                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${
                      isToolActive
                        ? "bg-plasma-orange/20 text-plasma-orange"
                        : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                    }
                  `}
                >
                  <span>🛠️</span>
                  <span>{activeToolLabel || "Tools"}</span>
                  <svg
                    className="w-4 h-4 transition-transform group-hover:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Dropdown menu - shows on hover */}
                <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute top-full left-0 pt-1 z-[200]">
                  <div className="py-1 w-44 bg-deep-space border border-white/20 rounded-lg shadow-2xl">
                    {toolsItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`
                            flex items-center gap-2 px-4 py-2.5 text-sm transition-colors
                            ${
                              isActive
                                ? "bg-plasma-orange/20 text-plasma-orange"
                                : "text-gray-300 hover:text-white hover:bg-white/10"
                            }
                          `}
                        >
                          <span>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Tools items - mobile only (inline) */}
              {toolsItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    className={`
                      md:hidden flex-shrink-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium
                      transition-colors
                      ${
                        isActive
                          ? "bg-plasma-orange/20 text-plasma-orange"
                          : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                      }
                    `}
                  >
                    <span>{item.icon}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right side: Time & Settings */}
            <div className="flex items-center gap-4">
              {/* Real-time UTC Clock */}
              {showStatusCluster && (
                <div className="hidden sm:block text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
                    <span className="font-mono text-sm md:text-base text-signal-green font-semibold">
                      {formatUTC(currentTime)}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      UTC
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {station?.grid || "Set location"}
                  </div>
                </div>
              )}

              {/* Alert Indicator + Temporary Location + Settings Button */}
              <div className="flex items-center gap-2">
                {/* Alert Indicator */}
                {alertCount > 0 && (
                  <button
                    onClick={onAlertClick}
                    className={`
                      relative p-2 rounded-lg transition-colors
                      ${
                        criticalAlertCount > 0
                          ? "text-alert-red hover:bg-alert-red/10 animate-pulse"
                          : "text-caution-amber hover:bg-caution-amber/10"
                      }
                    `}
                    aria-label={`${alertCount} active alert${alertCount > 1 ? "s" : ""}${criticalAlertCount > 0 ? ` (${criticalAlertCount} critical)` : ""}`}
                    title="Solar Weather Alerts"
                  >
                    {/* Bell/Warning icon */}
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                    {/* Badge count */}
                    <span
                      className={`
                        absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px]
                        flex items-center justify-center
                        text-[10px] font-bold rounded-full
                        ${
                          criticalAlertCount > 0
                            ? "bg-alert-red text-white"
                            : "bg-caution-amber text-black"
                        }
                      `}
                    >
                      {alertCount}
                    </span>
                  </button>
                )}

                {isTemporaryActive && activeLocation && (
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30"
                    title={`Operating from: ${activeLocation.name || activeLocation.grid}`}
                  >
                    <svg
                      className="w-3.5 h-3.5 text-amber-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-xs font-mono font-medium text-amber-400">
                      {activeLocation.grid}
                    </span>
                  </div>
                )}
                {showStatusCluster && (
                  <>
                    <ConflictBadge />
                    <ConnectivityBadge />
                    <SyncStatusIndicator />
                    <HealthStatusIndicator />
                  </>
                )}
                {/* Profile / Auth */}
                <AuthHeaderButton />
                {/* Shack */}
                <button
                  onClick={() => navigate("/shack")}
                  className={`p-2 rounded-lg transition-colors ${
                    location.pathname === "/shack"
                      ? "text-plasma-orange bg-plasma-orange/10"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                  aria-label="My Shack"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                </button>
                {/* Help */}
                <button
                  onClick={() => navigate("/help")}
                  className={`p-2 rounded-lg transition-colors ${
                    location.pathname.startsWith("/help")
                      ? "text-plasma-orange bg-plasma-orange/10"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                  aria-label="Help & Documentation"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
                {/* Settings */}
                <button
                  onClick={() => navigate("/settings")}
                  className={`p-2 rounded-lg transition-colors ${
                    location.pathname.startsWith("/settings")
                      ? "text-plasma-orange bg-plasma-orange/10"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                  }`}
                  aria-label="Settings"
                  data-tour="settings-button"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

// ── Auth-aware profile/sign-in button ────────────────────────────────

function AuthHeaderButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthUIStore((s) => s.openAuthModal);
  const profileImageUrl = useProfileStore((s) => s.profileImageUrl);
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const { rank } = useOperatorRank();

  // No Supabase → original profile icon
  if (!isSupabaseConfigured) {
    return (
      <button
        onClick={() => navigate("/profile")}
        className={`p-2 rounded-lg transition-colors ${
          location.pathname === "/profile"
            ? "text-plasma-orange bg-plasma-orange/10"
            : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
        }`}
        aria-label="Operator Profile"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      </button>
    );
  }

  // Not authenticated → "Sign In" button
  if (!isAuthenticated) {
    return (
      <button
        onClick={() => openAuthModal()}
        className="text-sm text-gray-400 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-colors"
      >
        Sign In
      </button>
    );
  }

  // Authenticated → avatar circle with rank badge
  const initial = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <div className="flex items-center gap-1.5">
      <RankBadge rank={rank} size="sm" />
      {subscriptionTier === "pro" && (
        <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/30">
          PRO
        </span>
      )}
      <button
        onClick={() => navigate("/profile")}
        className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-plasma-orange/50 focus-visible:outline-none"
        aria-label="Operator Profile"
      >
        {profileImageUrl ? (
          <img
            src={profileImageUrl}
            alt="Avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-plasma-orange/20 text-plasma-orange text-xs font-bold">
            {initial}
          </span>
        )}
      </button>
    </div>
  );
}
