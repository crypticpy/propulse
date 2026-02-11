/**
 * HelpTooltip — Small (?) circle icon that links to a help section.
 *
 * Unobtrusive: gray-500 default, plasma-orange on hover.
 * On hover: tooltip with 1-line description.
 * On click: navigate to /help/{section}#{anchor}.
 */

import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export interface HelpTooltipProps {
  section: string;
  anchor?: string;
  tooltip?: string;
}

export function HelpTooltip({ section, anchor, tooltip }: HelpTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const path = `/help/${section}${anchor ? `#${anchor}` : ""}`;
      navigate(path);
    },
    [section, anchor, navigate],
  );

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = setTimeout(() => setShowTooltip(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  }, []);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="w-4 h-4 rounded-full border border-gray-600 flex items-center justify-center text-[10px] font-semibold text-gray-500 hover:text-plasma-orange hover:border-plasma-orange/50 transition-colors cursor-pointer"
        aria-label={tooltip || `Help: ${section}`}
      >
        ?
      </button>
      {showTooltip && tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-md bg-gray-800 border border-white/10 text-xs text-gray-300 whitespace-nowrap shadow-lg pointer-events-none z-50">
          {tooltip}
        </div>
      )}
    </span>
  );
}
