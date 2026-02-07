/**
 * CallsignLookupSuggestions
 *
 * Small card that shows auto-fill suggestions from a callsign lookup.
 * Only renders when a non-null suggestion is provided.
 * Used on the Profile page to offer one-click auto-fill of operator
 * name, grid square, and country from HamQTH data.
 */

import type { CallsignSuggestion } from "@/hooks/useCallsignAutoFill";

interface Props {
  suggestion: CallsignSuggestion | null;
  loading: boolean;
  onAutoFill: (suggestion: CallsignSuggestion) => void;
  onDismiss: () => void;
}

export function CallsignLookupSuggestions({
  suggestion,
  loading,
  onAutoFill,
  onDismiss,
}: Props) {
  // Loading state
  if (loading) {
    return (
      <div className="mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <LoadingDots />
          <span>Looking up callsign...</span>
        </div>
      </div>
    );
  }

  // Nothing to show
  if (!suggestion) {
    return null;
  }

  const hasAnyData = suggestion.name || suggestion.grid || suggestion.country;
  if (!hasAnyData) {
    return null;
  }

  return (
    <div className="mt-2 px-3 py-2.5 bg-signal-green/5 border border-signal-green/20 rounded-lg">
      <div className="flex items-start justify-between gap-3">
        {/* Suggestion data */}
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-medium text-signal-green uppercase tracking-wider">
            Callbook Match
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-300">
            {suggestion.name && <span>{suggestion.name}</span>}
            {suggestion.grid && (
              <span className="font-mono text-xs bg-white/5 px-1.5 py-0.5 rounded">
                {suggestion.grid}
              </span>
            )}
            {suggestion.country && (
              <span className="text-gray-400">{suggestion.country}</span>
            )}
            {suggestion.licenseClass && (
              <span className="text-gray-400">{suggestion.licenseClass}</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          <button
            type="button"
            onClick={() => onAutoFill(suggestion)}
            className="px-2.5 py-1 text-xs font-medium rounded bg-signal-green/20 text-signal-green border border-signal-green/30 hover:bg-signal-green/30 transition-colors"
          >
            Auto-fill
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-2 py-1 text-xs font-medium rounded text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Dismiss suggestion"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/** Simple animated loading dots */
function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse [animation-delay:300ms]" />
    </span>
  );
}
