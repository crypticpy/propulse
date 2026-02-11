/**
 * HamClockInfoPanel -- Individually collapsible panel for the info sidebar stack
 *
 * Used inside HamClockSidebar to build a vertical stack of collapsible sections
 * (DE Station, DX Target, Band Conditions, etc.). Each panel has a clickable
 * header with icon, title, and rotate-able chevron. Content animates open/closed
 * using the CSS grid-template-rows 0fr/1fr technique for smooth height transitions.
 */

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HamClockInfoPanelProps {
  id: string;
  title: string;
  icon?: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HamClockInfoPanel({
  id,
  title,
  icon,
  collapsed,
  onToggle,
  children,
}: HamClockInfoPanelProps) {
  return (
    <div className="border-b border-white/10" data-panel-id={id}>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={`panel-content-${id}`}
        className="
          flex items-center justify-between w-full
          px-3 py-2 cursor-pointer
          hover:bg-white/5
          transition-colors duration-150
        "
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span className="flex-shrink-0 text-gray-400 w-4 h-4 flex items-center justify-center">
              {icon}
            </span>
          )}
          <span className="text-xs font-medium text-gray-300 uppercase tracking-wider truncate">
            {title}
          </span>
        </div>

        {/* Chevron -- rotates 180deg when expanded */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-200"
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Collapsible content using grid-template-rows for smooth animation */}
      <div
        id={`panel-content-${id}`}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
