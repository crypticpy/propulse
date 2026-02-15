/**
 * ParkSearch — Autocomplete search for POTA parks or SOTA summits.
 *
 * Debounced input with dropdown results. Queries the edge proxy APIs.
 * Keyboard navigation: arrow keys + Enter to select.
 * Mobile-first: large touch targets, dark theme.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ParkResult {
  ref: string;
  name: string;
  location?: string;
  grid?: string;
  active?: boolean;
  altitude?: number;
  points?: number;
  region?: string;
}

interface ParkSearchProps {
  /** Whether searching POTA parks or SOTA summits */
  type: "pota" | "sota";
  /** Callback when a park/summit is selected */
  onSelect: (ref: string, name: string) => void;
  /** Optional additional class names */
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ParkSearch({
  type,
  onSelect,
  className = "",
}: ParkSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ParkResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const placeholder =
    type === "pota"
      ? "Search POTA parks (e.g., K-1234)"
      : "Search SOTA summits (e.g., W4C/CM-001)";

  // ── Fetch results ────────────────────────────────────────────────────────

  const fetchResults = useCallback(
    async (searchTerm: string) => {
      if (searchTerm.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);

      try {
        const endpoint =
          type === "pota"
            ? `/api/activation/pota?search=${encodeURIComponent(searchTerm)}`
            : `/api/activation/sota?search=${encodeURIComponent(searchTerm)}`;

        const resp = await fetch(endpoint);
        if (!resp.ok) {
          setResults([]);
          setIsOpen(false);
          return;
        }

        const data = (await resp.json()) as Record<string, unknown>;
        const items =
          type === "pota"
            ? ((data.parks as ParkResult[] | undefined) ?? [])
            : ((data.summits as ParkResult[] | undefined) ?? []);

        setResults(items.slice(0, 10));
        setIsOpen(items.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    },
    [type],
  );

  // ── Debounced search ─────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchResults(trimmed);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchResults]);

  // ── Keyboard navigation ──────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          const selected = results[highlightIndex];
          handleSelect(selected);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  // ── Selection ────────────────────────────────────────────────────────────

  const handleSelect = (item: ParkResult) => {
    setQuery(`${item.ref} - ${item.name}`);
    setIsOpen(false);
    setHighlightIndex(-1);
    onSelect(item.ref, item.name);
  };

  // ── Close dropdown when clicking outside ─────────────────────────────────

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Scroll highlighted item into view ────────────────────────────────────

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full h-12 px-4 pr-10 rounded-lg bg-space-900 border border-white/10
                     text-white placeholder-white/40 text-base
                     focus:outline-none focus:ring-2 focus:ring-plasma-orange/50 focus:border-plasma-orange/50
                     transition-colors"
          autoComplete="off"
          spellCheck={false}
        />
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-white/20 border-t-plasma-orange rounded-full animate-spin" />
          </div>
        )}
        {/* Search icon when not loading */}
        {!isLoading && (
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 max-h-80 overflow-y-auto rounded-lg
                     bg-deep-space border border-white/10 shadow-xl"
          role="listbox"
        >
          {results.map((item, idx) => (
            <li
              key={item.ref}
              role="option"
              aria-selected={idx === highlightIndex}
              className={`px-4 py-3 cursor-pointer transition-colors border-b border-white/5 last:border-b-0
                ${
                  idx === highlightIndex
                    ? "bg-plasma-orange/20 text-white"
                    : "text-white/80 hover:bg-white/5"
                }`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-plasma-orange text-sm">
                      {item.ref}
                    </span>
                    {type === "pota" && item.active !== undefined && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.active
                            ? "bg-signal-green/20 text-signal-green"
                            : "bg-white/10 text-white/40"
                        }`}
                      >
                        {item.active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white/60 truncate mt-0.5">
                    {item.name}
                  </div>
                  {(item.location || item.region) && (
                    <div className="text-xs text-white/40 truncate">
                      {item.location || item.region}
                    </div>
                  )}
                </div>
                {type === "sota" && item.points !== undefined && (
                  <div className="flex-shrink-0 text-right">
                    <div className="text-xs text-white/50">
                      {item.altitude}m
                    </div>
                    <div className="text-xs font-bold text-plasma-orange">
                      {item.points}pts
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
