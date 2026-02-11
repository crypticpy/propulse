/**
 * HelpSearch — Search bar with results dropdown for the Help Center.
 *
 * Mobile: full-width dropdown, min 44px touch targets per result.
 * Visual: subtle focus glow ring, entrance animation for dropdown.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HELP_SECTIONS, SEARCH_INDEX, HelpIcons } from "./helpData";

interface HelpSearchProps {
  className?: string;
}

export function HelpSearch({ className = "" }: HelpSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Filter results
  const results =
    query.trim().length < 2
      ? []
      : SEARCH_INDEX.filter((entry) => {
          const q = query.toLowerCase();
          return (
            entry.heading.toLowerCase().includes(q) ||
            entry.keywords.some((kw) => kw.includes(q))
          );
        }).slice(0, 8);

  // Click-outside handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigateToResult = useCallback(
    (entry: (typeof SEARCH_INDEX)[0]) => {
      const path = `/help/${entry.sectionId}${entry.anchor ? `#${entry.anchor}` : ""}`;
      navigate(path);
      setIsOpen(false);
      setQuery("");
    },
    [navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (
        e.key === "Enter" &&
        selectedIdx >= 0 &&
        results[selectedIdx]
      ) {
        e.preventDefault();
        navigateToResult(results[selectedIdx]);
      } else if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    },
    [results, selectedIdx, navigateToResult],
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
    setSelectedIdx(-1);
  }, []);

  const listboxId = "help-search-listbox";
  const hasResults = isOpen && results.length > 0;
  const activeDescendant =
    selectedIdx >= 0 ? `help-search-option-${selectedIdx}` : undefined;

  return (
    <div
      className={`relative help-search-wrapper ${className}`}
      data-print-hide
    >
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          aria-hidden="true"
        >
          {HelpIcons.search("w-4 h-4")}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search help articles..."
          role="combobox"
          aria-label="Search help articles"
          aria-expanded={hasResults}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/30 transition-all duration-200"
        />
      </div>

      {/* Screen reader live region for result count */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isOpen &&
          query.trim().length >= 2 &&
          (results.length > 0
            ? `${results.length} result${results.length === 1 ? "" : "s"} found`
            : `No results found for ${query}`)}
      </div>

      {hasResults && (
        <div
          ref={dropdownRef}
          id={listboxId}
          role="listbox"
          aria-label="Search results"
          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 max-h-[70vh] overflow-y-auto"
        >
          {results.map((entry, i) => {
            const section = HELP_SECTIONS.find((s) => s.id === entry.sectionId);
            return (
              <button
                id={`help-search-option-${i}`}
                key={`${entry.sectionId}-${entry.anchor}-${i}`}
                type="button"
                role="option"
                aria-selected={selectedIdx === i}
                onClick={() => navigateToResult(entry)}
                className={`w-full text-left px-4 py-3 min-h-[44px] flex items-center gap-3 transition-colors ${
                  selectedIdx === i
                    ? "bg-plasma-orange/10 text-gray-100"
                    : "text-gray-300 hover:bg-white/[0.04] active:bg-white/[0.06]"
                }`}
              >
                <span
                  className="text-gray-500 flex-shrink-0"
                  aria-hidden="true"
                >
                  {section?.icon("w-4 h-4")}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{entry.heading}</span>
                  {section && entry.heading !== section.title && (
                    <span className="text-xs text-gray-500 ml-2">
                      in {section.title}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isOpen && query.trim().length >= 2 && results.length === 0 && (
        <div
          ref={dropdownRef}
          id={listboxId}
          role="status"
          className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden z-50 px-4 py-3 animate-in fade-in slide-in-from-top-2"
        >
          <p className="text-sm text-gray-500">
            No results found for &quot;{query}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
