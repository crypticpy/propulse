/**
 * CallsignInfoCard — Displays lookup result data and previous contact info.
 *
 * Appears below the callsign input when a lookup result exists.
 * Shows name, QTH, grid, CQ/ITU zone, country, and dupe info.
 */

import type { QSOLookupResult, QSODupeInfo } from "@/types/qso";

export interface CallsignInfoCardProps {
  lookupResult: QSOLookupResult | null;
  lookupLoading: boolean;
  lookupError: string | null;
  dupeInfo: QSODupeInfo | null;
}

export function CallsignInfoCard({
  lookupResult,
  lookupLoading,
  lookupError,
  dupeInfo,
}: CallsignInfoCardProps) {
  // Loading skeleton
  if (lookupLoading) {
    return (
      <div
        className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl p-3 animate-pulse"
        aria-label="Loading callsign info"
      >
        <div className="flex items-center gap-3">
          <div className="h-4 w-32 bg-white/10 rounded" />
          <div className="h-4 w-24 bg-white/10 rounded" />
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-3 w-20 bg-white/10 rounded" />
          <div className="h-3 w-16 bg-white/10 rounded" />
          <div className="h-3 w-16 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  // Error state
  if (lookupError) {
    return (
      <div className="bg-alert-red/5 border border-alert-red/20 rounded-xl p-3">
        <p className="text-sm text-alert-red">{lookupError}</p>
      </div>
    );
  }

  // No result
  if (!lookupResult) return null;

  const { callsign, name, qth, grid, country, cqZone, ituZone } = lookupResult;

  // Build location string
  const locationParts: string[] = [];
  if (qth) locationParts.push(qth);
  if (country && country !== qth) locationParts.push(country);
  const locationStr = locationParts.join(", ");

  return (
    <div
      className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl p-3"
      aria-label={`Info for ${callsign}`}
    >
      {/* Top row: callsign + name + location */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-mono font-bold text-white">
            {callsign}
          </span>
          {name && (
            <>
              <span className="text-gray-500">&mdash;</span>
              <span className="text-sm text-gray-300 truncate">{name}</span>
            </>
          )}
        </div>
        {locationStr && (
          <span className="text-sm text-gray-400 shrink-0">{locationStr}</span>
        )}
      </div>

      {/* Second row: grid, CQ zone, ITU zone */}
      <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-gray-500">
        {grid && (
          <span>
            Grid: <span className="font-mono text-gray-300">{grid}</span>
          </span>
        )}
        {cqZone != null && (
          <span>
            CQ: <span className="font-mono text-gray-300">{cqZone}</span>
          </span>
        )}
        {ituZone != null && (
          <span>
            ITU: <span className="font-mono text-gray-300">{ituZone}</span>
          </span>
        )}

        {/* Previous contact info from dupe check */}
        {dupeInfo && dupeInfo.previousContacts.length > 0 && (
          <span className="text-caution-amber">
            Worked:{" "}
            {dupeInfo.previousContacts
              .slice(0, 3)
              .map((c) => `${c.band} ${c.mode}`)
              .join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}
