/**
 * RadioBadge — Small badge for antenna, filter width, TX/RX, SPLIT, LOCK, etc.
 *
 * Pure presentational component with variant-based coloring. Renders as
 * `<button>` when onClick is provided, otherwise `<span>`. Supports
 * optional icon.
 */

import type { ReactNode } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface RadioBadgeProps {
  /** Badge label text (e.g. "TX", "RX", "ANT1", "SPLIT"). */
  label: string;
  /** Color variant. Default "default". */
  variant?: "default" | "danger" | "success" | "warning" | "accent";
  /** Optional icon rendered before the label. */
  icon?: ReactNode;
  /** Click handler. When provided, renders as interactive button. */
  onClick?: () => void;
  /** Badge size. Default "sm". */
  size?: "xs" | "sm";
  /** Additional CSS classes. */
  className?: string;
}

// ─── Variant colors ──────────────────────────────────────────────────────────

const VARIANT_CLASSES = {
  default: "text-su-muted bg-su-line/10 border-su-line/40",
  danger: "text-alert-red bg-alert-red/15 border-alert-red/30",
  success: "text-signal-green bg-signal-green/10 border-signal-green/20",
  warning: "text-caution-amber bg-caution-amber/15 border-caution-amber/30",
  accent: "text-cosmic-cyan bg-cosmic-cyan/15 border-cosmic-cyan/30",
} as const;

// ─── Size mapping ────────────────────────────────────────────────────────────

const SIZE_CLASSES = {
  xs: "px-1 py-0 text-xs leading-[14px]",
  sm: "px-1.5 py-0 text-xs leading-[16px]",
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function RadioBadge({
  label,
  variant = "default",
  icon,
  onClick,
  size = "sm",
  className = "",
}: RadioBadgeProps) {
  const base = `${SIZE_CLASSES[size]} rounded font-bold font-mono border ${VARIANT_CLASSES[variant]} ${className}`;

  const content = (
    <>
      {icon && <span className="mr-0.5 inline-flex items-center">{icon}</span>}
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} cursor-pointer hover:brightness-125 active:scale-95 transition-all`}
        title={label}
      >
        {content}
      </button>
    );
  }

  return <span className={base}>{content}</span>;
}
