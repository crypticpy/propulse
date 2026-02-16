/**
 * DspBadge — Small DSP status/toggle badge (NB, NR, AGC, ANF, etc.).
 *
 * Pure presentational component. Renders as a `<button>` when onClick
 * is provided, otherwise a non-interactive `<span>`. Supports active
 * glow, placeholder (grayed-out) state, and customizable accent color.
 */

// ─── Props ───────────────────────────────────────────────────────────────────

export interface DspBadgeProps {
  /** Badge label text (e.g. "NB", "NR", "AGC"). */
  label: string;
  /** Whether the DSP function is active. */
  active: boolean;
  /** Click handler. When provided, renders as interactive button. */
  onClick?: () => void;
  /** Badge size. Default "sm". */
  size?: "xs" | "sm";
  /** Tailwind color name for active state. Default "signal-green". */
  activeColor?: string;
  /** Grayed-out, non-interactive placeholder (e.g. ANF not yet available). */
  placeholder?: boolean;
}

// ─── Size mapping ────────────────────────────────────────────────────────────

const SIZE_CLASSES = {
  xs: "px-0.5 py-0 text-[8px] leading-[14px]",
  sm: "px-1 py-0 text-[9px] leading-[16px]",
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function DspBadge({
  label,
  active,
  onClick,
  size = "sm",
  activeColor = "signal-green",
  placeholder = false,
}: DspBadgeProps) {
  const sizeClass = SIZE_CLASSES[size];

  // Placeholder: extra dim, non-interactive
  if (placeholder) {
    return (
      <span
        className={`${sizeClass} rounded font-bold font-mono border opacity-30 border-white/5 bg-white/[0.02] text-gray-600`}
        title="Not yet available"
      >
        {label}
      </span>
    );
  }

  const stateClass = active
    ? `bg-${activeColor}/20 text-${activeColor} border-${activeColor}/30 shadow-[0_0_6px_rgba(0,255,136,0.15)]`
    : "text-gray-600 bg-white/5 border-white/10";

  const base = `${sizeClass} rounded font-bold font-mono border ${stateClass}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} cursor-pointer hover:brightness-125 active:scale-95 transition-all`}
        title={`Toggle ${label}`}
      >
        {label}
      </button>
    );
  }

  return <span className={base}>{label}</span>;
}
