/**
 * HelpArticleTOC — Sticky table-of-contents sidebar with scrollspy.
 *
 * Desktop: 180px sticky sidebar, position sticky, top 1rem.
 * Mobile: collapsible "On this page" bar at top.
 *
 * Reads section IDs from the page via IntersectionObserver on each accordion wrapper.
 */

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

export interface TOCItem {
  id: string;
  title: string;
}

interface HelpArticleTOCProps {
  items: TOCItem[];
}

export function HelpArticleTOC({ items }: HelpArticleTOCProps) {
  const isMobile = useIsMobile();
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scrollspy: observe each section by ID
  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first entry that is intersecting
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      },
    );

    const elements: Element[] = [];
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
        elements.push(el);
      }
    }

    return () => {
      for (const el of elements) {
        observer.unobserve(el);
      }
    };
  }, [items]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setMobileOpen(false);
    }
  }, []);

  if (items.length === 0) return null;

  // ─── Mobile: collapsible bar ────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="mb-4 rounded-lg bg-white/[0.03] border border-white/5">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-400"
        >
          <span>On this page</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${mobileOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>
        {mobileOpen && (
          <div className="px-3 pb-2.5 space-y-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className={`w-full text-left text-xs py-1 px-2 rounded transition-colors ${
                  activeId === item.id
                    ? "text-plasma-orange bg-plasma-orange/10"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Desktop: sticky sidebar ────────────────────────────────────────
  return (
    <nav
      className="w-[180px] flex-shrink-0 sticky top-4 self-start"
      aria-label="Table of contents"
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        On this page
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => scrollTo(item.id)}
            className={`w-full text-left text-xs py-1.5 px-2.5 rounded transition-colors border-l-2 ${
              activeId === item.id
                ? "text-plasma-orange border-plasma-orange bg-plasma-orange/5"
                : "text-gray-500 border-transparent hover:text-gray-300 hover:border-white/10"
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>
    </nav>
  );
}
