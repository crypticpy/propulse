/**
 * OnAirBadge — Shared status indicator for On Air / Listening / Offline.
 *
 * Renders a colored dot (with optional label at md size) representing
 * the operator's current on-air state.  A pulsing glow animation is
 * applied when the operator is actively transmitting.
 *
 * Respects the `expiresAt` timestamp — if the status has expired the
 * badge automatically falls back to the offline presentation.
 */

import type { OnAirStatus, OnAirState } from "@/types/social";

interface OnAirBadgeProps {
  status: OnAirStatus | null | undefined;
  size?: "sm" | "md";
}

/** Resolve effective state, treating expired statuses as offline. */
function resolveState(status: OnAirStatus | null | undefined): OnAirState {
  if (!status) return "offline";
  if (status.expiresAt && new Date(status.expiresAt).getTime() <= Date.now()) {
    return "offline";
  }
  return status.status;
}

/** Build a tooltip string from the status details. */
function buildTooltip(status: OnAirStatus | null | undefined): string {
  if (!status) return "Offline";
  const state = resolveState(status);
  if (state === "offline") return "Offline";

  const parts: string[] = [state === "on_air" ? "ON AIR" : "LISTENING"];
  if (status.band) parts.push(status.band);
  if (status.mode) parts.push(status.mode);
  if (status.frequency) parts.push(`${status.frequency} MHz`);
  if (status.notes) parts.push(`— ${status.notes}`);
  return parts.join(" · ");
}

const DOT_CONFIG: Record<
  OnAirState,
  { bg: string; text: string; label: string; pulse: boolean; glow: string }
> = {
  on_air: {
    bg: "bg-emerald-500",
    text: "text-emerald-400",
    label: "ON AIR",
    pulse: true,
    glow: "shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  },
  listening: {
    bg: "bg-blue-500",
    text: "text-blue-400",
    label: "LISTENING",
    pulse: false,
    glow: "",
  },
  offline: {
    bg: "bg-gray-600",
    text: "text-gray-500",
    label: "OFFLINE",
    pulse: false,
    glow: "",
  },
};

export function OnAirBadge({ status, size = "sm" }: OnAirBadgeProps) {
  const state = resolveState(status);
  const config = DOT_CONFIG[state];
  const tooltip = buildTooltip(status);

  const dotSize = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  return (
    <div className="inline-flex items-center gap-1.5" title={tooltip}>
      {/* Status dot */}
      <span
        className={[
          "rounded-full shrink-0",
          dotSize,
          config.bg,
          config.pulse ? "animate-pulse" : "",
          config.glow,
        ]
          .filter(Boolean)
          .join(" ")}
      />

      {/* Label (md only) */}
      {size === "md" && (
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${config.text}`}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}
