import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";

/**
 * Lets a nested cancelable sub-view (the Map tab's style chooser, B6 PR #222
 * fix #2) register a guard that runs before Escape closes the whole dialog.
 * A context instead of a prop because the sub-view is several layers below
 * `HamClockDialog` (through `HamClockTabs` and the tab's own content) with no
 * prop path between them; only one guard is expected at a time since only
 * one cancelable sub-view is ever open.
 */
const HamClockDialogEscapeGuardContext = createContext<
  ((guard: (() => boolean) | null) => void) | null
>(null);

/**
 * Registers `guard` to run before Escape closes the enclosing `HamClockDialog`.
 * Returning `true` from `guard` cancels the sub-view instead (the caller is
 * expected to do that itself) and skips the dialog close. Pass `null` while
 * the sub-view is not open; the hook also clears the guard on unmount.
 */
export function useHamClockDialogEscapeGuard(guard: (() => boolean) | null) {
  const setGuard = useContext(HamClockDialogEscapeGuardContext);
  useEffect(() => {
    if (!setGuard) return;
    setGuard(guard);
    return () => setGuard(null);
  }, [setGuard, guard]);
}

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
  const guardRef = useRef<(() => boolean) | null>(null);
  const setGuard = useCallback((guard: (() => boolean) | null) => {
    guardRef.current = guard;
  }, []);
  const handleEscape = useCallback(() => guardRef.current?.() ?? false, []);

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      onEscape={handleEscape}
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
      <HamClockDialogEscapeGuardContext.Provider value={setGuard}>
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
      </HamClockDialogEscapeGuardContext.Provider>
    </AccessibleDialog>
  );
}
