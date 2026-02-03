import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { formatUTC } from "@/lib/utils/time";
import { useUserStore } from "@/stores/userStore";
import { SettingsModal } from "@/components/settings/SettingsModal";
import {
  useActiveLocation,
  useIsTemporaryActive,
} from "@/hooks/useActiveLocation";

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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const { station } = useUserStore();
  const activeLocation = useActiveLocation();
  const isTemporaryActive = useIsTemporaryActive();

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Main nav items (always visible)
  const mainNavItems: NavItem[] = [
    { path: "/", label: "Home", icon: "🏠" },
    { path: "/solar", label: "Solar Pulse", icon: "☀️" },
    { path: "/map", label: "PropSphere", icon: "🌍" },
  ];

  // Tools items (in dropdown on desktop, inline on mobile)
  const toolsItems: NavItem[] = [
    { path: "/dx", label: "DX Wizard", icon: "🧙" },
    { path: "/planner", label: "Band Planner", icon: "📡" },
    { path: "/log", label: "LogBook", icon: "📝" },
    { path: "/contest", label: "Contest", icon: "🏆" },
  ];

  // Check if any tool is active
  const isToolActive = toolsItems.some(
    (item) => location.pathname === item.path,
  );
  const activeToolLabel = toolsItems.find(
    (item) => location.pathname === item.path,
  )?.label;

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
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}
