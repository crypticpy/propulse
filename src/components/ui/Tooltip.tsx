import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "@/stores/settingsStore";
import { DEFAULT_UI_INTERACTION } from "@/types/user";

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Tooltip Component
 *
 * Portal-based tooltip that renders to document.body with fixed positioning.
 * Escapes overflow:hidden ancestors by rendering outside the DOM tree.
 * Supports hover, keyboard focus, and touch.
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className = "",
}) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const touchTimer = useRef<ReturnType<typeof setTimeout>>();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipHeight = tooltipEl?.offsetHeight ?? 40;

    // Default: above trigger. Flip below if near top edge
    const needsFlip = rect.top < tooltipHeight + 8;
    setFlipped(needsFlip);

    setPos({
      top: needsFlip ? rect.bottom + 6 : rect.top - 6,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const show = useCallback(() => {
    setVisible(true);
    // Position on next frame to ensure tooltip is mounted
    requestAnimationFrame(updatePosition);
  }, [updatePosition]);

  const hide = useCallback(() => {
    setVisible(false);
    if (touchTimer.current) {
      clearTimeout(touchTimer.current);
      touchTimer.current = undefined;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    show();
    // Auto-dismiss after 2s on touch
    touchTimer.current = setTimeout(hide, 2000);
  }, [show, hide]);

  // Update position while visible (e.g., scroll)
  useEffect(() => {
    if (!visible) return;
    updatePosition();
  }, [visible, updatePosition]);

  // Clean up timer
  useEffect(() => {
    return () => {
      if (touchTimer.current) clearTimeout(touchTimer.current);
    };
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className={`relative inline-flex ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onTouchStart={handleTouchStart}
      >
        {children}
      </span>
      {visible &&
        pos &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="fixed z-[70] px-3 py-2 max-w-xs w-max bg-panel border border-white/10 rounded-lg shadow-lg text-sm text-gray-200 font-sans text-center pointer-events-none"
            style={{
              top: flipped ? pos.top : undefined,
              bottom: flipped ? undefined : `${window.innerHeight - pos.top}px`,
              left: pos.left,
              transform: "translateX(-50%)",
            }}
          >
            {content}
            {/* Arrow */}
            <span
              className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
                flipped ? "-top-2 border-b-panel" : "-bottom-2 border-t-panel"
              }`}
              aria-hidden="true"
            />
          </div>,
          document.body,
        )}
    </>
  );
};

Tooltip.displayName = "Tooltip";

/**
 * InfoTip — a small info icon that shows a tooltip on hover.
 * Designed to sit beside metric labels for inline help.
 *
 * Respects the "Show hover info tips" preference.
 * When disabled, the icon still renders (for visual consistency)
 * but the hover tooltip is suppressed.
 */
export const InfoTip: React.FC<{ content: string; className?: string }> = ({
  content,
  className = "",
}) => {
  const showTooltips = useSettingsStore(
    (s) =>
      (s.uiInteraction ?? DEFAULT_UI_INTERACTION).showHoverTooltips !== false,
  );

  const icon = (
    <svg
      tabIndex={0}
      aria-label="More info"
      className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300 focus:text-gray-300 cursor-help transition-colors shrink-0 outline-none focus:ring-1 focus:ring-white/20 rounded-full"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );

  if (!showTooltips) {
    return <span className={`inline-flex ${className}`}>{icon}</span>;
  }

  return (
    <Tooltip content={content} className={className}>
      {icon}
    </Tooltip>
  );
};

InfoTip.displayName = "InfoTip";

export default Tooltip;
