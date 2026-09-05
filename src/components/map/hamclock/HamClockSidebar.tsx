/**
 * HamClockSidebar -- Collapsible sidebar wrapper for HamClock view
 *
 * Renders a fixed-width sidebar column on either edge of the HamClock layout.
 * When collapsed, keeps an overlaid tab with a chevron pointing inward.
 * When expanded, shows full-width content with a collapse tab on the inner edge.
 */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HamClockSidebarProps {
  side: "left" | "right";
  collapsed: boolean;
  onToggle: () => void;
  width?: number;
  children: ReactNode;
  className?: string;
}

// ---------------------------------------------------------------------------
// Chevron SVGs (inline, 16x16, stroke-based)
// ---------------------------------------------------------------------------

function ChevronLeft() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HamClockSidebar({
  side,
  collapsed,
  onToggle,
  width = 280,
  children,
  className = "",
}: HamClockSidebarProps) {
  const isLeft = side === "left";
  const currentWidth = collapsed ? 0 : width;

  // Determine which chevron to show:
  // Left sidebar expanded -> collapse = point left; collapsed -> expand = point right
  // Right sidebar expanded -> collapse = point right; collapsed -> expand = point left
  const showChevronLeft = isLeft ? !collapsed : collapsed;

  const borderClass = isLeft
    ? "border-r border-white/10"
    : "border-l border-white/10";

  // Collapse tab positioning:
  // Left sidebar: tab sits at the right edge
  // Right sidebar: tab sits at the left edge
  const tabPositionClass = isLeft
    ? "right-0 translate-x-full top-1/2 -translate-y-1/2"
    : "left-0 -translate-x-full top-1/2 -translate-y-1/2";

  const tabRoundedClass = isLeft ? "rounded-r" : "rounded-l";

  return (
    <div
      className={`relative h-full min-h-0 min-w-0 flex-shrink-0 ${borderClass} ${className}`}
      style={{
        width: currentWidth,
        minWidth: currentWidth,
      }}
    >
      {/* Sidebar content (hidden when collapsed) */}
      {!collapsed && (
        <div
          data-hamclock-scroll
          className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-void-black/95"
        >
          {children}
        </div>
      )}

      {/* Collapse / expand tab */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={
          collapsed ? `Expand ${side} sidebar` : `Collapse ${side} sidebar`
        }
        className={`
          absolute ${tabPositionClass}
          flex items-center justify-center
          w-5 h-10
          bg-void-black/80 hover:bg-white/10
          border border-white/10 ${tabRoundedClass}
          text-gray-400 hover:text-white
          transition-colors duration-150
          z-10
        `}
      >
        {showChevronLeft ? <ChevronLeft /> : <ChevronRight />}
      </button>
    </div>
  );
}
