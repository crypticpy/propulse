/**
 * AwardsTracker - DXCC/WAS/WAZ progress display
 * Shows progress toward common amateur radio awards
 */

import { useMemo } from "react";
import type { LogEntry } from "@/lib/db/types";
import { Card, ProgressBar } from "@/components/ui";
import {
  PREFIX_LOCATIONS,
  extractPrefixFromCallsign,
} from "@/lib/data/prefixLocations";

export interface AwardsTrackerProps {
  entries: LogEntry[];
  className?: string;
}

/**
 * Amateur bands for band breakdown display
 */
const BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
];

/**
 * US States with their abbreviations
 */
const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

/**
 * Extract DXCC entity from callsign
 */
function getDXCCEntity(callsign: string): string | null {
  const prefix = extractPrefixFromCallsign(callsign);
  if (!prefix) return null;

  // Try progressively shorter prefixes to find a match
  const upperPrefix = prefix.toUpperCase();
  for (let len = upperPrefix.length; len >= 1; len--) {
    const shortPrefix = upperPrefix.slice(0, len);
    const location = PREFIX_LOCATIONS[shortPrefix];
    if (location) {
      return location.name;
    }
  }

  return null;
}

/**
 * Attempt to extract US state from log entry
 * Checks QTH field, exchange, and callsign patterns
 */
function extractUSState(entry: LogEntry): string | null {
  // Check QTH field for state abbreviation
  if (entry.qth) {
    const qth = entry.qth.toUpperCase();
    for (const abbr of Object.keys(US_STATES)) {
      if (qth.includes(abbr) || qth.includes(US_STATES[abbr].toUpperCase())) {
        return abbr;
      }
    }
  }

  // Check notes field for contest exchange with state
  if (entry.notes) {
    const notes = entry.notes.toUpperCase();
    for (const abbr of Object.keys(US_STATES)) {
      // Look for state abbreviations bounded by spaces or punctuation
      const pattern = new RegExp(`\\b${abbr}\\b`);
      if (pattern.test(notes)) {
        return abbr;
      }
    }
  }

  return null;
}

/**
 * Extract CQ Zone from entry or estimate from callsign
 * CQ Zones range from 1-40
 */
function getCQZone(entry: LogEntry): number | null {
  // If zone is in notes (from contest), extract it
  if (entry.notes) {
    const zoneMatch = entry.notes.match(/\b(zone\s*)?(\d{1,2})\b/i);
    if (zoneMatch) {
      const zone = parseInt(zoneMatch[2], 10);
      if (zone >= 1 && zone <= 40) {
        return zone;
      }
    }
  }

  // Estimate zone from DXCC entity (simplified mapping)
  const entity = getDXCCEntity(entry.callsign);
  if (!entity) return null;

  // Simplified CQ zone mapping based on entity
  const zoneMap: Record<string, number> = {
    USA: 5,
    Canada: 5,
    Mexico: 6,
    Japan: 25,
    "South Korea": 25,
    Taiwan: 24,
    China: 24,
    Australia: 30,
    "New Zealand": 32,
    Germany: 14,
    France: 14,
    England: 14,
    Scotland: 14,
    Wales: 14,
    Italy: 15,
    Spain: 14,
    Russia: 16,
    Brazil: 11,
    Argentina: 13,
    "South Africa": 38,
    India: 22,
  };

  return zoneMap[entity] || null;
}

/**
 * Check if an entry is confirmed via LoTW or QSL card
 */
function isConfirmed(entry: LogEntry): boolean {
  return entry.lotw === true || entry.qslRcvd === "Y";
}

/**
 * Get milestone color based on progress
 */
function getMilestoneColor(
  current: number,
  milestone: number,
): "green" | "orange" | "amber" {
  if (current >= milestone) return "green";
  if (current >= milestone * 0.75) return "amber";
  return "orange";
}

export function AwardsTracker({ entries, className = "" }: AwardsTrackerProps) {
  // Calculate DXCC stats
  const dxccStats = useMemo(() => {
    const worked = new Map<
      string,
      { confirmed: boolean; bands: Set<string> }
    >();

    for (const entry of entries) {
      const entity = getDXCCEntity(entry.callsign);
      if (!entity) continue;

      const existing = worked.get(entity);
      const confirmed = isConfirmed(entry);

      if (existing) {
        existing.bands.add(entry.band);
        if (confirmed) existing.confirmed = true;
      } else {
        worked.set(entity, {
          confirmed,
          bands: new Set([entry.band]),
        });
      }
    }

    // Calculate band breakdown
    const bandBreakdown: Record<string, { worked: number; confirmed: number }> =
      {};
    for (const band of BANDS) {
      bandBreakdown[band] = { worked: 0, confirmed: 0 };
    }

    for (const [, data] of worked) {
      for (const band of data.bands) {
        if (bandBreakdown[band]) {
          bandBreakdown[band].worked++;
          if (data.confirmed) {
            bandBreakdown[band].confirmed++;
          }
        }
      }
    }

    const totalWorked = worked.size;
    const totalConfirmed = Array.from(worked.values()).filter(
      (d) => d.confirmed,
    ).length;

    return {
      totalWorked,
      totalConfirmed,
      bandBreakdown,
    };
  }, [entries]);

  // Calculate WAS (Worked All States) stats
  const wasStats = useMemo(() => {
    const worked = new Map<string, boolean>();

    for (const entry of entries) {
      // Only count US callsigns
      const entity = getDXCCEntity(entry.callsign);
      if (entity !== "USA") continue;

      const state = extractUSState(entry);
      if (!state) continue;

      const confirmed = isConfirmed(entry);
      const existing = worked.get(state);

      if (!existing || (confirmed && !existing)) {
        worked.set(state, confirmed);
      }
    }

    const totalWorked = worked.size;
    const totalConfirmed = Array.from(worked.values()).filter(Boolean).length;

    return {
      totalWorked,
      totalConfirmed,
      states: worked,
    };
  }, [entries]);

  // Calculate WAZ (Worked All Zones) stats
  const wazStats = useMemo(() => {
    const worked = new Map<number, boolean>();

    for (const entry of entries) {
      const zone = getCQZone(entry);
      if (!zone) continue;

      const confirmed = isConfirmed(entry);
      const existing = worked.get(zone);

      if (!existing || (confirmed && !existing)) {
        worked.set(zone, confirmed);
      }
    }

    const totalWorked = worked.size;
    const totalConfirmed = Array.from(worked.values()).filter(Boolean).length;

    return {
      totalWorked,
      totalConfirmed,
      zones: worked,
    };
  }, [entries]);

  // Determine next DXCC milestone
  const nextDXCCMilestone = useMemo(() => {
    const milestones = [100, 200, 300, 340];
    for (const m of milestones) {
      if (dxccStats.totalConfirmed < m) return m;
    }
    return 340;
  }, [dxccStats.totalConfirmed]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* DXCC Progress */}
      <Card className="p-4">
        <h3 className="font-orbitron text-lg font-bold text-white mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-plasma-orange"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          DXCC
        </h3>

        {/* Overall stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-2xl font-bold text-plasma-orange">
              {dxccStats.totalWorked}
            </p>
            <p className="text-xs text-gray-400">Entities Worked</p>
          </div>
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-2xl font-bold text-signal-green">
              {dxccStats.totalConfirmed}
            </p>
            <p className="text-xs text-gray-400">Confirmed</p>
          </div>
        </div>

        {/* Progress bar toward milestone */}
        <ProgressBar
          value={(dxccStats.totalConfirmed / nextDXCCMilestone) * 100}
          label={`Progress to ${nextDXCCMilestone} DXCC`}
          color={getMilestoneColor(dxccStats.totalConfirmed, nextDXCCMilestone)}
          showValue
        />

        {/* Milestone badges */}
        <div className="flex gap-2 mt-4">
          {[100, 200, 300].map((milestone) => (
            <div
              key={milestone}
              className={`
                flex-1 text-center py-1.5 rounded-lg text-sm font-medium
                ${
                  dxccStats.totalConfirmed >= milestone
                    ? "bg-signal-green/20 text-signal-green border border-signal-green/30"
                    : "bg-white/5 text-gray-500 border border-white/10"
                }
              `}
            >
              {milestone}
            </div>
          ))}
        </div>

        {/* Band breakdown */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            Band Breakdown
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs">
                  <th className="text-left py-1">Band</th>
                  <th className="text-right py-1">Worked</th>
                  <th className="text-right py-1">Confirmed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {BANDS.filter(
                  (band) => dxccStats.bandBreakdown[band]?.worked > 0,
                ).map((band) => (
                  <tr key={band}>
                    <td className="py-1.5 font-mono text-white">{band}</td>
                    <td className="py-1.5 text-right text-plasma-orange">
                      {dxccStats.bandBreakdown[band].worked}
                    </td>
                    <td className="py-1.5 text-right text-signal-green">
                      {dxccStats.bandBreakdown[band].confirmed}
                    </td>
                  </tr>
                ))}
                {BANDS.every(
                  (band) => dxccStats.bandBreakdown[band]?.worked === 0,
                ) && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-3 text-center text-gray-500 italic"
                    >
                      No band data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* WAS (Worked All States) */}
      <Card className="p-4">
        <h3 className="font-orbitron text-lg font-bold text-white mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-aurora-purple"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          WAS (Worked All States)
        </h3>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-2xl font-bold text-plasma-orange">
              {wasStats.totalWorked}
            </p>
            <p className="text-xs text-gray-400">States Worked</p>
          </div>
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-2xl font-bold text-signal-green">
              {wasStats.totalConfirmed}
            </p>
            <p className="text-xs text-gray-400">Confirmed</p>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar
          value={(wasStats.totalConfirmed / 50) * 100}
          label="Progress to WAS"
          color={getMilestoneColor(wasStats.totalConfirmed, 50)}
          showValue
        />

        {/* State indicator */}
        <p className="mt-3 text-sm text-gray-400">
          {50 - wasStats.totalConfirmed > 0
            ? `${50 - wasStats.totalConfirmed} more states needed for WAS`
            : "Congratulations! WAS complete!"}
        </p>
      </Card>

      {/* WAZ (Worked All Zones) */}
      <Card className="p-4">
        <h3 className="font-orbitron text-lg font-bold text-white mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-cosmic-cyan"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
          WAZ (Worked All Zones)
        </h3>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-2xl font-bold text-plasma-orange">
              {wazStats.totalWorked}
            </p>
            <p className="text-xs text-gray-400">Zones Worked</p>
          </div>
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-2xl font-bold text-signal-green">
              {wazStats.totalConfirmed}
            </p>
            <p className="text-xs text-gray-400">Confirmed</p>
          </div>
        </div>

        {/* Progress bar */}
        <ProgressBar
          value={(wazStats.totalConfirmed / 40) * 100}
          label="Progress to WAZ"
          color={getMilestoneColor(wazStats.totalConfirmed, 40)}
          showValue
        />

        {/* Zone grid (8x5 = 40 zones) */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            CQ Zones (1-40)
          </h4>
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: 40 }, (_, i) => i + 1).map((zone) => {
              const confirmed = wazStats.zones.get(zone) === true;
              const worked = wazStats.zones.has(zone);

              return (
                <div
                  key={zone}
                  className={`
                    aspect-square flex items-center justify-center rounded text-xs font-mono
                    ${
                      confirmed
                        ? "bg-signal-green/30 text-signal-green border border-signal-green/50"
                        : worked
                          ? "bg-plasma-orange/30 text-plasma-orange border border-plasma-orange/50"
                          : "bg-white/5 text-gray-600 border border-white/10"
                    }
                  `}
                  title={`Zone ${zone}: ${confirmed ? "Confirmed" : worked ? "Worked" : "Not worked"}`}
                >
                  {zone}
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-signal-green/30 border border-signal-green/50" />
              <span className="text-gray-400">Confirmed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-plasma-orange/30 border border-plasma-orange/50" />
              <span className="text-gray-400">Worked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-white/5 border border-white/10" />
              <span className="text-gray-400">Not worked</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default AwardsTracker;
