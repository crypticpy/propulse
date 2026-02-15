/**
 * QslStatusIcons — Shared icon set for QSL confirmation status display
 *
 * Shows small colored letter badges for LoTW, eQSL, ClubLog, and QRZ.com
 * confirmation status. Each badge indicates sent/received/pending state.
 *
 * Status encoding:
 *   - Green filled: Confirmed (received)
 *   - Yellow outline: Sent (awaiting confirmation)
 *   - Gray: Not submitted
 */

import type { LogEntry } from "@/lib/db/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface QslService {
  /** Short label shown in the badge */
  label: string;
  /** Human-readable service name for tooltip */
  name: string;
  /** Whether the QSO has been confirmed (received) via this service */
  confirmed: boolean;
  /** Whether the QSO has been sent to this service */
  sent: boolean;
}

interface QslStatusIconsProps {
  entry: LogEntry;
  /** Size variant */
  size?: "sm" | "md";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLotwStatus(entry: LogEntry): QslService {
  const confirmed =
    entry.lotwQslRcvd === "Y" ||
    (entry.lotw === true && entry.lotwQslRcvd !== "N");
  const sent = entry.lotwQslSent === "Y" || entry.lotw === true;

  return {
    label: "L",
    name: "LoTW",
    confirmed,
    sent,
  };
}

function getEqslStatus(entry: LogEntry): QslService {
  return {
    label: "E",
    name: "eQSL",
    confirmed: entry.eqsl === true,
    sent: entry.eqsl === true, // eQSL doesn't have a separate sent field
  };
}

function getClublogStatus(entry: LogEntry): QslService {
  return {
    label: "C",
    name: "ClubLog",
    confirmed: entry.clublogStatus === "Y",
    sent: entry.clublogStatus === "Y" || entry.clublogStatus === "U",
  };
}

function getQrzStatus(entry: LogEntry): QslService {
  return {
    label: "Q",
    name: "QRZ.com",
    confirmed: entry.qrzcomStatus === "Y",
    sent: entry.qrzcomStatus === "Y" || entry.qrzcomStatus === "U",
  };
}

// ── Badge Component ─────────────────────────────────────────────────────────

function QslBadge({
  service,
  size,
}: {
  service: QslService;
  size: "sm" | "md";
}) {
  const sizeClasses =
    size === "sm" ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]";

  if (service.confirmed) {
    // Green filled: confirmed
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm font-mono font-bold ${sizeClasses} bg-signal-green/25 text-signal-green border border-signal-green/40`}
        title={`${service.name}: Confirmed`}
        aria-label={`${service.name} confirmed`}
      >
        {service.label}
      </span>
    );
  }

  if (service.sent) {
    // Yellow outline: sent, awaiting confirmation
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm font-mono font-bold ${sizeClasses} bg-caution-yellow/10 text-caution-yellow/80 border border-caution-yellow/30`}
        title={`${service.name}: Sent (pending)`}
        aria-label={`${service.name} sent, pending confirmation`}
      >
        {service.label}
      </span>
    );
  }

  // Gray: not submitted
  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm font-mono font-bold ${sizeClasses} bg-white/[0.03] text-gray-600 border border-white/[0.06]`}
      title={`${service.name}: Not submitted`}
      aria-label={`${service.name} not submitted`}
    >
      {service.label}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * Displays QSL confirmation status as a row of small letter badges.
 *
 * Usage:
 * ```tsx
 * <QslStatusIcons entry={logEntry} size="sm" />
 * ```
 */
export function QslStatusIcons({ entry, size = "sm" }: QslStatusIconsProps) {
  const services: QslService[] = [
    getLotwStatus(entry),
    getEqslStatus(entry),
    getClublogStatus(entry),
    getQrzStatus(entry),
  ];

  return (
    <span className="inline-flex items-center gap-0.5">
      {services.map((svc) => (
        <QslBadge key={svc.label} service={svc} size={size} />
      ))}
    </span>
  );
}
