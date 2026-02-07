import React from "react";

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Tooltip Component
 *
 * A CSS-only tooltip that appears on hover above the trigger element.
 * No JavaScript state required - uses pure CSS for performance.
 *
 * @example
 * ```tsx
 * <Tooltip content="Solar flux index measures radio emissions from the sun">
 *   <span>SFI</span>
 * </Tooltip>
 * ```
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className = "",
}) => {
  return (
    <span className={`relative inline-flex group ${className}`}>
      {children}
      <span
        role="tooltip"
        className={[
          // Positioning
          "absolute",
          "bottom-full",
          "left-1/2",
          "-translate-x-1/2",
          "mb-2",
          "z-[70]",

          // Sizing
          "px-3",
          "py-2",
          "max-w-xs",
          "w-max",

          // Appearance
          "bg-panel",
          "border",
          "border-white/10",
          "rounded-lg",
          "shadow-lg",

          // Typography
          "text-sm",
          "text-gray-200",
          "font-sans",
          "text-center",

          // Visibility & Animation (hover + keyboard focus)
          "opacity-0",
          "invisible",
          "group-hover:opacity-100",
          "group-hover:visible",
          "group-focus-within:opacity-100",
          "group-focus-within:visible",
          "transition-all",
          "duration-200",

          // Prevent pointer events on tooltip itself
          "pointer-events-none",
        ].join(" ")}
      >
        {content}
        {/* Arrow */}
        <span
          className={[
            "absolute",
            "top-full",
            "left-1/2",
            "-translate-x-1/2",
            "border-4",
            "border-transparent",
            "border-t-panel",
          ].join(" ")}
          aria-hidden="true"
        />
      </span>
    </span>
  );
};

Tooltip.displayName = "Tooltip";

/**
 * InfoTip — a small ⓘ icon that shows a tooltip on hover.
 * Designed to sit beside metric labels for inline help.
 */
export const InfoTip: React.FC<{ content: string; className?: string }> = ({
  content,
  className = "",
}) => (
  <Tooltip content={content} className={className}>
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
  </Tooltip>
);

InfoTip.displayName = "InfoTip";

export default Tooltip;
