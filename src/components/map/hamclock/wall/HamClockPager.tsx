import { HAMCLOCK_WALL_PAGES, wallPageIndex } from "./pages";
import type { WallRailSide } from "./pages";

interface HamClockPagerProps {
  side: WallRailSide;
  pageIndex: number;
  onStep: (delta: number) => void;
}

/** Footer pager: ◀ TITLE n/N ▶ for one rail. */
export function HamClockPager({ side, pageIndex, onStep }: HamClockPagerProps) {
  const index = wallPageIndex(pageIndex);
  const page = HAMCLOCK_WALL_PAGES[index];
  const sideLabel = side === "left" ? "left" : "right";
  return (
    <div className="hc-pager">
      <button
        type="button"
        className="hc-pager-arrow"
        aria-label={`Previous ${sideLabel} rail page`}
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
        aria-label={`Next ${sideLabel} rail page`}
        onClick={() => onStep(1)}
      >
        ▶
      </button>
    </div>
  );
}
