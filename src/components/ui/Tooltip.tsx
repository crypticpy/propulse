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

          // Visibility & Animation
          "opacity-0",
          "invisible",
          "group-hover:opacity-100",
          "group-hover:visible",
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

export default Tooltip;
