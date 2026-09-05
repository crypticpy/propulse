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
 * spec §4/§5), so the pager announces "wall page" rather than a rail side —
 * there is one instance of this control at each end of the footer, but they
 * both step the same page and both toggle the same `autoPage.enabled` flag
 * (HW-20, `useWallAutoPage`).
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
  const page = pages[index];
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
      <b>{(page?.title ?? "").toUpperCase()}</b>
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
