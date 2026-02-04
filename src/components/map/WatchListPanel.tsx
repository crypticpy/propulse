/**
 * WatchListPanel Component
 *
 * A slide-in panel for managing watched items (grids, entities, callsign patterns).
 * Displays all watches with activity status, allows adding/removing watches,
 * and shows matching spots when expanded.
 */

import { useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useWatchStore,
  MAX_WATCHES,
  type WatchType,
  type WatchItem,
  type WatchMatch,
} from "@/stores/watchStore";

export interface WatchListPanelProps {
  /** Whether the panel is visible */
  visible: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** Watch type display configuration */
const WATCH_TYPE_CONFIG: Record<
  WatchType,
  { label: string; placeholder: string; icon: string }
> = {
  grid: {
    label: "Grid",
    placeholder: "e.g., CN87",
    icon: "\uD83D\uDDFA\uFE0F",
  },
  entity: {
    label: "Entity",
    placeholder: "e.g., W, VK, JA",
    icon: "\uD83C\uDDFA\uD83C\uDDF8",
  },
  callsign: {
    label: "Callsign",
    placeholder: "e.g., W7ABC, K6*",
    icon: "\uD83D\uDCE1",
  },
};

/**
 * Format relative time (e.g., "2 min ago")
 */
function formatRelativeTime(isoString: string | undefined): string {
  if (!isoString) return "Never";

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

/**
 * AddWatchForm - Inline form for adding new watches
 */
interface AddWatchFormProps {
  onAdd: (type: WatchType, pattern: string, name?: string) => void;
  onCancel: () => void;
  isAtLimit: boolean;
}

function AddWatchForm({ onAdd, onCancel, isAtLimit }: AddWatchFormProps) {
  const [type, setType] = useState<WatchType>("grid");
  const [pattern, setPattern] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedPattern = pattern.trim();
      if (!trimmedPattern) {
        setError("Pattern is required");
        return;
      }

      if (trimmedPattern.length < 2) {
        setError("Pattern must be at least 2 characters");
        return;
      }

      onAdd(type, trimmedPattern, name.trim() || undefined);
      setPattern("");
      setName("");
    },
    [type, pattern, name, onAdd],
  );

  if (isAtLimit) {
    return (
      <div className="px-4 py-3 bg-amber-900/30 border border-amber-500/30 rounded-lg">
        <p className="text-amber-300 text-sm">
          Maximum {MAX_WATCHES} watches reached. Remove a watch to add more.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Type selector */}
      <div className="flex gap-2">
        {(Object.keys(WATCH_TYPE_CONFIG) as WatchType[]).map((watchType) => {
          const config = WATCH_TYPE_CONFIG[watchType];
          return (
            <button
              key={watchType}
              type="button"
              onClick={() => setType(watchType)}
              className={`
                flex-1 px-2 py-1.5
                text-xs font-medium
                rounded-md
                transition-colors duration-150
                ${
                  type === watchType
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-700/50 text-gray-300 hover:bg-gray-700"
                }
              `}
            >
              <span className="mr-1">{config.icon}</span>
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Pattern input */}
      <div>
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value.toUpperCase())}
          placeholder={WATCH_TYPE_CONFIG[type].placeholder}
          className="
            w-full px-3 py-2
            bg-gray-800/50 border border-gray-600/50
            rounded-md
            text-white text-sm
            placeholder:text-gray-500
            focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50
          "
          maxLength={20}
          aria-label="Pattern to watch"
        />
      </div>

      {/* Name input (optional) */}
      <div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label (optional)"
          className="
            w-full px-3 py-2
            bg-gray-800/50 border border-gray-600/50
            rounded-md
            text-white text-sm
            placeholder:text-gray-500
            focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50
          "
          maxLength={30}
          aria-label="Watch label"
        />
      </div>

      {/* Error message */}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="submit"
          className="
            flex-1 px-3 py-2
            bg-cyan-600 hover:bg-cyan-500
            text-white text-sm font-medium
            rounded-md
            transition-colors duration-150
          "
        >
          Add Watch
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="
            px-3 py-2
            bg-gray-700/50 hover:bg-gray-700
            text-gray-300 text-sm
            rounded-md
            transition-colors duration-150
          "
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * WatchListItem - A single watch item in the list
 */
interface WatchListItemProps {
  watch: WatchItem;
  matches: WatchMatch[];
  onRemove: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function WatchListItem({
  watch,
  matches,
  onRemove,
  isExpanded,
  onToggleExpand,
}: WatchListItemProps) {
  const config = WATCH_TYPE_CONFIG[watch.type];

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(watch.id);
    },
    [watch.id, onRemove],
  );

  return (
    <div
      className={`
        border rounded-lg overflow-hidden
        transition-all duration-200
        ${
          watch.isActive
            ? "bg-amber-900/20 border-amber-500/30"
            : "bg-gray-800/30 border-gray-700/50"
        }
      `}
    >
      {/* Main content - clickable to expand */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="
          w-full px-3 py-2.5
          flex items-start gap-3
          text-left
          hover:bg-white/5
          transition-colors duration-150
          cursor-pointer
        "
        aria-expanded={isExpanded}
        aria-label={`${watch.name || watch.pattern}, ${config.label}. ${
          watch.isActive
            ? `${matches.length} spot${matches.length !== 1 ? "s" : ""}`
            : "No activity"
        }. Click to ${isExpanded ? "collapse" : "expand"}.`}
      >
        {/* Activity indicator */}
        <span
          className={`
            mt-0.5 text-base
            ${watch.isActive ? "animate-pulse" : "opacity-50"}
          `}
          aria-hidden="true"
        >
          {watch.isActive ? "\uD83D\uDD14" : "\uD83D\uDD15"}
        </span>

        {/* Watch info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium truncate">
              {watch.name || watch.pattern}
            </span>
            <span className="text-xs text-gray-500">({config.label})</span>
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {watch.name && watch.pattern !== watch.name && (
              <span className="font-mono mr-2">{watch.pattern}</span>
            )}
            {watch.isActive ? (
              <span className="text-amber-300">
                {watch.activityCount} spot{watch.activityCount !== 1 ? "s" : ""}{" "}
                | Last: {formatRelativeTime(watch.lastActivityAt)}
              </span>
            ) : (
              <span>No activity</span>
            )}
          </div>
        </div>

        {/* Delete button */}
        <button
          type="button"
          onClick={handleRemove}
          className="
            p-1.5
            text-gray-500 hover:text-red-400
            hover:bg-red-500/10
            rounded
            transition-colors duration-150
          "
          title="Remove watch"
          aria-label={`Remove watch for ${watch.name || watch.pattern}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Expanded matches list */}
      {isExpanded && matches.length > 0 && (
        <div className="px-3 pb-3 border-t border-gray-700/50">
          <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
            {matches.slice(0, 10).map((match, index) => (
              <div
                key={`${match.spot.id}-${index}`}
                className="
                  flex items-center justify-between
                  px-2 py-1.5
                  bg-gray-800/50 rounded
                  text-xs
                "
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-cyan-300 truncate">
                    {match.matchedField === "dx"
                      ? match.spot.dx
                      : match.spot.spotter}
                  </span>
                  <span className="text-gray-500">
                    {match.matchedField === "dx" ? "DX" : "Spotter"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <span>{match.spot.band || "??m"}</span>
                  <span className="text-gray-600">|</span>
                  <span className="tabular-nums">
                    {(match.spot.frequency / 1000).toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
            {matches.length > 10 && (
              <div className="text-center text-gray-500 text-xs py-1">
                +{matches.length - 10} more spot
                {matches.length - 10 !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expanded but no matches */}
      {isExpanded && matches.length === 0 && (
        <div className="px-3 pb-3 border-t border-gray-700/50">
          <p className="mt-2 text-center text-gray-500 text-xs">
            No matching spots yet
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * WatchListPanel Component
 *
 * A slide-in panel for managing watched items with glassmorphism styling.
 *
 * @example
 * ```tsx
 * <WatchListPanel
 *   visible={showWatchList}
 *   onClose={() => setShowWatchList(false)}
 * />
 * ```
 */
export function WatchListPanel({
  visible,
  onClose,
  className = "",
}: WatchListPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedWatchId, setExpandedWatchId] = useState<string | null>(null);

  const watches = useWatchStore((state) => state.watches);
  const matches = useWatchStore((state) => state.matches);
  const addWatch = useWatchStore((state) => state.addWatch);
  const removeWatch = useWatchStore((state) => state.removeWatch);
  const clearMatches = useWatchStore((state) => state.clearMatches);

  const isAtLimit = watches.length >= MAX_WATCHES;

  // Group matches by watch ID
  const matchesByWatch = useMemo(() => {
    const grouped: Record<string, WatchMatch[]> = {};
    for (const match of matches) {
      if (!grouped[match.watchId]) {
        grouped[match.watchId] = [];
      }
      grouped[match.watchId].push(match);
    }
    return grouped;
  }, [matches]);

  // Sort watches: active first, then by creation date
  const sortedWatches = useMemo(() => {
    return [...watches].sort((a, b) => {
      // Active watches first
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      // Then by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [watches]);

  const handleAddWatch = useCallback(
    (type: WatchType, pattern: string, name?: string) => {
      const result = addWatch(type, pattern, name);
      if (result) {
        setShowAddForm(false);
      }
    },
    [addWatch],
  );

  const handleToggleExpand = useCallback((watchId: string) => {
    setExpandedWatchId((prev) => (prev === watchId ? null : watchId));
  }, []);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  if (!visible) {
    return null;
  }

  const panelContent = (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Watch List"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={`
          relative
          w-full max-w-sm
          h-full
          bg-gray-900/95 backdrop-blur-md
          border-l border-white/10
          shadow-2xl
          flex flex-col
          animate-slide-in-right
          ${className}
        `}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Watch List</h2>
          <div className="flex items-center gap-2">
            {matches.length > 0 && (
              <button
                type="button"
                onClick={clearMatches}
                className="
                  px-2 py-1
                  text-xs text-gray-400 hover:text-white
                  hover:bg-white/10
                  rounded
                  transition-colors duration-150
                "
                title="Clear all matches"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="
                p-1.5
                text-gray-400 hover:text-white
                hover:bg-white/10
                rounded
                transition-colors duration-150
              "
              aria-label="Close watch list"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Add Watch Button or Form */}
        <div className="px-4 py-3 border-b border-white/10">
          {showAddForm ? (
            <AddWatchForm
              onAdd={handleAddWatch}
              onCancel={() => setShowAddForm(false)}
              isAtLimit={isAtLimit}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              disabled={isAtLimit}
              className={`
                w-full px-3 py-2
                flex items-center justify-center gap-2
                rounded-md
                text-sm font-medium
                transition-colors duration-150
                ${
                  isAtLimit
                    ? "bg-gray-700/30 text-gray-500 cursor-not-allowed"
                    : "bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 border border-cyan-500/30"
                }
              `}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Watch
            </button>
          )}
        </div>

        {/* Watch List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {sortedWatches.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">{"\uD83D\uDD15"}</div>
              <p className="text-gray-400 text-sm">No watches yet</p>
              <p className="text-gray-500 text-xs mt-1">
                Add a watch to monitor grids, entities, or callsigns
              </p>
            </div>
          ) : (
            sortedWatches.map((watch) => (
              <WatchListItem
                key={watch.id}
                watch={watch}
                matches={matchesByWatch[watch.id] || []}
                onRemove={removeWatch}
                isExpanded={expandedWatchId === watch.id}
                onToggleExpand={() => handleToggleExpand(watch.id)}
              />
            ))
          )}
        </div>

        {/* Footer with count */}
        <div className="px-4 py-2 border-t border-white/10 text-xs text-gray-500 text-center">
          {watches.length} / {MAX_WATCHES} watches
        </div>
      </div>

      {/* Inline styles for slide-in animation */}
      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </div>
  );

  return createPortal(panelContent, document.body);
}

WatchListPanel.displayName = "WatchListPanel";

export default WatchListPanel;
