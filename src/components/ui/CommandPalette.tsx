/**
 * CommandPalette Component
 *
 * A Cmd+K / Ctrl+K command palette for quick navigation and actions.
 * Renders as a fixed overlay with search input, filtered results list,
 * and keyboard navigation (arrow keys, enter, escape).
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "@/stores/userStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onShowShortcuts?: () => void;
  onRefreshData?: () => void;
  onOpenSettings?: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  /** Extra terms for fuzzy substring matching */
  keywords: string[];
  category: "navigation" | "actions" | "quick-info";
  icon: (props: { className?: string }) => JSX.Element;
  /** Optional shortcut hint rendered on the right */
  shortcutHint?: string;
  action: () => void;
}

// ---------------------------------------------------------------------------
// Inline SVG icons (20x20 stroke, consistent with codebase)
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
      />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function RadioIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.828a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072M13 12a1 1 0 11-2 0 1 1 0 012 0z"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 3h14M9 3v2a3 3 0 006 0V3M5 3a2 2 0 00-2 2v2a4 4 0 004 4h0m12-8a2 2 0 012 2v2a4 4 0 01-4 4h0m-6 0v4m-3 4h6m-3-4v4"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function KeyboardIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zm3 4h.01M11 10h.01M15 10h.01M7 14h10"
      />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Category labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<CommandItem["category"], string> = {
  navigation: "Navigation",
  actions: "Actions",
  "quick-info": "Quick Info",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette({
  isOpen,
  onClose,
  onShowShortcuts,
  onRefreshData,
  onOpenSettings,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const stationGrid = useUserStore((s) => {
    const st = s.station;
    if (!st) return undefined;
    const locId = st.activeLocationId ?? st.homeLocationId;
    return st.savedLocations.find((l) => l.id === locId)?.grid;
  });

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Build the command list (stable across renders unless callbacks change)
  // -----------------------------------------------------------------------
  const commands = useMemo<CommandItem[]>(() => {
    const nav = (path: string): (() => void) => {
      return () => {
        navigate(path);
        onClose();
      };
    };

    const items: CommandItem[] = [
      // Navigation
      {
        id: "nav-home",
        label: "Go to Home",
        keywords: ["dashboard", "overview", "main"],
        category: "navigation",
        icon: HomeIcon,
        action: nav("/"),
      },
      {
        id: "nav-solar",
        label: "Go to Solar Pulse",
        keywords: ["sun", "solar", "flux", "sfi", "kp", "indices"],
        category: "navigation",
        icon: SunIcon,
        action: nav("/solar"),
      },
      {
        id: "nav-map",
        label: "Go to Map",
        keywords: ["globe", "propsphere", "propagation", "world", "3d"],
        category: "navigation",
        icon: GlobeIcon,
        action: nav("/map"),
      },
      {
        id: "nav-dx",
        label: "Go to DX Wizard",
        keywords: ["dx", "spots", "cluster", "wizard", "radio"],
        category: "navigation",
        icon: RadioIcon,
        action: nav("/dx"),
      },
      {
        id: "nav-planner",
        label: "Go to Band Planner",
        keywords: ["band", "planner", "schedule", "calendar", "forecast"],
        category: "navigation",
        icon: CalendarIcon,
        action: nav("/planner"),
      },
      {
        id: "nav-log",
        label: "Go to Logbook",
        keywords: ["log", "qso", "contacts", "book", "journal"],
        category: "navigation",
        icon: BookIcon,
        action: nav("/log"),
      },
      {
        id: "nav-contest",
        label: "Go to Contest",
        keywords: ["contest", "competition", "trophy", "score"],
        category: "navigation",
        icon: TrophyIcon,
        action: nav("/contest"),
      },

      // Actions
      {
        id: "action-settings",
        label: "Open Settings",
        keywords: ["settings", "preferences", "config", "configure"],
        category: "actions",
        icon: SettingsIcon,
        action: () => {
          onClose();
          onOpenSettings?.();
        },
      },
      {
        id: "action-refresh",
        label: "Refresh Data",
        keywords: ["refresh", "reload", "update", "fetch", "sync"],
        category: "actions",
        icon: RefreshIcon,
        action: () => {
          onRefreshData?.();
          onClose();
        },
      },
      {
        id: "action-shortcuts",
        label: "Show Keyboard Shortcuts",
        keywords: ["keyboard", "shortcuts", "keys", "hotkeys", "help"],
        category: "actions",
        icon: KeyboardIcon,
        shortcutHint: "?",
        action: () => {
          onShowShortcuts?.();
          onClose();
        },
      },

      // Quick Info
      {
        id: "info-copy-grid",
        label: "Copy Grid Locator",
        keywords: ["grid", "locator", "maidenhead", "copy", "clipboard", "qth"],
        category: "quick-info",
        icon: CopyIcon,
        action: () => {
          if (stationGrid) {
            navigator.clipboard.writeText(stationGrid).catch(() => {
              // Clipboard write failed silently
            });
          }
          onClose();
        },
      },
    ];

    return items;
  }, [
    navigate,
    onClose,
    onOpenSettings,
    onRefreshData,
    onShowShortcuts,
    stationGrid,
  ]);

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;

    const lower = query.toLowerCase();
    return commands.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(lower)) return true;
      return cmd.keywords.some((kw) => kw.includes(lower));
    });
  }, [commands, query]);

  // -----------------------------------------------------------------------
  // Reset state when palette opens / closes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      // Focus the input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Clamp active index when filtered list shrinks
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, activeIndex]);

  // -----------------------------------------------------------------------
  // Scroll active item into view
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      `[data-command-index="${activeIndex}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // -----------------------------------------------------------------------
  // Prevent background scroll while open
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // -----------------------------------------------------------------------
  // Global keyboard handler (Escape)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [isOpen, onClose]);

  // -----------------------------------------------------------------------
  // Execute the currently active command
  // -----------------------------------------------------------------------
  const executeActive = useCallback(() => {
    const item = filtered[activeIndex];
    if (item) {
      item.action();
    }
  }, [filtered, activeIndex]);

  // -----------------------------------------------------------------------
  // Input keyboard handler (arrows, enter, tab trap)
  // -----------------------------------------------------------------------
  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            filtered.length === 0 ? 0 : (prev + 1) % filtered.length,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            filtered.length === 0
              ? 0
              : (prev - 1 + filtered.length) % filtered.length,
          );
          break;
        case "Enter":
          e.preventDefault();
          executeActive();
          break;
        case "Tab":
          // Focus trap: keep focus within the palette
          e.preventDefault();
          break;
      }
    },
    [filtered.length, executeActive],
  );

  // -----------------------------------------------------------------------
  // Group filtered items by category for rendering
  // -----------------------------------------------------------------------
  const groupedItems = useMemo(() => {
    const groups: {
      category: CommandItem["category"];
      items: CommandItem[];
    }[] = [];
    const seen = new Set<CommandItem["category"]>();

    for (const item of filtered) {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        groups.push({ category: item.category, items: [] });
      }
      groups.find((g) => g.category === item.category)!.items.push(item);
    }

    return groups;
  }, [filtered]);

  // Compute flat index for each item across groups
  const flatIndexOf = useCallback(
    (item: CommandItem): number => {
      return filtered.indexOf(item);
    },
    [filtered],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-start justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-[32rem] mt-[20vh] mx-4 bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95"
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.05] border-b border-white/10">
          <SearchIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[10px] text-gray-500 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-[400px] overflow-y-auto overscroll-contain py-2"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-500">No results found</p>
              <p className="text-xs text-gray-600 mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            groupedItems.map((group) => (
              <div key={group.category}>
                {/* Category header */}
                <div className="text-[10px] uppercase tracking-wider text-gray-500 px-3 py-1.5 select-none">
                  {CATEGORY_LABELS[group.category]}
                </div>

                {/* Items */}
                {group.items.map((item) => {
                  const idx = flatIndexOf(item);
                  const isActive = idx === activeIndex;

                  return (
                    <button
                      key={item.id}
                      data-command-index={idx}
                      role="option"
                      aria-selected={isActive}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2.5 text-left
                        transition-colors duration-75 cursor-pointer
                        ${
                          isActive
                            ? "bg-white/[0.08] border-l-2 border-plasma-orange"
                            : "border-l-2 border-transparent hover:bg-white/[0.06]"
                        }
                      `}
                      onClick={() => {
                        item.action();
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                    >
                      <item.icon
                        className={`w-5 h-5 flex-shrink-0 ${
                          isActive ? "text-plasma-orange" : "text-gray-400"
                        }`}
                      />
                      <span
                        className={`flex-1 text-sm ${
                          isActive ? "text-white" : "text-gray-300"
                        }`}
                      >
                        {item.label}
                      </span>
                      {item.shortcutHint && (
                        <kbd className="px-1.5 py-0.5 bg-white/[0.06] border border-white/10 rounded text-xs text-gray-500 font-mono">
                          {item.shortcutHint}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white/[0.06] border border-white/10 rounded font-mono">
                &uarr;
              </kbd>
              <kbd className="px-1 py-0.5 bg-white/[0.06] border border-white/10 rounded font-mono">
                &darr;
              </kbd>
              <span className="ml-0.5">navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white/[0.06] border border-white/10 rounded font-mono">
                &crarr;
              </kbd>
              <span className="ml-0.5">select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white/[0.06] border border-white/10 rounded font-mono">
                esc
              </kbd>
              <span className="ml-0.5">close</span>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
