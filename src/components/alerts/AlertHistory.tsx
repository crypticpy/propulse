/**
 * AlertHistory — DX spot alert history list.
 *
 * Shows the most recent triggered alerts (last 50) with filtering,
 * muting, dismiss, and clear functionality.
 *
 * Not to be confused with AlertHistoryModal which is for solar alerts.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  getAlertHistory,
  dismissAlertHistory,
  clearAlertHistory,
} from "@/lib/db/alertStore";
import type { AlertHistoryEntry } from "@/lib/db/types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max entries to display */
const MAX_ENTRIES = 50;

/** Mute duration: 30 minutes */
const MUTE_DURATION_MS = 30 * 60 * 1000;

// ─── Props ──────────────────────────────────────────────────────────────────

export interface SpotAlertHistoryProps {
  /** Force refresh trigger (increment to reload) */
  refreshKey?: number;
  /** CSS class name */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SpotAlertHistory: React.FC<SpotAlertHistoryProps> = ({
  refreshKey = 0,
  className = "",
}) => {
  const [entries, setEntries] = useState<AlertHistoryEntry[]>([]);
  const [filterRule, setFilterRule] = useState<string>("");
  const [mutedCallsigns, setMutedCallsigns] = useState<Map<string, number>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);

  // ── Load history from IDB ──
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      try {
        const history = await getAlertHistory(MAX_ENTRIES);
        if (!cancelled) {
          setEntries(history);
        }
      } catch {
        // IDB unavailable
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // ── Clean expired mutes ──
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMutedCallsigns((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [call, expiry] of next) {
          if (now >= expiry) {
            next.delete(call);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // ── Derived: unique rule names for filter ──
  const ruleNames = useMemo(() => {
    const names = new Set(entries.map((e) => e.ruleName));
    return Array.from(names).sort();
  }, [entries]);

  // ── Filtered entries ──
  const filteredEntries = useMemo(() => {
    let result = entries;

    // Filter by rule name
    if (filterRule) {
      result = result.filter((e) => e.ruleName === filterRule);
    }

    // Hide muted callsigns
    const now = Date.now();
    result = result.filter((e) => {
      const muteExpiry = mutedCallsigns.get(e.callsign.toUpperCase());
      return !muteExpiry || now >= muteExpiry;
    });

    return result;
  }, [entries, filterRule, mutedCallsigns]);

  // ── Dismiss entry ──
  const handleDismiss = useCallback(async (id: string) => {
    try {
      await dismissAlertHistory(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // IDB error — remove from UI anyway
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  }, []);

  // ── Mute callsign for 30 minutes ──
  const handleMute = useCallback((callsign: string) => {
    const expiry = Date.now() + MUTE_DURATION_MS;
    setMutedCallsigns((prev) => {
      const next = new Map(prev);
      next.set(callsign.toUpperCase(), expiry);
      return next;
    });
  }, []);

  // ── Clear all history ──
  const handleClearAll = useCallback(async () => {
    try {
      await clearAlertHistory();
      setEntries([]);
    } catch {
      // IDB error
    }
  }, []);

  // ── Format time ──
  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return "--:--";
    }
  };

  return (
    <div
      className={`rounded-xl border border-white/10 bg-void-black ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-sm font-mono font-semibold text-white">
          Spot Alert History
        </h3>
        <div className="flex items-center gap-2">
          {/* Rule filter */}
          {ruleNames.length > 1 && (
            <select
              value={filterRule}
              onChange={(e) => setFilterRule(e.target.value)}
              className="px-2 py-1 rounded-lg bg-deep-space border border-white/10 text-xs font-mono text-gray-300 focus:outline-none focus:ring-1 focus:ring-plasma-orange/50"
            >
              <option value="">All rules</option>
              {ruleNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}

          {/* Clear all */}
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-2 py-1 text-xs font-mono text-gray-400 hover:text-alert-red hover:bg-alert-red/10 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 font-mono">
            Loading...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 font-mono">
            {entries.length === 0
              ? "No alerts triggered yet"
              : "No alerts match the current filter"}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group"
              >
                {/* Time */}
                <span className="text-xs font-mono text-gray-500 w-16 flex-shrink-0">
                  {formatTime(entry.triggeredAt)}
                </span>

                {/* Callsign */}
                <span className="text-sm font-mono font-semibold text-plasma-orange w-20 flex-shrink-0 truncate">
                  {entry.callsign}
                </span>

                {/* Frequency + band + mode */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-xs font-mono text-gray-300">
                    {entry.frequency.toFixed(1)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-gray-400">
                    {entry.band}
                  </span>
                  {entry.mode && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-gray-400">
                      {entry.mode}
                    </span>
                  )}
                </div>

                {/* Rule name */}
                <span className="text-[11px] font-mono text-gray-500 truncate max-w-24 hidden sm:block">
                  {entry.ruleName}
                </span>

                {/* Actions (visible on hover) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Mute callsign */}
                  <button
                    type="button"
                    onClick={() => handleMute(entry.callsign)}
                    title={`Mute ${entry.callsign} for 30 min`}
                    className="p-1 text-gray-500 hover:text-caution-amber hover:bg-caution-amber/10 rounded transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                      />
                    </svg>
                  </button>

                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={() => handleDismiss(entry.id)}
                    title="Dismiss"
                    className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Muted callsigns indicator */}
      {mutedCallsigns.size > 0 && (
        <div className="px-4 py-2 border-t border-white/5 flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500">
            Muted ({mutedCallsigns.size}):
          </span>
          {Array.from(mutedCallsigns.keys()).map((call) => (
            <span
              key={call}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-caution-amber/10 text-caution-amber"
            >
              {call}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

SpotAlertHistory.displayName = "SpotAlertHistory";

export default SpotAlertHistory;
