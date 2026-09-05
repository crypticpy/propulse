import type { ButtonHTMLAttributes } from "react";

export interface HamClockButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  /** `primary` is the one action a dialog wants taken, `danger` is destructive, `quiet` is everything else. */
  variant?: "primary" | "quiet" | "danger";
  /** Dims the label and disables the button. No spinner — a wall reader can't act on a busy state faster by watching it animate. */
  busy?: boolean;
  /** `lg` is a dialog's primary action; `md` is everything else. Both clear the 44px hit-target floor. */
  size?: "md" | "lg";
}

/**
 * The wall's one button shape. Every clickable action — REFRESH, VERIFY, ADD
 * FEED, SAVE — renders through this, so an ALL CAPS label and a 44px-plus
 * target are never something a caller has to remember to add by hand.
 */
export function HamClockButton({
  variant = "quiet",
  busy = false,
  size = "md",
  disabled,
  children,
  ...rest
}: HamClockButtonProps) {
  return (
    <button
      {...rest}
      type="button"
      className={`hcc-btn hcc-btn--${variant} hcc-btn--${size}`}
      aria-busy={busy || undefined}
      disabled={busy || disabled}
    >
      {children}
    </button>
  );
}
