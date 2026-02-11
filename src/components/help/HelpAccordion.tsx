/**
 * HelpAccordion — Progressive disclosure component for help sections.
 *
 * Collapsed: heading + 1-line summary + chevron pointing right.
 * Expanded: heading highlighted + full content + chevron pointing down.
 * Smooth height animation via measured max-height.
 */

import { useState, useRef, useEffect, useCallback } from "react";

export interface HelpAccordionProps {
  id: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function HelpAccordion({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: HelpAccordionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, isOpen]);

  // Re-measure on window resize
  useEffect(() => {
    const handleResize = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <div id={id} className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
        className="w-full flex items-center gap-3 py-4 text-left group focus:outline-none focus-visible:ring-1 focus-visible:ring-plasma-orange/50 rounded-lg"
      >
        {/* Chevron */}
        <svg
          className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-200 ${
            isOpen ? "rotate-90" : "rotate-0"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>

        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-semibold transition-colors ${
              isOpen
                ? "text-plasma-orange"
                : "text-gray-200 group-hover:text-gray-100"
            }`}
          >
            {title}
          </h3>
          {summary && !isOpen && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>
          )}
        </div>
      </button>

      <div
        id={`${id}-content`}
        role="region"
        aria-labelledby={id}
        style={{
          maxHeight: isOpen ? `${contentHeight}px` : "0px",
        }}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
      >
        <div ref={contentRef} className="pb-4 pl-7 pr-2">
          {children}
        </div>
      </div>
    </div>
  );
}
