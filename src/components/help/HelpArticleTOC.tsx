/**
 * HelpArticleTOC — Sticky table-of-contents sidebar with scrollspy.
 *
 * Desktop: 180px sticky sidebar, position sticky, top 1rem.
 * Mobile: collapsible "On this page" bar at top.
 *
 * Reads section IDs from the page via IntersectionObserver on each accordion wrapper.
 * Dispatches 'help-navigate' custom events so collapsed HelpAccordions auto-expand
 * when a user clicks a TOC item targeting them.
 */

import { useState, useEffect, useCallback, useRef } from "react";
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
  // Track programmatic scrolls to avoid scrollspy fighting with click navigation
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Scrollspy: observe each section by ID
  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Skip scrollspy updates during programmatic scroll
        if (isScrollingRef.current) return;

        // Collect all currently intersecting entries and pick the one closest
        // to the top of the viewport for the most accurate active highlight
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          // Sort by boundingClientRect.top so the topmost visible section wins
          intersecting.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          );
          setActiveId(intersecting[0].target.id);
        }
      },
      {
        // Top offset accounts for sticky header (~64px) + some breathing room;
        // bottom margin at -40% so the section activates well before it scrolls
        // past the viewport midpoint.
        rootMargin: "-80px 0px -40% 0px",
        threshold: [0, 0.1],
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
    // Dispatch custom event so collapsed HelpAccordions auto-expand
    window.dispatchEvent(new CustomEvent("help-navigate", { detail: { id } }));

    // Set active state immediately for responsive click feedback
    setActiveId(id);

    // Pause scrollspy to avoid flickering during the smooth scroll animation
    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    // Small delay to allow the accordion to expand before scrolling
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      // Re-enable scrollspy after scroll animation completes (~600ms)
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 650);
    });

    // Close mobile TOC after clicking
    setMobileOpen(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  if (items.length === 0) return null;

  // ─── Mobile: collapsible bar ────────────────────────────────────────
  if (isMobile) {
    return (
      <nav
        className="mb-4 rounded-lg bg-white/[0.03] border border-white/5"
        aria-label="Table of contents"
      >
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] text-sm text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60 rounded-lg"
        >
          <span>On this page</span>
          <svg
            aria-hidden="true"
            className={`w-3.5 h-3.5 transition-transform duration-200 motion-reduce:transition-none ${mobileOpen ? "rotate-180" : ""}`}
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
                aria-current={activeId === item.id ? "true" : undefined}
                className={`w-full text-left text-xs py-1 px-2 min-h-[44px] flex items-center rounded
                  transition-all duration-200 motion-reduce:transition-none
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60
                  ${
                    activeId === item.id
                      ? "text-plasma-orange bg-plasma-orange/10"
                      : "text-gray-500 hover:text-gray-300 active:text-plasma-orange/70"
                  }`}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}
      </nav>
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
            aria-current={activeId === item.id ? "true" : undefined}
            className={`w-full text-left text-xs py-1.5 px-2.5 rounded border-l-2
              transition-all duration-200 ease-out motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/60
              ${
                activeId === item.id
                  ? "text-plasma-orange border-plasma-orange bg-plasma-orange/5"
                  : "text-gray-500 border-transparent hover:text-gray-300 hover:border-white/10 active:text-plasma-orange/70"
              }`}
          >
            {item.title}
          </button>
        ))}
      </div>
    </nav>
  );
}
