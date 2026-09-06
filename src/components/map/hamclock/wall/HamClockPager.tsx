import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";

interface WallPagerPage {
  id: string;
  title: string;
}

interface HamClockPagerProps {
  /** The pages the active `railLayout` actually cycles through
   * (`wallPages(railLayout)`, in the store) — a preset with one page shows
   * "1 / 1" here, not a fixed five (review pass after B4). */
  pages: readonly WallPagerPage[];
  pageIndex: number;
  onStep: (delta: number) => void;
}

/**
 * Footer pager: ◀ TITLE n/N ▶ AUTO. Both rails follow one shared page (wall
 * spec §4/§5), so the pager announces "wall page" rather than a rail side.
 * It sits once, at the footer's left end (the right end carries the health
 * strip), and toggles the shared `autoPage.enabled` flag (HW-20,
 * `useWallAutoPage`).
 *
 * The title slot renders every page title stacked in one grid cell with
 * only the active one visible, so the control is always as wide as its
 * longest title: the arrows and AUTO toggle never move as the page changes
 * (owner rule 2026-09-06 — a control that shifts under the pointer is a bad
 * TV-distance experience).
 */
export function HamClockPager({
  pages,
  pageIndex,
  onStep,
}: HamClockPagerProps) {
  const autoPage = useHamClockDisplayStore((s) => s.autoPage);
  const setAutoPage = useHamClockDisplayStore((s) => s.setAutoPage);
  const autoPageEnabled = autoPage.enabled;
  const index = Math.min(Math.max(pageIndex, 0), Math.max(pages.length - 1, 0));
  return (
    <div className="hc-pager">
      <button
        type="button"
        className="hc-pager-arrow"
        aria-label="Previous wall page"
        onClick={() => onStep(-1)}
      >
        ◀
      </button>
      <b className="hc-pager-title">
        {pages.map((candidate, i) => (
          <span
            key={candidate.id}
            data-active={i === index ? "true" : "false"}
            aria-hidden={i === index ? undefined : true}
          >
            {candidate.title.toUpperCase()}
          </span>
        ))}
      </b>
      <span className="hc-pager-n">
        {pages.length > 0 ? index + 1 : 0} / {pages.length}
      </span>
      <button
        type="button"
        className="hc-pager-arrow"
        aria-label="Next wall page"
        onClick={() => onStep(1)}
      >
        ▶
      </button>
      <button
        type="button"
        className="hcc-toggle hc-pager-auto"
        aria-pressed={autoPageEnabled}
        aria-label="Auto-page rotation"
        data-state={autoPageEnabled ? "on" : "off"}
        onClick={() => setAutoPage({ ...autoPage, enabled: !autoPageEnabled })}
      >
        {autoPageEnabled ? "AUTO ON" : "AUTO OFF"}
      </button>
    </div>
  );
}
