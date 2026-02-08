import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ToolsDrawer } from "./ToolsDrawer";

const tabs = [
  { path: "/", label: "Home", icon: "home" },
  { path: "/solar", label: "Solar", icon: "sun" },
  { path: "/map", label: "Map", icon: "globe" },
  { path: "/tools", label: "Tools", icon: "wrench" },
  { path: "/log", label: "Log", icon: "book" },
] as const;

/** Paths that should highlight the Tools tab */
const TOOLS_PATHS = ["/dx", "/planner", "/sdr", "/contest", "/profile", "/shack"];

/**
 * TabIcon - Renders inline SVG icons for the bottom tab bar
 *
 * Uses simple, recognizable 24x24 SVG paths with stroke style
 * consistent with the Heroicons used in Header.tsx.
 */
function TabIcon({ icon }: { icon: (typeof tabs)[number]["icon"] }) {
  const cls = "w-5 h-5";

  switch (icon) {
    case "home":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
          />
        </svg>
      );
    case "sun":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      );
    case "globe":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    case "wrench":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z"
          />
        </svg>
      );
    case "book":
      return (
        <svg
          className={cls}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      );
  }
}

/**
 * BottomTabBar - Fixed bottom navigation for mobile viewports
 *
 * Five tabs: Home, Solar, Map, Tools (opens drawer), Log.
 * The Tools tab opens a ToolsDrawer overlay instead of navigating directly.
 */
export function BottomTabBar() {
  const location = useLocation();
  const [showTools, setShowTools] = useState(false);

  const isToolsActive = TOOLS_PATHS.some((p) =>
    location.pathname.startsWith(p),
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-void-black/95 backdrop-blur-sm border-t border-white/10 pb-safe">
        <div className="flex items-center justify-around h-14">
          {tabs.map((tab) => {
            const isTools = tab.icon === "wrench";
            const isActive = isTools
              ? isToolsActive || showTools
              : location.pathname === tab.path;

            if (isTools) {
              return (
                <button
                  key="tools"
                  onClick={() => setShowTools(!showTools)}
                  className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors ${
                    isActive ? "text-plasma-orange" : "text-gray-500"
                  }`}
                  aria-label="Tools menu"
                >
                  <TabIcon icon={tab.icon} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors ${
                  isActive ? "text-plasma-orange" : "text-gray-500"
                }`}
                aria-label={tab.label}
              >
                <TabIcon icon={tab.icon} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {showTools && <ToolsDrawer onClose={() => setShowTools(false)} />}
    </>
  );
}
