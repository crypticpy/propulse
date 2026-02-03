/**
 * HistoryCard Component
 *
 * Displays "This Day in History" - best DX contacts made on this date
 * in previous years. Queries the logbook for entries matching the current
 * month-day from any year and highlights notable achievements.
 */

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { useLogbook } from "@/hooks/useLogbook";
import type { LogEntry } from "@/lib/db/types";

export interface HistoryCardProps {
  className?: string;
}

/**
 * Calendar icon for the card header
 */
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/**
 * Entry with distance information for sorting
 */
interface HistoryEntry extends LogEntry {
  year: number;
}

/**
 * Get formatted month-day string (e.g., "Feb 2")
 */
function getFormattedMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Extract year from ISO date string
 */
function extractYear(dateStr: string): number {
  return parseInt(dateStr.slice(0, 4), 10);
}

/**
 * Check if a log entry's month-day matches today
 */
function isMatchingMonthDay(entryDate: string, today: Date): boolean {
  const entryMonth = parseInt(entryDate.slice(5, 7), 10);
  const entryDay = parseInt(entryDate.slice(8, 10), 10);
  return entryMonth === today.getMonth() + 1 && entryDay === today.getDate();
}

/**
 * HistoryCard Component
 *
 * Shows the best DX contacts made on this day in previous years.
 * Helps operators reminisce about past achievements and set goals.
 *
 * @example
 * ```tsx
 * <HistoryCard className="w-full" />
 * ```
 */
export function HistoryCard({ className = "" }: HistoryCardProps) {
  const { entries, loading } = useLogbook();

  // Get today's month-day for matching
  const today = useMemo(() => new Date(), []);
  const formattedDate = getFormattedMonthDay(today);
  const currentYear = today.getFullYear();

  // Filter entries matching today's month-day from previous years
  // Sort by uniqueness (callsign prefix rarity) - prioritize rare prefixes
  const historyEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    const matching: HistoryEntry[] = entries
      .filter((entry) => {
        const entryYear = extractYear(entry.date);
        // Only include entries from previous years (not current year)
        return entryYear < currentYear && isMatchingMonthDay(entry.date, today);
      })
      .map((entry) => ({
        ...entry,
        year: extractYear(entry.date),
      }));

    // Group by year and pick the best entry per year
    // "Best" is determined by callsign prefix length (shorter = rarer)
    const byYear = new Map<number, HistoryEntry>();
    for (const entry of matching) {
      const existing = byYear.get(entry.year);
      if (!existing) {
        byYear.set(entry.year, entry);
      } else {
        // Prefer shorter callsign prefixes (rarer entities like 3Y, VK0, ZL7)
        const entryPrefix = entry.callsign.replace(/[0-9].*/, "");
        const existingPrefix = existing.callsign.replace(/[0-9].*/, "");
        if (entryPrefix.length < existingPrefix.length) {
          byYear.set(entry.year, entry);
        }
      }
    }

    // Sort by year descending (most recent first)
    return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
  }, [entries, today, currentYear]);

  // Build the display string
  const displayText = useMemo(() => {
    if (historyEntries.length === 0) return null;

    const items = historyEntries
      .slice(0, 3) // Show up to 3 entries
      .map((entry) => `${entry.callsign} (${entry.year})`);

    return items.join(", ");
  }, [historyEntries]);

  // Loading state
  if (loading) {
    return (
      <Card className={`p-3 ${className}`}>
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-500">Loading history...</span>
          </div>
        </div>
      </Card>
    );
  }

  // Empty state - no history for this date
  if (!displayText) {
    return (
      <Card className={`p-3 ${className}`}>
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              This Day in History
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              No DX logged on {formattedDate} in previous years
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Normal state with history
  return (
    <Card className={`p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <CalendarIcon className="w-4 h-4 text-plasma-orange flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
            This Day in History
          </span>
          <p className="text-xs text-gray-300 mt-0.5">
            <span className="text-gray-500">Best DX on {formattedDate}:</span>{" "}
            <span className="font-mono text-signal-green">{displayText}</span>
          </p>
          {historyEntries.length > 3 && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              +{historyEntries.length - 3} more
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

HistoryCard.displayName = "HistoryCard";

export default HistoryCard;
