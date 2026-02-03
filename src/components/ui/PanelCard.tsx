/**
 * PanelCard Component
 *
 * Unified panel wrapper providing consistent header layouts, smart collapse/expand
 * behavior, and responsive content adaptation across all PropSphere panels.
 *
 * Features:
 * - Consistent header with title, badges, help, and expand icons
 * - Three-state system: collapsed → default → expanded
 * - Fixed vertical height with scrollable content
 * - Smooth animations for state transitions
 */

import { forwardRef, useState, useCallback } from "react";
import { HelpButton, HelpModal } from "./HelpModal";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PanelBadge {
  /** Short label (e.g., "Kp", "SFI") */
  label: string;
  /** Value to display */
  value: string | number;
  /** Color variant */
  color?: "default" | "success" | "warning" | "danger";
}

export interface HelpContent {
  title: string;
  sections: Array<{ title: string; content: string }>;
}

export interface PanelCardProps {
  // Identity
  /** Panel title (displayed uppercase) */
  title: string;
  /** Optional subtitle below title */
  subtitle?: string;

  // Status indicators (appear inline in header)
  /** Compact badges shown after title */
  badges?: PanelBadge[];

  // Status dot
  /** Show a status indicator dot */
  statusDot?: "success" | "warning" | "danger" | "neutral";

  // Help system
  /** Content for help modal */
  helpContent?: HelpContent;

  // Expand behavior
  /** Whether panel can be expanded */
  expandable?: boolean;
  /** How expansion works */
  expandMode?: "modal" | "callback";
  /** Callback when expand is clicked */
  onExpand?: () => void;

  // Collapse behavior
  /** Whether panel can be collapsed */
  collapsible?: boolean;
  /** Current collapsed state (controlled) */
  collapsed?: boolean;
  /** Toggle collapse callback */
  onToggleCollapse?: () => void;
  /** Content shown when collapsed (key metrics summary) */
  collapsedSummary?: React.ReactNode;

  // Content
  /** Main panel content */
  children: React.ReactNode;
  /** Footer content (sticks to bottom) */
  footer?: React.ReactNode;

  // Styling
  className?: string;
  /** Card variant */
  variant?: "default" | "highlight" | "alert";
  /** Remove default padding from content area */
  noPadding?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge color mappings
// ─────────────────────────────────────────────────────────────────────────────

const BADGE_COLORS: Record<
  NonNullable<PanelBadge["color"]>,
  { bg: string; text: string }
> = {
  default: { bg: "bg-white/5", text: "text-gray-400" },
  success: { bg: "bg-signal-green/20", text: "text-signal-green" },
  warning: { bg: "bg-caution-amber/20", text: "text-caution-amber" },
  danger: { bg: "bg-alert-red/20", text: "text-alert-red" },
};

const STATUS_DOT_COLORS: Record<
  NonNullable<PanelCardProps["statusDot"]>,
  string
> = {
  success: "bg-signal-green",
  warning: "bg-caution-amber",
  danger: "bg-alert-red",
  neutral: "bg-gray-500",
};

// ─────────────────────────────────────────────────────────────────────────────
// Card variant styles (matching Card.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<NonNullable<PanelCardProps["variant"]>, string> = {
  default: "border-white/10 hover:border-white/20",
  highlight:
    "border-plasma-orange/30 shadow-glow-orange hover:border-plasma-orange/50",
  alert:
    "border-alert-red/30 shadow-[0_0_20px_rgba(255,68,85,0.3)] hover:border-alert-red/50",
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const PanelCard = forwardRef<HTMLDivElement, PanelCardProps>(
  (
    {
      // Identity
      title,
      subtitle,

      // Status
      badges = [],
      statusDot,

      // Help
      helpContent,

      // Expand
      expandable = false,
      expandMode: _expandMode = "callback",
      onExpand,

      // Collapse
      collapsible = false,
      collapsed = false,
      onToggleCollapse,
      collapsedSummary,

      // Content
      children,
      footer,

      // Styling
      className = "",
      variant = "default",
      noPadding = false,
    },
    ref,
  ) => {
    const [showHelp, setShowHelp] = useState(false);

    // Handle header click in collapsed mode
    const handleHeaderClick = useCallback(() => {
      if (collapsed && onToggleCollapse) {
        onToggleCollapse();
      }
    }, [collapsed, onToggleCollapse]);

    // Handle keyboard navigation
    const handleHeaderKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (collapsed && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggleCollapse?.();
        }
      },
      [collapsed, onToggleCollapse],
    );

    // Determine if we have action icons
    const hasHelp = !!helpContent;
    const hasExpand = expandable && onExpand;
    const hasActions = hasHelp || hasExpand;

    return (
      <>
        <div
          ref={ref}
          className={`
            bg-white/[0.03] backdrop-blur-md border rounded-2xl
            transition-all duration-200
            ${VARIANT_STYLES[variant]}
            ${collapsed ? "p-2.5" : "p-4"}
            ${className}
          `}
        >
          {/* ═══════════════════════════════════════════════════════════════
              HEADER - Always visible, consistent layout
              ═══════════════════════════════════════════════════════════════ */}
          <div
            className={`
              flex items-center justify-between gap-2 flex-shrink-0
              ${collapsed ? "cursor-pointer" : ""}
              ${!collapsed && (subtitle || !noPadding) ? "mb-3" : ""}
            `}
            onClick={handleHeaderClick}
            onKeyDown={handleHeaderKeyDown}
            role={collapsed ? "button" : undefined}
            tabIndex={collapsed ? 0 : undefined}
            aria-expanded={collapsible ? !collapsed : undefined}
          >
            {/* Left side: Title group */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Collapse chevron (when collapsible) */}
              {collapsible && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse?.();
                  }}
                  className="p-0.5 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                  aria-label={collapsed ? "Expand panel" : "Collapse panel"}
                >
                  <svg
                    className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${
                      collapsed ? "" : "rotate-90"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              )}

              {/* Status dot */}
              {statusDot && (
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[statusDot]}`}
                />
              )}

              {/* Title and subtitle */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[10px] font-medium text-gray-300 uppercase tracking-wide">
                    {title}
                  </h3>

                  {/* Inline badges */}
                  {badges.length > 0 && (
                    <div className="flex items-center gap-1">
                      {badges.map((badge, idx) => {
                        const colors = BADGE_COLORS[badge.color || "default"];
                        return (
                          <span
                            key={idx}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
                          >
                            {badge.label} {badge.value}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsed summary (inline with title when collapsed) */}
                  {collapsed && collapsedSummary && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-px h-3 bg-white/10" />
                      {collapsedSummary}
                    </div>
                  )}
                </div>

                {/* Subtitle (only when not collapsed) */}
                {!collapsed && subtitle && (
                  <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Right side: Action icons - ALWAYS top-right */}
            {hasActions && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasHelp && (
                  <HelpButton
                    onClick={() => setShowHelp(true)}
                    className="flex-shrink-0"
                  />
                )}
                {hasExpand && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onExpand?.();
                    }}
                    className="p-1 rounded-full bg-white/5 hover:bg-white/10
                               border border-white/10 text-gray-400 hover:text-white
                               transition-colors flex-shrink-0"
                    title="Expand"
                    aria-label="Expand panel"
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              CONTENT - Collapsible with smooth animation
              ═══════════════════════════════════════════════════════════════ */}
          <div
            className={`
              transition-all duration-300 ease-in-out overflow-hidden
              ${collapsed ? "max-h-0 opacity-0" : "max-h-[2000px] opacity-100"}
            `}
          >
            {/* Main content area */}
            <div className={`${noPadding ? "" : ""} flex-1 min-h-0`}>
              {children}
            </div>

            {/* Footer (sticks to bottom) */}
            {footer && (
              <div className="flex-shrink-0 pt-2 mt-2 border-t border-white/5">
                {footer}
              </div>
            )}
          </div>
        </div>

        {/* Help Modal */}
        {helpContent && (
          <HelpModal
            isOpen={showHelp}
            onClose={() => setShowHelp(false)}
            title={helpContent.title}
            sections={helpContent.sections}
          />
        )}
      </>
    );
  },
);

PanelCard.displayName = "PanelCard";

export default PanelCard;
