/**
 * HistoryDetailModal Component
 *
 * Detail modal that opens when clicking the HistoryCard tile.
 * Shows ALL QSOs made on today's month-day in previous years,
 * grouped by year with a compact table layout per year.
 */

import { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { useLogbook } from "@/hooks/useLogbook";
import { getEntityFromCallsign } from "@/lib/utils/gridUtils";

export interface HistoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * HistoryDetailModal Component
 *
 * Displays all QSOs from previous years that occurred on today's month-day,
 * grouped by year (most recent first) with callsign, band, mode, and entity columns.
 */
export function HistoryDetailModal({
  isOpen,
  onClose,
}: HistoryDetailModalProps) {
  const { entries } = useLogbook();

  const today = useMemo(() => new Date(), []);
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const currentYear = today.getFullYear();

  // Format month name for the header
  const monthName = today.toLocaleDateString("en-US", { month: "long" });

  // Filter entries matching today's month-day from previous years, group by year
  const yearGroups = useMemo(() => {
    if (!entries || entries.length === 0) {
      return [];
    }

    // Filter to matching month-day from previous years
    const matching = entries.filter((entry) => {
      const entryMonth = parseInt(entry.date.slice(5, 7), 10);
      const entryDay = parseInt(entry.date.slice(8, 10), 10);
      const entryYear = parseInt(entry.date.slice(0, 4), 10);
      return (
        entryYear < currentYear &&
        entryMonth === todayMonth &&
        entryDay === todayDay
      );
    });

    // Group by year
    const byYear = new Map<number, typeof matching>();
    for (const entry of matching) {
      const year = parseInt(entry.date.slice(0, 4), 10);
      const group = byYear.get(year) || [];
      group.push(entry);
      byYear.set(year, group);
    }

    // Sort years descending, and within each year sort by time
    const sorted = Array.from(byYear.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, yearEntries]) => ({
        year,
        entries: yearEntries.sort((a, b) => {
          const timeA = a.timeOn || "";
          const timeB = b.timeOn || "";
          return timeA.localeCompare(timeB);
        }),
      }));

    return sorted;
  }, [entries, currentYear, todayMonth, todayDay]);

  // Compute summary stats
  const totalContacts = yearGroups.reduce(
    (sum, g) => sum + g.entries.length,
    0,
  );
  const totalYears = yearGroups.length;

  const subtitle =
    totalContacts > 0
      ? `${totalContacts} contact${totalContacts !== 1 ? "s" : ""} across ${totalYears} year${totalYears !== 1 ? "s" : ""}`
      : undefined;

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="This Day in History"
      subtitle={subtitle}
      size="md"
    >
      <div className="space-y-0">
        {/* Header with formatted date */}
        <h3 className="text-sm font-bold text-white mb-4">
          {monthName} {todayDay}
        </h3>

        {/* Empty state */}
        {yearGroups.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            No QSOs found for this date in previous years
          </p>
        )}

        {/* Year sections */}
        {yearGroups.map((group, index) => (
          <div
            key={group.year}
            className={index > 0 ? "border-t border-white/10 pt-3 mt-3" : ""}
          >
            {/* Year header with count badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-bold text-white">{group.year}</span>
              <span className="bg-white/10 rounded px-2 py-0.5 text-[10px] text-gray-400">
                {group.entries.length} QSO
                {group.entries.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* QSO table for this year */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 pr-3 font-medium">
                      Callsign
                    </th>
                    <th className="text-left py-1 pr-3 font-medium">Band</th>
                    <th className="text-left py-1 pr-3 font-medium">Mode</th>
                    <th className="text-left py-1 font-medium">Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((entry, rowIndex) => {
                    const entity = getEntityFromCallsign(entry.callsign);
                    return (
                      <tr
                        key={entry.id}
                        className={rowIndex % 2 === 1 ? "bg-white/[0.02]" : ""}
                      >
                        <td className="py-1 pr-3 text-signal-green">
                          {entry.callsign}
                        </td>
                        <td className="py-1 pr-3 text-gray-300">
                          {entry.band || "\u2014"}
                        </td>
                        <td className="py-1 pr-3 text-gray-300">
                          {entry.mode || "\u2014"}
                        </td>
                        <td className="py-1 text-gray-400">
                          {entity?.name || "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </DetailModal>
  );
}

HistoryDetailModal.displayName = "HistoryDetailModal";

export default HistoryDetailModal;
