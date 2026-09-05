import { lazy, Suspense, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { formatUTC } from "@/lib/utils/time";
import { HealthStatusIndicator } from "@/components/ui/HealthStatusIndicator";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { useProfileStore } from "@/stores/profileStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ConflictBadge } from "@/components/qso/ConflictBadge";
import { ConnectivityBadge } from "@/components/ui/ConnectivityBadge";

// Location editing is a secondary masthead action. Keep its trigger and the
// already-lazy editor out of the startup bundle until the header has mounted.
const QuickLocationControl = lazy(() =>
  import("@/components/location/QuickLocationControl").then((module) => ({
    default: module.QuickLocationControl,
  })),
);
const HeaderRankBadge = lazy(() =>
  import("./HeaderRankBadge").then((module) => ({
    default: module.HeaderRankBadge,
  })),
);

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

export interface HeaderProps {
  publicView?: boolean;
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
  publicView = false,
  alertCount = 0,
  criticalAlertCount = 0,
  onAlertClick,
}: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
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
  return (
    <>
      <header className="glass-panel sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-2 lg:grid-cols-[auto_auto_minmax(0,1fr)]">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <span className="text-2xl md:text-3xl animate-pulse-glow">
                ☀️
              </span>
              <div className="hidden xl:block">
                <h1 className="font-orbitron text-lg md:text-xl font-black text-gradient-orange tracking-wider">
                  PROPULSE
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider -mt-1">
                  The ionosphere, visualized
                </p>
              </div>
            </Link>

            {/* Navigation */}
            <nav aria-label="Main navigation" className="order-last col-span-2 flex min-w-0 items-center gap-1 overflow-x-auto md:overflow-visible lg:order-none lg:col-span-1">
              {/* Main nav items */}
              {mainNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    aria-label={item.label}
                    aria-current={isActive ? "page" : undefined}
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
                    <span className="hidden sm:inline">{item.label}</span>
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
                  <span>Tools</span>
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
                <div className="invisible group-hover:visible group-focus-within:visible opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-150 absolute top-full right-0 pt-1 z-[200]">
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
                    aria-current={isActive ? "page" : undefined}
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
            <div className="flex min-w-0 items-center justify-end gap-2">
              <div className="hidden shrink-0 text-right sm:block">
                <HeaderClock />
                {!publicView && <Suspense fallback={<span className="inline-block h-4 w-14" aria-hidden="true" />}>
                  <QuickLocationControl className="ml-auto" />
                </Suspense>}
              </div>

              {/* Global status and account controls stay in the same place on every route. */}
              {publicView ? <Link to="/profile" className="text-sm text-slate-300 px-3 py-3">Sign in</Link> : <div className="flex shrink-0 items-center gap-1">
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

                <ConflictBadge />
                <ConnectivityBadge />
                <SyncStatusIndicator />
                <HealthStatusIndicator compact />
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
              </div>}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}

// Keep the ticking clock local so map rendering and the rest of the masthead
// do not rerender every second. UTC is included by formatUTC.
function HeaderClock() {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={currentTime.toISOString()} className="block whitespace-nowrap font-mono text-sm font-semibold text-signal-green">
      {formatUTC(currentTime)}
    </time>
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
      <Suspense fallback={null}>
        <HeaderRankBadge />
      </Suspense>
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
