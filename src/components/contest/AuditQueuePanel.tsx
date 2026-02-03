/**
 * AuditQueuePanel - Contest QSO Quality Control Display
 *
 * Displays flagged QSOs that need operator review, with severity levels
 * and one-click navigation to edit the problematic QSO.
 *
 * Phase 4C.1 - Contest Mode Quality Control
 */

import { useMemo, useCallback } from "react";
import { Card } from "@/components/ui";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";
import {
  getAuditQueue,
  getAuditSummary,
  type FlaggedQSO,
  type AuditFlag,
  type AuditSeverity,
} from "@/lib/contest/audit";

// ============================================================================
// Types
// ============================================================================

export interface AuditQueuePanelProps {
  /** Maximum number of flagged QSOs to display (default: 10) */
  maxItems?: number;
  /** Callback when a QSO is selected for editing */
  onEditQSO?: (qso: ContestQSO) => void;
  /** Whether to show only errors (hide warnings/info) */
  errorsOnly?: boolean;
  /** Optional class name for styling */
  className?: string;
}

// ============================================================================
// Subcomponents
// ============================================================================

/**
 * Severity badge component
 */
function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const config = {
    error: {
      bg: "bg-alert-red/20",
      border: "border-alert-red/30",
      text: "text-alert-red",
      label: "Error",
    },
    warning: {
      bg: "bg-caution-amber/20",
      border: "border-caution-amber/30",
      text: "text-caution-amber",
      label: "Warning",
    },
    info: {
      bg: "bg-cosmic-cyan/20",
      border: "border-cosmic-cyan/30",
      text: "text-cosmic-cyan",
      label: "Info",
    },
  };

  const c = config[severity];

  return (
    <span
      className={`
        px-1.5 py-0.5 text-[10px] font-bold uppercase
        rounded border ${c.bg} ${c.border} ${c.text}
      `}
    >
      {c.label}
    </span>
  );
}

/**
 * Individual audit flag display
 */
function AuditFlagItem({ flag }: { flag: AuditFlag }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <SeverityBadge severity={flag.severity} />
      <span className="text-gray-300">{flag.message}</span>
      {flag.actual && (
        <span className="text-gray-500 font-mono">({flag.actual})</span>
      )}
    </div>
  );
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toISOString().slice(11, 16).replace(":", "");
}

/**
 * Flagged QSO row component
 */
function FlaggedQSORow({
  flaggedQso,
  onEdit,
}: {
  flaggedQso: FlaggedQSO;
  onEdit?: (qso: ContestQSO) => void;
}) {
  const { qso, flags, maxSeverity, severityCounts } = flaggedQso;

  const handleClick = useCallback(() => {
    if (onEdit) {
      onEdit(qso);
    }
  }, [onEdit, qso]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (onEdit) {
          onEdit(qso);
        }
      }
    },
    [onEdit, qso],
  );

  // Determine row border color based on max severity
  const borderColor = {
    error: "border-l-alert-red",
    warning: "border-l-caution-amber",
    info: "border-l-cosmic-cyan",
  }[maxSeverity];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        p-3 bg-white/5 rounded-lg border-l-4 ${borderColor}
        hover:bg-white/10 cursor-pointer transition-colors
        focus:outline-none focus:ring-2 focus:ring-plasma-orange/50
      `}
    >
      {/* QSO Info Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs font-mono">
            {formatTime(qso.timestamp)}
          </span>
          <span className="text-white font-bold font-mono">{qso.callsign}</span>
          <span className="text-gray-400 text-sm font-mono">
            {qso.exchangeReceived}
          </span>
          <span className="text-cosmic-cyan text-xs">{qso.band}</span>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-1">
          {severityCounts.error > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-alert-red/20 text-alert-red rounded">
              {severityCounts.error}
            </span>
          )}
          {severityCounts.warning > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-caution-amber/20 text-caution-amber rounded">
              {severityCounts.warning}
            </span>
          )}
          {severityCounts.info > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-cosmic-cyan/20 text-cosmic-cyan rounded">
              {severityCounts.info}
            </span>
          )}
        </div>
      </div>

      {/* Flags List */}
      <div className="space-y-1.5">
        {flags.slice(0, 3).map((flag) => (
          <AuditFlagItem key={flag.id} flag={flag} />
        ))}
        {flags.length > 3 && (
          <span className="text-xs text-gray-500">
            +{flags.length - 3} more issues
          </span>
        )}
      </div>

      {/* Edit hint */}
      <div className="mt-2 text-[10px] text-gray-500 flex items-center gap-1">
        <kbd className="px-1 py-0.5 bg-white/10 rounded">Enter</kbd>
        <span>or click to edit</span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * AuditQueuePanel - Displays flagged QSOs for operator review
 *
 * Features:
 * - Lists QSOs with audit flags sorted by severity
 * - Shows error/warning/info counts
 * - Click to edit problematic QSOs
 * - Compact display for contest operation
 *
 * @example
 * ```tsx
 * <AuditQueuePanel
 *   onEditQSO={(qso) => openEditModal(qso)}
 *   maxItems={5}
 * />
 * ```
 */
export function AuditQueuePanel({
  maxItems = 10,
  onEditQSO,
  errorsOnly = false,
  className = "",
}: AuditQueuePanelProps) {
  // Narrow selectors
  const session = useContestStore((s) => s.activeSession);

  // Get contest definition
  const contestDef = useMemo(() => {
    if (!session) return null;
    return getContestById(session.contestId) ?? null;
  }, [session]);

  // Get audit queue
  const auditQueue = useMemo(() => {
    const queue = getAuditQueue(session, contestDef);
    if (errorsOnly) {
      return queue.filter((fq) => fq.maxSeverity === "error");
    }
    return queue;
  }, [session, contestDef, errorsOnly]);

  // Get summary counts
  const summary = useMemo(() => {
    return getAuditSummary(session, contestDef);
  }, [session, contestDef]);

  // Limited items for display
  const displayItems = useMemo(() => {
    return auditQueue.slice(0, maxItems);
  }, [auditQueue, maxItems]);

  // No session state
  if (!session) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="text-center text-gray-500 text-sm">
          No active contest session
        </div>
      </Card>
    );
  }

  // Empty queue state
  if (auditQueue.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-orbitron text-sm font-bold text-white">
            QC Audit Queue
          </h3>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span className="text-xs text-signal-green">All Clear</span>
          </div>
        </div>
        <div className="text-center py-6 text-gray-500 text-sm">
          No issues detected - great logging!
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-orbitron text-sm font-bold text-white">
          QC Audit Queue
        </h3>

        {/* Summary counts */}
        <div className="flex items-center gap-2 text-xs">
          {summary.errors > 0 && (
            <span className="flex items-center gap-1 text-alert-red">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {summary.errors}
            </span>
          )}
          {summary.warnings > 0 && (
            <span className="flex items-center gap-1 text-caution-amber">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              {summary.warnings}
            </span>
          )}
          {summary.info > 0 && (
            <span className="flex items-center gap-1 text-cosmic-cyan">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              {summary.info}
            </span>
          )}
          <span className="text-gray-500 ml-1">
            ({auditQueue.length} QSO{auditQueue.length !== 1 ? "s" : ""})
          </span>
        </div>
      </div>

      {/* Flagged QSOs List */}
      <div className="space-y-2">
        {displayItems.map((flaggedQso) => (
          <FlaggedQSORow
            key={flaggedQso.qso.id}
            flaggedQso={flaggedQso}
            onEdit={onEditQSO}
          />
        ))}
      </div>

      {/* Show more indicator */}
      {auditQueue.length > maxItems && (
        <div className="mt-3 text-center text-xs text-gray-500">
          +{auditQueue.length - maxItems} more flagged QSOs
        </div>
      )}

      {/* Keyboard hint */}
      <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-gray-500">
        Click a QSO to open edit dialog
      </div>
    </Card>
  );
}

export default AuditQueuePanel;
