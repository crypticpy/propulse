/**
 * QSOLogCards — Mobile card view of QSO log entries
 *
 * Compact cards showing callsign, time, band/mode, grid, RST,
 * and confirmation status. Tap to open detail; long-press for multi-select.
 */

import { useCallback, useRef } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import type { LogEntry } from "@/lib/db/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function getConfirmationBadges(entry: LogEntry): string[] {
  const badges: string[] = [];
  if (entry.lotw || entry.lotwQslSent === "Y" || entry.lotwQslRcvd === "Y") {
    badges.push("L");
  }
  if (entry.eqsl) {
    badges.push("E");
  }
  if (entry.clublogStatus === "Y") {
    badges.push("C");
  }
  if (entry.qrzcomStatus === "Y") {
    badges.push("Q");
  }
  return badges;
}

// ── Card Component ──────────────────────────────────────────────────────────

function QSOCard({
  entry,
  isSelected,
  onTap,
  onLongPress,
  isMultiSelectMode,
}: {
  entry: LogEntry;
  isSelected: boolean;
  onTap: () => void;
  onLongPress: () => void;
  isMultiSelectMode: boolean;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const touchHandled = useRef(false);

  const handleTouchStart = useCallback(() => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 500);
  }, [onLongPress]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!didLongPress.current) {
      touchHandled.current = true;
      onTap();
    }
  }, [onTap]);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const badges = getConfirmationBadges(entry);

  return (
    <div
      className={`p-3 rounded-xl border transition-colors ${
        isSelected
          ? "bg-plasma-orange/10 border-plasma-orange/40"
          : "bg-white/[0.03] border-white/10 active:bg-white/[0.06]"
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onClick={() => {
        if (touchHandled.current) {
          touchHandled.current = false;
          return;
        }
        onTap();
      }}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
    >
      {/* Row 1: Callsign + Time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isMultiSelectMode && (
            <div
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? "bg-plasma-orange border-plasma-orange"
                  : "border-white/30 bg-transparent"
              }`}
            >
              {isSelected && (
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
          )}
          <span className="font-mono font-bold text-white text-base">
            {entry.callsign}
          </span>
        </div>
        <span className="text-xs text-gray-400 font-mono">{entry.timeOn}</span>
      </div>

      {/* Row 2: Band Mode Grid RST */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="font-mono text-gray-300">
            {entry.band} {entry.mode}
          </span>
          {entry.grid && (
            <span className="font-mono text-gray-500">{entry.grid}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {entry.rstSent && (
            <span className="font-mono text-xs text-gray-400">
              {entry.rstSent}/{entry.rstRcvd ?? "?"}
            </span>
          )}
        </div>
      </div>

      {/* Row 3: Name/QTH + Badges */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-500 truncate max-w-[200px]">
          {entry.name ?? ""} {entry.qth ? `, ${entry.qth}` : ""}
        </span>
        {badges.length > 0 && (
          <div className="flex items-center gap-0.5">
            {badges.map((b) => (
              <span
                key={b}
                className="text-[10px] font-mono font-bold text-signal-green bg-signal-green/10 px-1 rounded"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface QSOLogCardsProps {
  onCardTap: (entry: LogEntry) => void;
}

export function QSOLogCards({ onCardTap }: QSOLogCardsProps) {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const selectEntry = useQSOStore((s) => s.selectEntry);
  const deselectEntry = useQSOStore((s) => s.deselectEntry);

  const isMultiSelectMode = selectedIds.size > 0;

  const handleTap = useCallback(
    (entry: LogEntry) => {
      if (isMultiSelectMode) {
        // In multi-select mode, tap toggles selection
        if (selectedIds.has(entry.id)) {
          deselectEntry(entry.id);
        } else {
          selectEntry(entry.id);
        }
      } else {
        onCardTap(entry);
      }
    },
    [isMultiSelectMode, selectedIds, selectEntry, deselectEntry, onCardTap],
  );

  const handleLongPress = useCallback(
    (entry: LogEntry) => {
      if (selectedIds.has(entry.id)) {
        deselectEntry(entry.id);
      } else {
        selectEntry(entry.id);
      }
    },
    [selectedIds, selectEntry, deselectEntry],
  );

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        No QSOs found. Start logging contacts to see them here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => (
        <QSOCard
          key={entry.id}
          entry={entry}
          isSelected={selectedIds.has(entry.id)}
          onTap={() => handleTap(entry)}
          onLongPress={() => handleLongPress(entry)}
          isMultiSelectMode={isMultiSelectMode}
        />
      ))}
    </div>
  );
}
