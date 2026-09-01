/**
 * GridResearchPanel Component
 *
 * A slide-out panel that displays comprehensive research data about a Maidenhead
 * grid square, including DXCC entity, distance/bearing, activity stats, and
 * best contact time predictions.
 *
 * Also supports callsign detail view when clicking on recent callsigns.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useGridResearch,
  type GridResearchData,
} from "@/hooks/useGridResearch";
import { useHamQTHLookup } from "@/hooks/useHamQTHLookup";
import { formatBearingWithDirection } from "@/lib/utils/gridUtils";

/** Panel view state */
type PanelView = "grid" | "callsign";

/**
 * Panel action types
 */
export type GridResearchAction = "watch" | "pin" | "setTarget" | "close";

/**
 * Props for GridResearchPanel
 */
export interface GridResearchPanelProps {
  /** Whether the panel is visible */
  visible: boolean;
  /** Grid locator to research */
  grid: string;
  /** Open directly to an operator profile instead of the grid overview. */
  initialCallsign?: string | null;
  /** Callback when an action is triggered */
  onAction?: (action: GridResearchAction, grid: string) => void;
  /** Callback to close the panel */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** Panel width for calculations */
const PANEL_WIDTH = 320;

/**
 * Loading skeleton component for the panel
 */
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="space-y-2">
        <div className="h-6 w-24 rounded bg-white/10" />
        <div className="h-4 w-48 rounded bg-white/10" />
        <div className="h-3 w-32 rounded bg-white/10" />
      </div>
      <div className="h-px bg-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-white/10" />
        <div className="h-4 w-36 rounded bg-white/10" />
      </div>
      <div className="h-px bg-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-white/10" />
        <div className="flex gap-2">
          <div className="h-12 w-14 rounded bg-white/10" />
          <div className="h-12 w-14 rounded bg-white/10" />
          <div className="h-12 w-14 rounded bg-white/10" />
          <div className="h-12 w-14 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

/**
 * Activity band card showing spot count
 */
function BandCard({
  band,
  count,
  isTop,
}: {
  band: string;
  count: number;
  isTop: boolean;
}) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center
        rounded-lg border px-3 py-2
        ${isTop ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-white/5"}
      `}
    >
      <span className="text-xs font-medium text-gray-400">{band}</span>
      <span
        className={`text-lg font-bold ${isTop ? "text-amber-400" : "text-white"}`}
      >
        {count}
      </span>
    </div>
  );
}

/**
 * Main panel content component
 */
function PanelContent({
  data,
  onAction,
  grid,
  onCallsignClick,
}: {
  data: GridResearchData;
  onAction?: (action: GridResearchAction, grid: string) => void;
  grid: string;
  onCallsignClick?: (callsign: string) => void;
}) {
  // Find the top bands by count (memoized to avoid re-sorting on every render)
  const sortedBands = useMemo(
    () =>
      Object.entries(data.activity.byBand)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 4),
    [data.activity.byBand],
  );
  const topBand = sortedBands[0]?.[0];

  // Find the top modes by count (memoized)
  const sortedModes = useMemo(
    () =>
      Object.entries(data.activity.byMode)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3),
    [data.activity.byMode],
  );

  const handleAction = useCallback(
    (action: GridResearchAction) => {
      onAction?.(action, grid);
    },
    [onAction, grid],
  );

  return (
    <div className="space-y-4">
      {/* Entity Information */}
      <div className="space-y-1">
        <h3 className="font-mono text-xl font-bold text-white">{data.grid}</h3>
        {data.entity ? (
          <>
            <p className="text-sm text-gray-300">
              {data.entity.name}{" "}
              <span className="text-gray-500">({data.entity.prefix})</span>
            </p>
            <p className="font-mono text-xs text-gray-500">
              CQ: {data.entity.cqZone} | ITU: {data.entity.ituZone} |{" "}
              {data.entity.continent}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">Entity not identified</p>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10" />

      {/* Distance and Bearing */}
      {data.distance && data.bearing ? (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-400">Distance</span>
            <span className="font-mono text-sm text-white">
              {data.distance.km.toLocaleString()} km
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-400">Bearing</span>
            <span className="font-mono text-sm text-white">
              {formatBearingWithDirection(data.bearing.degrees)}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-gray-400">Reverse</span>
            <span className="font-mono text-sm text-gray-500">
              {formatBearingWithDirection(data.bearing.reverse)}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          {data.homeGrid
            ? "Could not calculate path"
            : "Set home location for distance/bearing"}
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-white/10" />

      {/* Current Activity */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-gray-300">
            Current Activity
          </h4>
          <span className="text-xs text-gray-500">
            {data.activity.total} spots
          </span>
        </div>

        {sortedBands.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sortedBands.map(([band, count]) => (
              <BandCard
                key={band}
                band={band}
                count={count}
                isTop={band === topBand}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No recent activity detected</p>
        )}

        {sortedModes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedModes.map(([mode, count]) => (
              <span
                key={mode}
                className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400"
              >
                {mode}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10" />

      {/* Best Contact Time */}
      {data.bestTime ? (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300">Best Time Today</h4>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-mono text-sm text-white">
                {data.bestTime.startUtc} - {data.bestTime.endUtc} UTC
              </p>
              <p className="text-xs text-gray-500">
                Optimal band:{" "}
                <span className="text-amber-400">
                  {data.bestTime.optimalBand}
                </span>
              </p>
            </div>
            <ConfidenceBadge confidence={data.bestTime.confidence} />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-gray-300">Best Time Today</h4>
          <p className="text-sm text-gray-500">
            Set home location for predictions
          </p>
        </div>
      )}

      {/* Recent Callsigns - clickable for details */}
      {data.activity.recentCallsigns.length > 0 && (
        <>
          <div className="h-px bg-white/10" />
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-300">
              Recent Callsigns
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {data.activity.recentCallsigns.map((callsign) => (
                <button
                  key={callsign}
                  type="button"
                  onClick={() => onCallsignClick?.(callsign)}
                  className="font-mono text-sm text-cyan-400 transition-colors hover:text-cyan-300 hover:underline focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:ring-offset-1 focus:ring-offset-gray-900 rounded px-0.5"
                  aria-label={`View details for ${callsign}`}
                >
                  {callsign}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="h-px bg-white/10" />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleAction("watch")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10"
          title="Watch this grid for activity"
        >
          <EyeIcon />
          Watch
        </button>
        <button
          type="button"
          onClick={() => handleAction("pin")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10"
          title="Add a pin at this location"
        >
          <PinIcon />
          Pin
        </button>
        <button
          type="button"
          onClick={() => handleAction("setTarget")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400 transition-colors hover:bg-amber-500/20"
          title="Set as path analysis target"
        >
          <TargetIcon />
          Target
        </button>
      </div>
    </div>
  );
}

/**
 * Confidence badge component
 */
function ConfidenceBadge({
  confidence,
}: {
  confidence: "high" | "medium" | "low";
}) {
  const colors = {
    high: "bg-green-500/20 text-green-400 border-green-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${colors[confidence]}`}
    >
      {confidence}
    </span>
  );
}

/**
 * Eye icon for Watch button
 */
function EyeIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

/**
 * Pin icon for Pin button
 */
function PinIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

/**
 * Target icon for Set Target button
 */
function TargetIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <circle cx="12" cy="12" r="6" strokeWidth={2} />
      <circle cx="12" cy="12" r="2" strokeWidth={2} />
    </svg>
  );
}

/**
 * Close (X) icon for header
 */
function CloseIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

/**
 * Back arrow icon
 */
function BackIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

/**
 * External link icon
 */
function ExternalLinkIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

/**
 * Loading skeleton for callsign detail view
 */
function CallsignLoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="space-y-2">
        <div className="h-8 w-32 rounded bg-white/10" />
        <div className="h-5 w-48 rounded bg-white/10" />
      </div>
      <div className="h-px bg-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-white/10" />
        <div className="h-4 w-36 rounded bg-white/10" />
        <div className="h-4 w-44 rounded bg-white/10" />
        <div className="h-4 w-32 rounded bg-white/10" />
      </div>
      <div className="h-px bg-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-white/10" />
        <div className="h-4 w-40 rounded bg-white/10" />
      </div>
    </div>
  );
}

/**
 * CallsignDetailView - Shows detailed callsign information
 */
interface CallsignDetailViewProps {
  callsign: string;
  onBack: () => void;
  onAction?: (action: GridResearchAction, data?: { grid?: string }) => void;
}

function CallsignDetailView({
  callsign,
  onBack,
  onAction,
}: CallsignDetailViewProps) {
  const { external, local, loading, externalError } = useHamQTHLookup(callsign);

  // Format last QSO date
  const formattedLastQSODate = useMemo(() => {
    if (!local?.lastQSO?.date) {
      return null;
    }
    try {
      const date = new Date(local.lastQSO.date);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return local.lastQSO.date;
    }
  }, [local?.lastQSO?.date]);

  // Open QRZ.com in new tab
  const handleExternalLink = useCallback(() => {
    window.open(
      `https://www.qrz.com/db/${encodeURIComponent(callsign)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [callsign]);

  // Handle watch action
  const handleWatch = useCallback(() => {
    onAction?.("watch", { grid: external?.grid });
  }, [onAction, external?.grid]);

  // Handle set as target action
  const handleSetTarget = useCallback(() => {
    if (external?.grid) {
      onAction?.("setTarget", { grid: external.grid });
    }
  }, [onAction, external?.grid]);

  // Combine data for display - prefer external data
  const displayName = external?.name || local?.lastQSO?.name;
  const displayGrid = external?.grid || local?.lastQSO?.grid;
  const displayCountry = external?.country;
  const displayQth = external?.qth;
  const displayCqZone = external?.cqzone;
  const displayItuZone = external?.ituzone;

  const hasExternalData = external && !externalError;
  const hasLocalData = local?.isWorked;
  const hasAnyData = hasExternalData || hasLocalData;

  return (
    <div className="space-y-4">
      {/* Header with back button and external link */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Back to grid view"
        >
          <BackIcon />
          Back
        </button>
        <button
          type="button"
          onClick={handleExternalLink}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300"
          title="Open in QRZ.com"
          aria-label={`Look up ${callsign} on QRZ.com`}
        >
          QRZ.com
          <ExternalLinkIcon />
        </button>
      </div>

      {/* Loading state */}
      {loading && !hasAnyData && <CallsignLoadingSkeleton />}

      {/* Error state */}
      {!loading && !hasAnyData && externalError && (
        <div className="space-y-3">
          <div className="font-mono text-2xl font-bold text-white">
            {callsign}
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-sm text-amber-400">
              Callsign not found in HamQTH database
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Try looking up on QRZ.com using the link above
            </p>
          </div>
          {/* Still show actions even if lookup failed */}
          <div className="h-px bg-white/10" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleWatch}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10"
              title="Watch this callsign for activity"
            >
              <EyeIcon />
              Watch
            </button>
          </div>
        </div>
      )}

      {/* Callsign data display */}
      {hasAnyData && (
        <>
          {/* Callsign header */}
          <div className="space-y-1">
            <div className="font-mono text-2xl font-bold text-white">
              {callsign}
            </div>
            {displayName && (
              <p className="text-lg text-gray-300">{displayName}</p>
            )}
            {local?.isWorked && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-xs font-medium text-cyan-400">
                ✓ Worked before
              </span>
            )}
          </div>

          {/* Location info */}
          {(displayGrid || displayCountry || displayQth) && (
            <>
              <div className="h-px bg-white/10" />
              <div className="space-y-2">
                {displayGrid && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-400">Grid</span>
                    <span className="font-mono text-sm text-white">
                      {displayGrid}
                    </span>
                  </div>
                )}
                {displayCountry && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-400">Country</span>
                    <span className="text-sm text-white">{displayCountry}</span>
                  </div>
                )}
                {(displayCqZone || displayItuZone) && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-400">Zones</span>
                    <span className="font-mono text-sm text-gray-300">
                      {displayCqZone && `CQ: ${displayCqZone}`}
                      {displayCqZone && displayItuZone && " | "}
                      {displayItuZone && `ITU: ${displayItuZone}`}
                    </span>
                  </div>
                )}
                {displayQth && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-gray-400">QTH</span>
                    <span className="text-sm text-white">{displayQth}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* QSO History */}
          {local?.isWorked && local.lastQSO && (
            <>
              <div className="h-px bg-white/10" />
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-300">
                  QSO History
                </h4>
                <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-400">Last QSO</span>
                    <span className="text-sm text-white">
                      {formattedLastQSODate} on {local.lastQSO.band}{" "}
                      {local.lastQSO.mode}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-400">Total QSOs</span>
                    <span className="text-sm text-white">{local.qsoCount}</span>
                  </div>
                  {local.workedBands.length > 0 && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-gray-400">Bands</span>
                      <span className="text-sm text-gray-300">
                        {local.workedBands.join(", ")}
                      </span>
                    </div>
                  )}
                  {local.workedModes.length > 0 && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-gray-400">Modes</span>
                      <span className="text-sm text-gray-300">
                        {local.workedModes.join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="h-px bg-white/10" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleWatch}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/10"
              title="Watch this callsign for activity"
            >
              <EyeIcon />
              Watch
            </button>
            <button
              type="button"
              onClick={handleSetTarget}
              disabled={!displayGrid}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                displayGrid
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  : "cursor-not-allowed border-white/5 bg-white/5 text-gray-500"
              }`}
              title={
                displayGrid
                  ? "Set as path analysis target"
                  : "Grid not available"
              }
            >
              <TargetIcon />
              Target
            </button>
          </div>
        </>
      )}
    </div>
  );
}

CallsignDetailView.displayName = "CallsignDetailView";

/**
 * GridResearchPanel Component
 *
 * Displays a slide-out panel with comprehensive grid research data.
 * Uses glassmorphism styling and supports keyboard/click dismissal.
 */
export function GridResearchPanel({
  visible,
  grid,
  initialCallsign,
  onAction,
  onClose,
  className = "",
}: GridResearchPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // View state: "grid" shows grid research, "callsign" shows callsign details
  const [currentView, setCurrentView] = useState<PanelView>("grid");
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null);

  // Fetch research data for the grid
  const researchData = useGridResearch(grid);

  // Reset to the requested entry point when a new grid/operator is opened.
  useEffect(() => {
    if (initialCallsign) {
      setSelectedCallsign(initialCallsign.toUpperCase());
      setCurrentView("callsign");
      return;
    }
    setCurrentView("grid");
    setSelectedCallsign(null);
  }, [grid, initialCallsign, visible]);

  // Handle click outside to dismiss
  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid immediate dismissal
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, onClose]);

  // Handle Escape key to dismiss or go back
  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (currentView === "callsign") {
          // Go back to grid view instead of closing
          setCurrentView("grid");
          setSelectedCallsign(null);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose, currentView]);

  // Handle clicking a callsign to view details
  const handleCallsignClick = useCallback((callsign: string) => {
    setSelectedCallsign(callsign);
    setCurrentView("callsign");
  }, []);

  // Handle going back from callsign view to grid view
  const handleBackToGrid = useCallback(() => {
    setCurrentView("grid");
    setSelectedCallsign(null);
  }, []);

  // Handle action from grid view
  const handleAction = useCallback(
    (action: GridResearchAction, actionGrid: string) => {
      onAction?.(action, actionGrid);
    },
    [onAction],
  );

  // Handle callsign view actions (may include grid data)
  const handleCallsignAction = useCallback(
    (action: GridResearchAction, data?: { grid?: string }) => {
      switch (action) {
        case "setTarget":
          // Set target requires a grid - use the callsign's grid if available
          if (data?.grid) {
            onAction?.(action, data.grid);
          }
          break;
        case "watch":
          // Watch the callsign pattern for activity
          if (selectedCallsign) {
            onAction?.(action, selectedCallsign);
          }
          break;
        case "pin":
          // Pin requires grid - use the callsign's grid if available
          if (data?.grid) {
            onAction?.(action, data.grid);
          }
          break;
        case "close":
          // Close is handled by the back button, not through this action
          handleBackToGrid();
          break;
      }
    },
    [onAction, selectedCallsign, handleBackToGrid],
  );

  const panelContent = (
    <div
      ref={panelRef}
      className={`
        fixed right-0 top-0 z-50 h-full
        bg-gray-900/95 backdrop-blur-xl
        border-l border-white/10
        shadow-2xl
        transition-transform duration-300 ease-out
        ${visible ? "translate-x-0" : "translate-x-full"}
        ${className}
      `}
      style={{ width: PANEL_WIDTH }}
      role="dialog"
      aria-label="Grid Research Panel"
      aria-hidden={!visible}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-medium text-gray-300">
          {currentView === "callsign" ? "Operator" : "Grid Research"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Close panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Content */}
      <div className="h-[calc(100%-52px)] overflow-y-auto p-4">
        {currentView === "callsign" && selectedCallsign ? (
          <CallsignDetailView
            callsign={selectedCallsign}
            onBack={handleBackToGrid}
            onAction={handleCallsignAction}
          />
        ) : !researchData.isValidGrid ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-gray-500">Invalid grid format</p>
          </div>
        ) : researchData.isLoading ? (
          <LoadingSkeleton />
        ) : (
          <PanelContent
            data={researchData}
            onAction={handleAction}
            grid={grid}
            onCallsignClick={handleCallsignClick}
          />
        )}
      </div>
    </div>
  );

  // Render via portal to document.body
  return createPortal(panelContent, document.body);
}

GridResearchPanel.displayName = "GridResearchPanel";

export default GridResearchPanel;
