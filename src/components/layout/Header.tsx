import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { formatUTC } from "@/lib/utils/time";
import { useUserStore } from "@/stores/userStore";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { useAllSolarData } from "@/hooks/useSolarData";

/**
 * Header - Main application header with navigation and user info
 */
export function Header() {
  const location = useLocation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const { station } = useUserStore();
  const { lastUpdated } = useAllSolarData();

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: "/", label: "Home", icon: "🏠" },
    { path: "/solar", label: "Solar Pulse", icon: "☀️" },
    { path: "/map", label: "PropSphere", icon: "🌍" },
    { path: "/log", label: "LogBook", icon: "📝" },
    { path: "/learn", label: "Learn", icon: "📚" },
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
            <nav className="flex items-center gap-1 md:gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`
                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                    transition-colors
                    ${
                      location.pathname === item.path
                        ? "bg-plasma-orange/20 text-plasma-orange"
                        : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                    }
                  `}
                >
                  <span>{item.icon}</span>
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Right side: Offline Indicator, Time & Settings */}
            <div className="flex items-center gap-4">
              {/* Offline Indicator */}
              <OfflineIndicator lastSyncTime={lastUpdated} />

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
