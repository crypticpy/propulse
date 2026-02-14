import { Link } from "react-router-dom";

function DrawerIcon({ icon }: { icon: string }) {
  const cls = "w-5 h-5 text-gray-300";
  if (icon === "profile") {
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
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
    );
  }
  if (icon === "shack") {
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
          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
        />
      </svg>
    );
  }
  return <span className="text-lg">{icon}</span>;
}

interface ToolsDrawerProps {
  onClose: () => void;
}

const stationItems = [
  {
    path: "/profile",
    label: "Operator Profile",
    description: "Callsign, bio, awards & stats",
    icon: "profile",
  },
  {
    path: "/shack",
    label: "My Shack",
    description: "Equipment, signal paths & performance",
    icon: "shack",
  },
];

const tools = [
  {
    path: "/dx",
    label: "DX Wizard",
    description: "Propagation advice & path analysis",
    icon: "🧙",
  },
  {
    path: "/planner",
    label: "Band Planner",
    description: "24-hour band forecasts",
    icon: "📡",
  },
  {
    path: "/log",
    label: "Logbook",
    description: "QSO log, import & ADIF export",
    icon: "📓",
  },
  {
    path: "/sdr",
    label: "SDR Console",
    description: "Waterfall, tuning & radio control",
    icon: "📻",
  },
  {
    path: "/contest",
    label: "Contest",
    description: "Contest logging & scoring",
    icon: "🏆",
  },
  {
    path: "/nets",
    label: "Net Registry",
    description: "Discover & subscribe to ham radio nets",
    icon: "📡",
  },
  {
    path: "/ncs",
    label: "Net Controller",
    description: "Manage & go live on your nets",
    icon: "🎙️",
  },
];

/**
 * ToolsDrawer - Slide-up overlay with links to tool pages
 *
 * Anchored above the BottomTabBar. Shows DX Wizard, Band Planner, and Contest.
 * Uses the same emoji icons as the desktop Header.tsx tools dropdown.
 */
export function ToolsDrawer({ onClose }: ToolsDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-50 bg-deep-space/95 backdrop-blur-md border-t border-white/10 rounded-t-2xl p-4 space-y-2 animate-in">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-3" />

        {/* My Station section */}
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 pt-1">
          My Station
        </div>
        {stationItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={onClose}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors min-h-[44px]"
          >
            <DrawerIcon icon={item.icon} />
            <div>
              <div className="text-sm font-medium text-white">{item.label}</div>
              <div className="text-xs text-gray-400">{item.description}</div>
            </div>
          </Link>
        ))}

        {/* Separator */}
        <div className="border-t border-white/10 my-1" />

        {/* Tools section */}
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 pt-1">
          Tools
        </div>
        {tools.map((tool) => (
          <Link
            key={tool.path}
            to={tool.path}
            onClick={onClose}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors min-h-[44px]"
          >
            <span className="text-lg">{tool.icon}</span>
            <div>
              <div className="text-sm font-medium text-white">{tool.label}</div>
              <div className="text-xs text-gray-400">{tool.description}</div>
            </div>
          </Link>
        ))}

        {/* Separator */}
        <div className="border-t border-white/10 my-1" />

        {/* Support section */}
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium px-3 pt-1">
          Support
        </div>
        <Link
          to="/help"
          onClick={onClose}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors min-h-[44px]"
        >
          <svg
            className="w-5 h-5 text-gray-300"
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
          <div>
            <div className="text-sm font-medium text-white">Help & Docs</div>
            <div className="text-xs text-gray-400">
              Guides, references & FAQ
            </div>
          </div>
        </Link>
      </div>
    </>
  );
}
