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

// ─── Active color mapping ────────────────────────────────────────────────────
// Static (non-interpolated) classes so Tailwind's JIT can see every variant.
// The glow shadow follows the active color rather than being fixed to green.

const DEFAULT_ACTIVE_CLASS =
  "bg-signal-green/20 text-signal-green border-signal-green/30 shadow-[0_0_6px_rgba(0,255,136,0.15)]";

const ACTIVE_CLASSES: Record<string, string> = {
  "signal-green": DEFAULT_ACTIVE_CLASS,
  "cosmic-cyan":
    "bg-cosmic-cyan/20 text-cosmic-cyan border-cosmic-cyan/30 shadow-[0_0_6px_rgba(68,221,255,0.15)]",
  "plasma-orange":
    "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30 shadow-[0_0_6px_rgba(255,107,53,0.15)]",
  "caution-amber":
    "bg-caution-amber/20 text-caution-amber border-caution-amber/30 shadow-[0_0_6px_rgba(255,210,63,0.15)]",
  "alert-red":
    "bg-alert-red/20 text-alert-red border-alert-red/30 shadow-[0_0_6px_rgba(255,68,85,0.15)]",
};

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
    ? (ACTIVE_CLASSES[activeColor] ?? DEFAULT_ACTIVE_CLASS)
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
