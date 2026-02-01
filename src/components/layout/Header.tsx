import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { formatUTC } from "@/lib/utils/time";
import { useUserStore } from "@/stores/userStore";
import { useMapStore } from "@/stores/mapStore";
import { SettingsModal } from "@/components/settings/SettingsModal";

/**
 * Header - Main application header with navigation and user info
 */
export function Header() {
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const { station } = useUserStore();
  const setFullscreen = useMapStore((state) => state.setFullscreen);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: "/", label: "Home", icon: "🏠" },
    { path: "/solar", label: "Solar Pulse", icon: "☀️" },
    { path: "/map", label: "PropSphere", icon: "🌍" },
    { path: "/dx", label: "DX Wizard", icon: "🧙" },
    { path: "/planner", label: "Band Planner", icon: "📡" },
    { path: "/log", label: "LogBook", icon: "📝" },
    { path: "/contest", label: "Contest", icon: "🏆" },
  ];

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
            <nav className="flex items-center gap-1 md:gap-2 overflow-x-auto max-w-[60vw] sm:max-w-none">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <div key={item.path} className="flex items-center gap-1">
                    <Link
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

                    {/* Pro View button (PropSphere only) */}
                    {item.path === "/map" && isActive && (
                      <button
                        type="button"
                        onClick={() => setFullscreen(true)}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg
                                   bg-plasma-orange/15 border border-plasma-orange/40
                                   text-plasma-orange hover:bg-plasma-orange/25 transition-colors"
                        title="Open Pro View (fullscreen)"
                        aria-label="Open Pro View (fullscreen)"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                          />
                        </svg>
                        <span className="hidden md:inline text-xs font-semibold">
                          Pro View
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Right side: Time & Settings */}
            <div className="flex items-center gap-4">
              {/* UTC Time */}
              <div className="hidden sm:block text-right">
                <div className="font-mono text-sm md:text-base text-signal-green font-semibold">
                  {formatUTC(currentTime)}
                </div>
                <div className="text-[10px] text-gray-500">
                  {station?.grid || "Set location"}
                </div>
              </div>

              {/* Settings Button */}
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
                aria-label="Settings"
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
      </header>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}
