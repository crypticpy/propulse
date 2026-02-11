/**
 * HelpAccordion — Progressive disclosure component for help sections.
 *
 * Collapsed: heading + 1-line summary + chevron pointing right.
 * Expanded: heading highlighted + full content + chevron pointing down.
 * Smooth height animation via measured max-height.
 *
 * Listens for 'help-navigate' custom events to auto-expand when a TOC item
 * targets this accordion. The event detail contains the target id.
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

  // Auto-expand when navigated to via TOC click
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail.id === id && !isOpen) {
        setIsOpen(true);
      }
    };
    window.addEventListener("help-navigate", handleNavigate);
    return () => window.removeEventListener("help-navigate", handleNavigate);
  }, [id, isOpen]);

  // Listen for expand-all / collapse-all events
  useEffect(() => {
    const handleExpandAll = () => setIsOpen(true);
    const handleCollapseAll = () => setIsOpen(false);
    window.addEventListener("help-expand-all", handleExpandAll);
    window.addEventListener("help-collapse-all", handleCollapseAll);
    return () => {
      window.removeEventListener("help-expand-all", handleExpandAll);
      window.removeEventListener("help-collapse-all", handleCollapseAll);
    };
  }, []);

  // Auto-expand and scroll when the URL hash matches this accordion on initial load
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && hash === id && !isOpen) {
      setIsOpen(true);
      // Delay scroll to allow accordion height transition to start (~350ms)
      // so scrollIntoView targets the correct position
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 350);
    }
    // Only run on mount — intentionally excluding isOpen from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const headingId = `${id}-heading`;
  const panelId = `${id}-content`;

  return (
    <div
      id={id}
      className="border-b border-white/5 last:border-b-0"
      style={{ scrollMarginTop: "80px" }}
    >
      <h3>
        <button
          id={headingId}
          type="button"
          onClick={toggle}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="w-full flex items-center gap-3 py-4 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-900 rounded-lg"
        >
          {/* Chevron */}
          <svg
            aria-hidden="true"
            className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-200 motion-reduce:transition-none ${
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
            <span
              className={`text-sm font-semibold transition-colors ${
                isOpen
                  ? "text-plasma-orange"
                  : "text-gray-200 group-hover:text-gray-100"
              }`}
            >
              {title}
            </span>
            {summary && !isOpen && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>
            )}
          </div>
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={headingId}
        data-accordion-content
        hidden={!isOpen ? true : undefined}
        style={{
          maxHeight: isOpen ? `${contentHeight}px` : "0px",
        }}
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out motion-reduce:transition-none"
      >
        <div ref={contentRef} className="pb-4 pl-7 pr-2">
          {children}
        </div>
      </div>
    </div>
  );
}
