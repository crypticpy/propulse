import type { ReactNode } from "react";
// Reused outside the wall route (matches `TuneButton.tsx`'s use of
// `HamClockButton`): `HamClockDialog`'s chrome and theme variables live in
// these stylesheets, not in a component-local import.
import "@/styles/hamclock-themes.css";
import "@/styles/hamclock-wall-controls.css";
import { HamClockDialog } from "@/components/map/hamclock/wall/controls/HamClockDialog";

export interface CentreOverlayProps {
  open: boolean;
  onClose: () => void;
  /** ALL CAPS letter-spaced head, matching `HamClockDialog`'s convention. */
  title: string;
  purpose?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The workspace's one centred-overlay shell (owner rule: no flyouts, centred
 * overlay only). Every workspace dialog — the widget picker placeholder,
 * PAGES, SETTINGS — goes through this rather than a one-off modal.
 *
 * Wraps `HamClockDialog` (itself `AccessibleDialog`), which already restores
 * focus to whatever triggered `open` once `onClose` fires, traps focus and
 * makes the background inert — nothing extra to wire up here.
 */
export function CentreOverlay({ open, onClose, title, purpose, hint, actions, children }: CentreOverlayProps) {
  return (
    <HamClockDialog open={open} onClose={onClose} title={title} purpose={purpose} size="settings" hint={hint} actions={actions}>
      {children}
    </HamClockDialog>
  );
}
