import type { CSSProperties, ReactNode } from "react";
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
        <button type="button" className="hcr-close" onClick={onClose}>
          ESC · CLOSE
        </button>
      </div>

      <div className="hcr-lead">
        <div className={`hcr-hero hc-glow ${toneClass}`}>{hero}</div>
        <div className={`hcr-verdict hc-glow ${toneClass}`}>{verdict}</div>
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
