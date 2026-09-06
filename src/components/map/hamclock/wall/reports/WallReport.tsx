import {
  cloneElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { create } from "zustand";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";

/** State colour of a report: drives the top bar, the hero and the verdict. */
export type WallReportTone = "good" | "warn" | "bad" | "info" | "accent";

const TONE_CLASS: Record<WallReportTone, string> = {
  good: "hc-good",
  warn: "hc-warn",
  bad: "hc-bad",
  info: "hc-info-text",
  accent: "hc-accent-text",
};

const TONE_STATE: Record<WallReportTone, string> = {
  good: "var(--hc-good)",
  warn: "var(--hc-warn)",
  bad: "var(--hc-bad)",
  info: "var(--hc-info)",
  accent: "var(--hc-accent)",
};

export interface WallReportFact {
  label: string;
  value: ReactNode;
}

export interface WallReportProps {
  open: boolean;
  onClose: () => void;
  /** Letter-spaced head line, e.g. "Solar report · space weather". */
  title: string;
  tone?: WallReportTone;
  /** The one number worth reading from ten feet. */
  hero: ReactNode;
  /** The one word beside it: QUIET, STORM, DAY, ALL CLEAR… */
  verdict?: ReactNode;
  /** Right-hand column of the lead row; `—` values are fine, gaps are not. */
  facts?: WallReportFact[];
  /** Left side of the foot: where the numbers came from. */
  footer?: string;
  /** Right side of the foot: when they were read. */
  updated?: string;
  children?: ReactNode;
  /**
   * A stable id for this report instance (e.g. "solar-kp") plus the fully
   * rendered element that opened it. Supplying both turns on the PIN
   * control (HW-30); a report without an id/element keeps the old
   * close-only chrome.
   */
  pinId?: string;
  pinElement?: ReactElement;
}

/**
 * Session-only pin state (HW-30): not persisted, one report pinned at a
 * time. Pinning stores the *already-rendered* report element (with its
 * onClose swapped for `unpin`) and hands it to `HamClockPinnedReportHost`,
 * mounted once in `HamClockWallHeader` — a location that survives page
 * steps and kiosk scene changes because the rails only mount the current
 * page's tiles (`HamClockRail`unmounts a report's owning tile on
 * navigation, which is exactly what pinning must survive).
 */
interface PinState {
  id: string | null;
  element: ReactElement | null;
  pin: (id: string, element: ReactElement) => void;
  unpin: () => void;
}

const usePinnedReportStore = create<PinState>((set) => ({
  id: null,
  element: null,
  pin: (id, element) => set({ id, element }),
  unpin: () => set({ id: null, element: null }),
}));

/** Mount once, outside the paged rails (e.g. `HamClockWallHeader`), so a
 * pinned report keeps rendering while the tile that opened it unmounts. */
export function HamClockPinnedReportHost() {
  const element = usePinnedReportStore((s) => s.element);
  return element ?? null;
}

function PinButton({
  id,
  element,
  onClose,
}: {
  id: string;
  element: ReactElement;
  onClose: () => void;
}) {
  const pinnedId = usePinnedReportStore((s) => s.id);
  const pin = usePinnedReportStore((s) => s.pin);
  const unpin = usePinnedReportStore((s) => s.unpin);
  const isPinned = pinnedId === id;

  return (
    <button
      type="button"
      className="hcr-pin"
      aria-pressed={isPinned}
      onClick={() => {
        if (isPinned) {
          unpin();
        } else {
          pin(id, cloneElement(element, { onClose: unpin }));
        }
        // Either action supersedes this instance: pinning hands off to the
        // header host, unpinning should close the dialog outright.
        onClose();
      }}
    >
      {isPinned ? "UNPIN" : "PIN"}
    </button>
  );
}

/**
 * The wall's drill-down: one centred glass panel with a huge hero, a verdict,
 * a facts column and a body region. Every report on the wall is this shell
 * with different content, so the composition an operator learns on one tile
 * carries to all of them.
 *
 * Dialog mechanics (Escape, focus trap, focus restore, inert background) come
 * from `AccessibleDialog`, the same primitive `DetailModal` uses — the report
 * only replaces the chrome, so the wall's arrow-key pager keeps standing down
 * while a report is open.
 */
export function WallReport({
  open,
  onClose,
  title,
  tone = "info",
  hero,
  verdict,
  facts,
  footer,
  updated,
  children,
  pinId,
  pinElement,
}: WallReportProps) {
  const theme = useHamClockDisplayStore((s) => s.theme);
  const toneClass = TONE_CLASS[tone];

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title={title}
      chrome="bare"
      zIndexClassName="z-[350]"
      panelProps={{
        className: "hcr",
        // The panel is portalled outside the HamClock subtree, so it carries
        // the theme attribute itself rather than inheriting it.
        "data-hamclock-theme": theme,
        style: { "--hcr-state": TONE_STATE[tone] } as CSSProperties,
      }}
    >
      <div className="hcr-head">
        {/* AccessibleDialog owns the accessible name in a hidden heading, so
            the drawn title is decoration and must not be read twice. */}
        <p className="hcr-title" aria-hidden="true">
          {title}
        </p>
        {pinId && pinElement && (
          <PinButton id={pinId} element={pinElement} onClose={onClose} />
        )}
        <button type="button" className="hcr-close" onClick={onClose}>
          ESC · CLOSE
        </button>
      </div>

      <div className="hcr-lead">
        <div className="hcr-headline">
          <div className={`hcr-hero hc-glow ${toneClass}`}>{hero}</div>
          <div className={`hcr-verdict hc-glow ${toneClass}`}>{verdict}</div>
        </div>
        <div className="hcr-facts">
          {facts?.map((fact) => (
            <div key={fact.label}>
              {fact.label}
              <b>{fact.value}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="hcr-body">{children}</div>

      <div className="hcr-foot">
        <span>{footer}</span>
        <span>{updated}</span>
      </div>
    </AccessibleDialog>
  );
}
