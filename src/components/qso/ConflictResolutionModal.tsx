/**
 * ConflictResolutionModal — Centered modal for resolving a single sync conflict.
 *
 * Follows the ConfirmDialog.tsx pattern: createPortal, z-[500], escape-close,
 * body scroll lock, void-black/80 backdrop.
 *
 * The user can keep their local version, accept the remote version, or
 * cherry-pick field-level resolutions and save a merged result.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { SyncConflict } from "@/types/qso";
import type { LogEntry } from "@/lib/db/types";
import { useConflicts } from "@/hooks/useConflicts";
import {
  ConflictFieldRow,
  FIELD_LABELS,
  type FieldResolution,
} from "@/components/qso/ConflictFieldRow";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Human-readable relative time (e.g. "2 hours ago") */
function relativeTime(iso: string | undefined): string {
  if (!iso) return "unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format a UTC time string for QSO header display */
function formatQsoHeader(data: Record<string, unknown>): string {
  const callsign = data.callsign ? String(data.callsign) : "Unknown";
  const date = data.date ? String(data.date) : "";
  const timeOn = data.timeOn ? String(data.timeOn) : "";
  const parts = [callsign];
  if (date) parts.push(`on ${date}`);
  if (timeOn) parts.push(`${timeOn} UTC`);
  return parts.join(" ");
}

/** Get non-conflicting fields that have values */
function getUnchangedFields(
  localData: Record<string, unknown>,
  remoteData: Record<string, unknown>,
  conflictingFields: string[],
): Array<{ field: string; value: unknown }> {
  const conflictSet = new Set(conflictingFields);
  const skipFields = new Set([
    "id",
    "createdAt",
    "updatedAt",
    "version",
    "lastDeviceId",
  ]);
  const result: Array<{ field: string; value: unknown }> = [];

  const allKeys = new Set([
    ...Object.keys(localData),
    ...Object.keys(remoteData),
  ]);

  for (const key of allKeys) {
    if (conflictSet.has(key) || skipFields.has(key)) continue;
    const val = localData[key] ?? remoteData[key];
    if (val == null || val === "") continue;
    result.push({ field: key, value: val });
  }

  return result;
}

function displayValue(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const str = String(value).trim();
  return str || "\u2014";
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ConflictResolutionModalProps {
  conflict: SyncConflict;
  onClose: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ConflictResolutionModal({
  conflict,
  onClose,
}: ConflictResolutionModalProps) {
  const { resolveConflict } = useConflicts();

  // Per-field resolution state
  const [fieldResolutions, setFieldResolutions] = useState<
    Record<string, FieldResolution>
  >(() => {
    const init: Record<string, FieldResolution> = {};
    for (const f of conflict.conflictingFields) {
      init[f] = "local";
    }
    return init;
  });

  // Per-field merged text (only for text-mergeable fields)
  const [mergedValues, setMergedValues] = useState<Record<string, string>>({});

  // Collapsed unchanged fields
  const [unchangedExpanded, setUnchangedExpanded] = useState(false);

  // Resolving state (disable buttons during async)
  const [isResolving, setIsResolving] = useState(false);

  // ── Keyboard / scroll lock ──────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────

  const unchangedFields = useMemo(
    () =>
      getUnchangedFields(
        conflict.localData,
        conflict.remoteData,
        conflict.conflictingFields,
      ),
    [conflict],
  );

  const localDeviceId = conflict.localData.lastDeviceId
    ? String(conflict.localData.lastDeviceId)
    : "This device";
  const remoteDeviceId = conflict.remoteData.lastDeviceId
    ? String(conflict.remoteData.lastDeviceId)
    : "Other device";
  const localUpdated = conflict.localData.updatedAt as string | undefined;
  const remoteUpdated = conflict.remoteData.updatedAt as string | undefined;

  // ── Resolution handlers ─────────────────────────────────────────────────

  const handleKeepMine = async () => {
    setIsResolving(true);
    try {
      await resolveConflict(conflict.id, "resolved_local");
      onClose();
    } finally {
      setIsResolving(false);
    }
  };

  const handleKeepTheirs = async () => {
    setIsResolving(true);
    try {
      await resolveConflict(conflict.id, "resolved_remote");
      onClose();
    } finally {
      setIsResolving(false);
    }
  };

  const handleSaveMerged = async () => {
    setIsResolving(true);
    try {
      // Build merged data: start from local, override with per-field picks
      const merged: Partial<LogEntry> = {};

      for (const field of conflict.conflictingFields) {
        const res = fieldResolutions[field] ?? "local";
        if (res === "local") {
          (merged as Record<string, unknown>)[field] =
            conflict.localData[field];
        } else if (res === "remote") {
          (merged as Record<string, unknown>)[field] =
            conflict.remoteData[field];
        } else if (res === "merged") {
          (merged as Record<string, unknown>)[field] =
            mergedValues[field] ?? conflict.localData[field];
        }
      }

      await resolveConflict(conflict.id, "resolved_merged", merged);
      onClose();
    } finally {
      setIsResolving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-void-black/80 animate-in fade-in"
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-deep-space shadow-2xl animate-in zoom-in-95"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-modal-title"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div className="space-y-1">
            <h2
              id="conflict-modal-title"
              className="text-lg font-bold text-white"
            >
              Resolve Sync Conflict
            </h2>
            <p className="text-sm text-gray-400">
              {formatQsoHeader(conflict.localData)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Device info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-nebula-blue/30 bg-nebula-blue/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-nebula-blue">
                This Device
              </p>
              <p className="mt-1 truncate text-sm text-gray-300">
                {localDeviceId}
              </p>
              <p className="text-xs text-gray-500">
                {relativeTime(localUpdated)}
              </p>
            </div>
            <div className="rounded-xl border border-plasma-orange/30 bg-plasma-orange/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-plasma-orange">
                Other Device
              </p>
              <p className="mt-1 truncate text-sm text-gray-300">
                {remoteDeviceId}
              </p>
              <p className="text-xs text-gray-500">
                {relativeTime(remoteUpdated)}
              </p>
            </div>
          </div>

          {/* Conflicting fields */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Conflicting Fields
              <span className="ml-2 text-xs font-normal text-gray-500">
                ({conflict.conflictingFields.length})
              </span>
            </h3>

            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              {conflict.conflictingFields.map((field) => (
                <ConflictFieldRow
                  key={field}
                  field={field}
                  label={FIELD_LABELS[field]}
                  localValue={conflict.localData[field]}
                  remoteValue={conflict.remoteData[field]}
                  resolution={fieldResolutions[field] ?? "local"}
                  onResolve={(res) =>
                    setFieldResolutions((prev) => ({
                      ...prev,
                      [field]: res,
                    }))
                  }
                  mergedValue={mergedValues[field]}
                  onMergedValueChange={(val) =>
                    setMergedValues((prev) => ({ ...prev, [field]: val }))
                  }
                />
              ))}
            </div>
          </div>

          {/* Unchanged fields (collapsible) */}
          {unchangedFields.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setUnchangedExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-sm font-semibold text-gray-400 transition-colors hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 transition-transform ${unchangedExpanded ? "rotate-90" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Unchanged Fields
                <span className="text-xs font-normal text-gray-500">
                  ({unchangedFields.length})
                </span>
              </button>

              {unchangedExpanded && (
                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {unchangedFields.map(({ field, value }) => (
                      <div key={field} className="flex items-baseline gap-2">
                        <span className="text-xs text-gray-500">
                          {FIELD_LABELS[field] ?? field}:
                        </span>
                        <span className="truncate font-mono text-xs text-gray-300">
                          {displayValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer: resolution buttons ──────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            disabled={isResolving}
            onClick={handleKeepMine}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Keep Mine
          </button>
          <button
            type="button"
            disabled={isResolving}
            onClick={handleKeepTheirs}
            className="rounded-lg border border-plasma-orange/30 bg-plasma-orange/20 px-4 py-2 text-sm font-medium text-plasma-orange transition-colors hover:bg-plasma-orange/30 disabled:opacity-50"
          >
            Keep Theirs
          </button>
          <button
            type="button"
            disabled={isResolving}
            onClick={handleSaveMerged}
            className="rounded-lg border border-signal-green/30 bg-signal-green/20 px-4 py-2 text-sm font-medium text-signal-green transition-colors hover:bg-signal-green/30 disabled:opacity-50"
          >
            Save Merged
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
