/**
 * CallsignLookup - Displays callsign lookup results inline below the callsign input
 * Combines external HamQTH lookup with local QSO history
 */

import { useMemo, useCallback } from "react";
import { useHamQTHLookup } from "@/hooks/useHamQTHLookup";
import type {
  ExternalCallsignData,
  LocalCallsignData,
} from "@/hooks/useHamQTHLookup";
import { LoadingSpinner } from "@/components/ui";

export interface CallsignLookupProps {
  /** The callsign to look up */
  callsign: string;
  /** Callback when user clicks "Use this info" button */
  onAutoFill?: (data: { name?: string; grid?: string; qth?: string }) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * CallsignLookup Component
 *
 * Displays lookup results for a callsign, combining:
 * - External data from HamQTH callbook
 * - Local QSO history from the logbook
 *
 * Shows "WORKED BEFORE" badge if callsign exists in local log,
 * or "NEW CALLSIGN" if this is a new contact.
 *
 * @example
 * ```tsx
 * <CallsignLookup
 *   callsign={callsign}
 *   onAutoFill={(data) => {
 *     setName(data.name || '');
 *     setGrid(data.grid || '');
 *     setQth(data.qth || '');
 *   }}
 * />
 * ```
 */
export function CallsignLookup({
  callsign,
  onAutoFill,
  className = "",
}: CallsignLookupProps) {
  // Combined HamQTH external lookup and local log history
  const { external, local, loading, externalError } = useHamQTHLookup(callsign);

  // Don't show anything if callsign is too short
  const normalizedCallsign = callsign.trim().toUpperCase();
  if (normalizedCallsign.length < 3) {
    return null;
  }

  // Check if we have any data to display
  const hasLocalData = local?.isWorked ?? false;
  const hasExternalData = external && !externalError;
  const hasAnyData = hasLocalData || hasExternalData;

  // If both lookups failed with no data, show error
  if (!loading && !hasAnyData && externalError) {
    return (
      <div
        className={`mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg ${className}`}
      >
        <div className="flex items-center gap-2 text-sm text-caution-amber">
          <WarningIcon />
          <span>Not found in HamQTH</span>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading && !hasAnyData) {
    return (
      <div
        className={`mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg ${className}`}
      >
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Don't render if no data
  if (!hasAnyData) {
    return null;
  }

  return (
    <div
      className={`mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg ${className}`}
    >
      {local?.isWorked && local.lastQSO ? (
        <WorkedBeforeView
          localData={local}
          externalData={external}
          onAutoFill={onAutoFill}
        />
      ) : (
        <NewCallsignView externalData={external} onAutoFill={onAutoFill} />
      )}
    </div>
  );
}

/**
 * View for callsigns that have been worked before
 */
interface WorkedBeforeViewProps {
  localData: LocalCallsignData;
  externalData?: ExternalCallsignData;
  onAutoFill?: (data: { name?: string; grid?: string; qth?: string }) => void;
}

function WorkedBeforeView({
  localData,
  externalData,
  onAutoFill,
}: WorkedBeforeViewProps) {
  const lastQSO = localData.lastQSO;

  // Prefer external data if available, fall back to local QSO data
  const displayName = externalData?.name || lastQSO?.name;
  const displayGrid = externalData?.grid || lastQSO?.grid;
  const displayQth = externalData?.qth;

  const hasInfoToFill = displayName || displayGrid || displayQth;

  const handleAutoFill = useCallback(() => {
    if (onAutoFill) {
      onAutoFill({
        name: displayName,
        grid: displayGrid,
        qth: displayQth,
      });
    }
  }, [onAutoFill, displayName, displayGrid, displayQth]);

  // Format date for display
  const formattedDate = useMemo(() => {
    if (!lastQSO?.date) return "";
    try {
      const date = new Date(lastQSO.date);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return lastQSO.date;
    }
  }, [lastQSO?.date]);

  return (
    <div className="space-y-1">
      {/* Header row with badge and last QSO info */}
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30 rounded-full text-xs font-mono font-medium">
          <CheckIcon />
          WORKED BEFORE
        </span>
        {lastQSO && (
          <>
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">
              Last: {formattedDate} on {lastQSO.band} {lastQSO.mode}
            </span>
          </>
        )}
      </div>

      {/* Details row */}
      {(displayName || displayGrid || displayQth) && (
        <div className="flex items-center gap-2 text-sm text-gray-300">
          {displayName && <span>{displayName}</span>}
          {displayName && displayGrid && (
            <span className="text-gray-500">·</span>
          )}
          {displayGrid && <span className="font-mono">{displayGrid}</span>}
          {(displayName || displayGrid) && displayQth && (
            <span className="text-gray-500">·</span>
          )}
          {displayQth && <span>{displayQth}</span>}
        </div>
      )}

      {/* Auto-fill button */}
      {hasInfoToFill && onAutoFill && (
        <button
          type="button"
          onClick={handleAutoFill}
          className="mt-1 text-xs text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors font-medium"
        >
          [Use this info]
        </button>
      )}
    </div>
  );
}

/**
 * View for new callsigns (not worked before)
 */
interface NewCallsignViewProps {
  externalData?: ExternalCallsignData;
  onAutoFill?: (data: { name?: string; grid?: string; qth?: string }) => void;
}

function NewCallsignView({ externalData, onAutoFill }: NewCallsignViewProps) {
  const hasInfoToFill =
    externalData?.name || externalData?.grid || externalData?.qth;

  const handleAutoFill = useCallback(() => {
    if (onAutoFill && externalData) {
      onAutoFill({
        name: externalData.name,
        grid: externalData.grid,
        qth: externalData.qth,
      });
    }
  }, [onAutoFill, externalData]);

  return (
    <div className="space-y-1">
      {/* Header row with badge and country/zone info */}
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-signal-green/20 text-signal-green border border-signal-green/30 rounded-full text-xs font-mono font-medium">
          <StarIcon />
          NEW CALLSIGN
        </span>
        {externalData?.country && (
          <>
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">
              Country: {externalData.country}
            </span>
          </>
        )}
        {externalData?.cqzone && (
          <>
            <span className="text-gray-500">·</span>
            <span className="text-gray-400">
              CQ Zone: {externalData.cqzone}
            </span>
          </>
        )}
      </div>

      {/* Details row */}
      {(externalData?.name || externalData?.grid || externalData?.qth) && (
        <div className="flex items-center gap-2 text-sm text-gray-300">
          {externalData.name && <span>{externalData.name}</span>}
          {externalData.name && externalData.grid && (
            <span className="text-gray-500">·</span>
          )}
          {externalData.grid && (
            <span className="font-mono">{externalData.grid}</span>
          )}
          {(externalData.name || externalData.grid) && externalData.qth && (
            <span className="text-gray-500">·</span>
          )}
          {externalData.qth && <span>{externalData.qth}</span>}
        </div>
      )}

      {/* Auto-fill button */}
      {hasInfoToFill && onAutoFill && (
        <button
          type="button"
          onClick={handleAutoFill}
          className="mt-1 text-xs text-signal-green hover:text-signal-green/80 transition-colors font-medium"
        >
          [Use this info]
        </button>
      )}
    </div>
  );
}

/**
 * Check icon for "WORKED BEFORE" badge
 */
function CheckIcon() {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

/**
 * Star icon for "NEW CALLSIGN" badge
 */
function StarIcon() {
  return (
    <svg
      className="w-3 h-3"
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

/**
 * Warning icon for lookup failures
 */
function WarningIcon() {
  return (
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
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

export default CallsignLookup;
