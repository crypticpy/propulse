import { Link } from "react-router-dom";

interface ToolsDrawerProps {
  onClose: () => void;
}

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
    path: "/contest",
    label: "Contest",
    description: "Contest logging & scoring",
    icon: "🏆",
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
      </div>
    </>
  );
}
