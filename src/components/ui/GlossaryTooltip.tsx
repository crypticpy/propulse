/**
 * GlossaryTooltip — Inline glossary term with hover popover
 *
 * Renders children with a dotted underline. On hover (or focus), shows a
 * popover-style tooltip with the term definition from the contest glossary.
 *
 * Accessible: role="tooltip", aria-describedby, keyboard-focusable.
 * Positioned above or below the term depending on viewport space.
 *
 * @module components/ui/GlossaryTooltip
 */

import { useState, useRef, useEffect, useId } from "react";
import { getGlossaryTerm } from "@/lib/data/contestGlossary";

interface GlossaryTooltipProps {
  /** Glossary key (lowercase/kebab, e.g., "cq-zone") */
  term: string;
  /** Inline content that will be decorated with a dotted underline */
  children: React.ReactNode;
}

export function GlossaryTooltip({ term, children }: GlossaryTooltipProps) {
  const entry = getGlossaryTerm(term);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  // Determine vertical positioning when tooltip opens
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // If less than 160px above the trigger, show below instead
    setAbove(rect.top > 160);
  }, [open]);

  // If the term is not in the glossary, just render children plain
  if (!entry) {
    return <>{children}</>;
  }

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        className="border-b border-dotted border-gray-400 cursor-help"
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
      >
        {children}
      </span>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 left-1/2 -translate-x-1/2 w-72 px-3 py-2.5 rounded-lg
            bg-space-900 border border-white/10 shadow-xl text-sm text-gray-200
            pointer-events-none animate-fade-in
            ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <span className="block font-semibold text-white mb-1">
            {entry.term}
          </span>
          <span className="block leading-relaxed">{entry.definition}</span>
          {entry.example && (
            <span className="block mt-1.5 text-xs text-gray-400 italic">
              Example: {entry.example}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
