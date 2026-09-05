import { HAMCLOCK_WALL_PAGES, wallPageIndex } from "./pages";

interface HamClockPagerProps {
  pageIndex: number;
  onStep: (delta: number) => void;
}

/**
 * Footer pager: ◀ TITLE n/N ▶. Both rails follow one shared page (wall spec
 * §4/§5), so the pager announces "wall page" rather than a rail side — there
 * is one instance of this control at each end of the footer, but they both
 * step the same page.
 */
export function HamClockPager({ pageIndex, onStep }: HamClockPagerProps) {
  const index = wallPageIndex(pageIndex);
  const page = HAMCLOCK_WALL_PAGES[index];
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
      <b>{page.title.toUpperCase()}</b>
      <span className="hc-pager-n">
        {index + 1} / {HAMCLOCK_WALL_PAGES.length}
      </span>
      <button
        type="button"
        className="hc-pager-arrow"
        aria-label="Next wall page"
        onClick={() => onStep(1)}
      >
        ▶
      </button>
    </div>
  );
}
