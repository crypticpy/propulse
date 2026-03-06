/**
 * SitRepLog -- Scrollable log of situation report entries for the current
 * EmComm incident. Displays newest-first with an "Export All" button that
 * generates a plain-text file.
 */

import { useMemo } from "react";
import { useEmcommStore } from "@/stores/emcommStore";
import { downloadBlob } from "@/lib/utils/downloadBlob";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

export function SitRepLog() {
  const entries = useEmcommStore((s) => s.sitRepEntries);
  const activeIncident = useEmcommStore((s) => s.activeIncident);

  // Newest first
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [entries],
  );

  function handleExport() {
    if (sorted.length === 0) return;

    const incidentName = activeIncident?.name ?? "Unknown Incident";
    const lines = [
      `SITUATION REPORT LOG`,
      `Incident: ${incidentName}`,
      `Exported: ${new Date().toISOString()}`,
      `Total Entries: ${sorted.length}`,
      `${"=".repeat(60)}`,
      "",
    ];

    for (const entry of sorted) {
      lines.push(`--- SitRep: ${formatTimestamp(entry.timestamp)} ---`);
      lines.push(`Author:      ${entry.author}`);
      lines.push(`Summary:     ${entry.summary}`);
      lines.push(`Conditions:  ${entry.conditions}`);
      if (entry.netActivity) {
        lines.push(`Net Activity: ${entry.netActivity}`);
      }
      if (entry.nextActions) {
        lines.push(`Next Actions: ${entry.nextActions}`);
      }
      lines.push("");
    }

    const filename = `sitrep-${incidentName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
    downloadBlob(lines.join("\n"), filename, "text/plain");
  }

  if (sorted.length === 0) {
    return (
      <div className="p-3 border-b border-white/5">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-2">
          Situation Reports
        </h2>
        <p className="text-[10px] text-gray-600">No situation reports yet</p>
      </div>
    );
  }

  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
          Situation Reports ({sorted.length})
        </h2>
        <button
          type="button"
          onClick={handleExport}
          className="text-[10px] text-gray-500 hover:text-plasma-orange transition-colors"
        >
          Export All
        </button>
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-white/10">
        {sorted.map((entry) => (
          <div
            key={entry.id}
            className="rounded-md bg-white/[0.03] border border-white/5 p-2"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-mono text-gray-400">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span className="text-[10px] font-mono text-plasma-orange">
                {entry.author}
              </span>
            </div>
            <p className="text-xs text-white leading-snug">
              {truncate(entry.summary, 120)}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {entry.conditions}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
