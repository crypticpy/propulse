/**
 * ContestContributions — Display how contest QSOs contributed to awards
 *
 * Shows a summary banner on the Awards page indicating new DXCC entities,
 * WAS states, and WAZ zones gained from the most recent contest session.
 * Expandable detail section lists specific new entities, states, and zones.
 */

import { useState, useEffect, useCallback } from "react";
import { useContestStore } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import { getAllLogEntries } from "@/lib/db/logStore";
import {
  getContestContributions,
  type ContestAwardContributions,
} from "@/lib/awards/contestAwardIntegration";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ContestContributionsProps {
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ContestContributions({
  className = "",
}: ContestContributionsProps) {
  const sessionHistory = useContestStore((s) => s.sessionHistory);
  const [contributions, setContributions] =
    useState<ContestAwardContributions | null>(null);
  const [contestName, setContestName] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get the most recent session with QSOs
  const recentSession = sessionHistory.find((s) => s.qsos.length > 0) ?? null;

  const computeContributions = useCallback(async () => {
    if (!recentSession) {
      setContributions(null);
      return;
    }

    setLoading(true);
    try {
      const existingEntries = await getAllLogEntries();
      // Filter out entries from THIS contest so we only compare against non-contest log
      const nonContestEntries = existingEntries.filter(
        (e) => e.contestId !== recentSession.id,
      );
      const result = getContestContributions(recentSession, nonContestEntries);
      setContributions(result);

      // Look up the contest name
      const contestDef = getContestById(recentSession.contestId);
      setContestName(contestDef?.name ?? recentSession.contestId);
    } catch (err) {
      console.error("[ContestContributions] Failed to compute:", err);
      setContributions(null);
    } finally {
      setLoading(false);
    }
  }, [recentSession]);

  useEffect(() => {
    computeContributions();
  }, [computeContributions]);

  // Don't render if no recent contest or no contributions
  if (!recentSession || loading) return null;
  if (!contributions) return null;

  const hasAnyNew =
    contributions.newDxccEntities.length > 0 ||
    contributions.newWasStates.length > 0 ||
    contributions.newWazZones.length > 0 ||
    contributions.newDxccBands.length > 0;

  if (!hasAnyNew) return null;

  return (
    <div
      className={`
        rounded-lg border border-white/10 bg-deep-space/50
        overflow-hidden ${className}
      `}
    >
      {/* Summary banner */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="
          w-full flex items-center justify-between
          px-4 py-3 text-left
          hover:bg-white/[0.02] transition-colors
        "
        aria-expanded={expanded}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-gray-400">From</span>
          <span className="font-semibold text-white">{contestName}</span>
          <span className="text-gray-500">:</span>

          {contributions.newDxccEntities.length > 0 && (
            <span className="text-alert-red font-medium">
              +{contributions.newDxccEntities.length} new DXCC
              {contributions.newDxccEntities.length !== 1
                ? " entities"
                : " entity"}
            </span>
          )}

          {contributions.newDxccBands.length > 0 && (
            <span className="text-signal-green font-medium">
              +{contributions.newDxccBands.length} new band
              {contributions.newDxccBands.length !== 1 ? " slots" : " slot"}
            </span>
          )}

          {contributions.newWasStates.length > 0 && (
            <span className="text-nebula-blue font-medium">
              +{contributions.newWasStates.length} new WAS state
              {contributions.newWasStates.length !== 1 ? "s" : ""}
            </span>
          )}

          {contributions.newWazZones.length > 0 && (
            <span className="text-plasma-orange font-medium">
              +{contributions.newWazZones.length} new WAZ zone
              {contributions.newWazZones.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        <svg
          className={`
            w-4 h-4 text-gray-500 shrink-0 ml-2
            transition-transform duration-200
            ${expanded ? "rotate-180" : ""}
          `}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3">
          {/* New DXCC entities */}
          {contributions.newDxccEntities.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-alert-red uppercase tracking-wider mb-1.5">
                New DXCC Entities
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {contributions.newDxccEntities.map((entity) => (
                  <span
                    key={entity.id}
                    className="
                      text-xs px-2 py-0.5 rounded
                      bg-alert-red/10 text-alert-red/80 border border-alert-red/20
                    "
                  >
                    {entity.name} ({entity.prefix})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* New DXCC band slots */}
          {contributions.newDxccBands.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-signal-green uppercase tracking-wider mb-1.5">
                New Band Slots
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {contributions.newDxccBands.map(({ entity, band }) => (
                  <span
                    key={`${entity.id}-${band}`}
                    className="
                      text-xs px-2 py-0.5 rounded
                      bg-signal-green/10 text-signal-green/80 border border-signal-green/20
                    "
                  >
                    {entity.prefix} / {band}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* New WAS states */}
          {contributions.newWasStates.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-nebula-blue uppercase tracking-wider mb-1.5">
                New WAS States
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {contributions.newWasStates.map((state) => (
                  <span
                    key={state}
                    className="
                      text-xs px-2 py-0.5 rounded
                      bg-nebula-blue/10 text-nebula-blue/80 border border-nebula-blue/20
                    "
                  >
                    {state}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* New WAZ zones */}
          {contributions.newWazZones.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-plasma-orange uppercase tracking-wider mb-1.5">
                New WAZ Zones
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {contributions.newWazZones.map((zone) => (
                  <span
                    key={zone}
                    className="
                      text-xs px-2 py-0.5 rounded
                      bg-plasma-orange/10 text-plasma-orange/80 border border-plasma-orange/20
                    "
                  >
                    Zone {zone}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* QSO count summary */}
          <p className="text-xs text-gray-500 pt-1">
            {contributions.totalQsos} total QSOs analyzed (excluding dupes)
          </p>
        </div>
      )}
    </div>
  );
}
