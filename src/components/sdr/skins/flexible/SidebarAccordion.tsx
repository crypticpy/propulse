/**
 * SidebarAccordion — Lightweight collapsible section wrapper for FlexSideControls.
 *
 * Uses max-height animation (PanelCard pattern) for smooth expand/collapse.
 * Styled to match the dense SDR control surface aesthetic.
 */

import { useState, type ReactNode } from "react";

interface SidebarAccordionProps {
  /** Section title (rendered as uppercase label) */
  title: string;
  /** Whether section starts open */
  defaultOpen?: boolean;
  /** Optional count badge (e.g., notch filter count) */
  badge?: string | number;
  /** Content */
  children: ReactNode;
}

export function SidebarAccordion({
  title,
  defaultOpen = true,
  badge,
  children,
}: SidebarAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 w-full text-left group"
        aria-expanded={open}
      >
        {/* Chevron */}
        <svg
          className={`w-2.5 h-2.5 text-su-muted transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
          viewBox="0 0 6 10"
          fill="currentColor"
        >
          <path
            d="M1 1l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span className="text-xs font-semibold text-su-muted uppercase tracking-wider group-hover:text-su-text transition-colors">
          {title}
        </span>

        {badge != null && (
          <span className="text-xs font-mono text-su-muted ml-auto">
            {badge}
          </span>
        )}
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          open ? "max-h-[600px] opacity-100 mt-1" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
