import type { ReactNode } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";

export interface HamClockDialogProps {
  open: boolean;
  onClose: () => void;
  /** ALL CAPS letter-spaced head, e.g. "SETTINGS" or "NEWS FEEDS". */
  title: string;
  /** One-line plain-language purpose under the title. */
  purpose?: string;
  /** "settings" is ≤70vw × ≤80vh; "config" is report size (58vw × 72vh). */
  size?: "settings" | "config";
  /** Right side of the foot: primary/secondary actions (`HamClockButton`). */
  actions?: ReactNode;
  /** Left side of the foot: a hint line such as "SELECT to apply · BACK to cancel". */
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * The centered shell every settings panel and widget configuration dialog on
 * the wall shares. Reports keep using `WallReport` — this is its sibling for
 * panels that are not reading a live feed. Built on `AccessibleDialog` the
 * same way `WallReport` is, so Escape, the focus trap, focus restore and the
 * inert background all come for free instead of being reimplemented per
 * dialog. The body never scrolls: content that does not fit is content that
 * belongs on another tab, not under a scrollbar.
 */
export function HamClockDialog({
  open,
  onClose,
  title,
  purpose,
  size = "config",
  actions,
  hint,
  children,
}: HamClockDialogProps) {
  const theme = useHamClockDisplayStore((s) => s.theme);

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title={title}
      description={purpose}
      chrome="bare"
      zIndexClassName="z-[350]"
      panelProps={{
        className: `hcc-dialog hcc-dialog--${size}`,
        // The panel is portalled outside the HamClock subtree, so it carries
        // the theme attribute itself rather than inheriting it.
        "data-hamclock-theme": theme,
      }}
    >
      <div className="hcc-dialog-head">
        <div className="hcc-dialog-head-text">
          {/* AccessibleDialog owns the accessible name in a hidden heading,
              so the drawn title is decoration and must not be read twice. */}
          <p className="hcc-dialog-title" aria-hidden="true">
            {title}
          </p>
          {/* AccessibleDialog already wires `purpose` up as the dialog's
              accessible description (aria-describedby); this is the same
              text drawn visibly, so it must not be read a second time. */}
          {purpose && (
            <p className="hcc-dialog-purpose" aria-hidden="true">
              {purpose}
            </p>
          )}
        </div>
        <button type="button" className="hcc-dialog-close" onClick={onClose}>
          ESC · CLOSE
        </button>
      </div>
      <div className="hcc-dialog-body">{children}</div>
      {(hint || actions) && (
        <div className="hcc-dialog-foot">
          <span className="hcc-dialog-hint">{hint}</span>
          <div className="hcc-dialog-actions">{actions}</div>
        </div>
      )}
    </AccessibleDialog>
  );
}
