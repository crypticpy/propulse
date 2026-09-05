import { useEffect, type ReactNode } from "react";
import { DXNewsTicker } from "@/components/map/DXNewsTicker";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useDXStore } from "@/stores/dxStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockPager } from "./HamClockPager";
import { HamClockRail } from "./HamClockRail";
import { HamClockWallHeader } from "./HamClockWallHeader";
import { HAMCLOCK_WALL_PAGES } from "./pages";

/** Arrow keys page the rails, but not while the operator is typing or reading
 * a report. */
function shouldIgnoreKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true;
  if (document.querySelector('[role="dialog"]')) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Live feed health for the footer. Reads the spot store the cluster hook
 * already fills, so the footer never opens a second feed. The model dot
 * follows the band-verdict engine that drives the Best band hero. */
function WallStatus() {
  const count = useDXStore((s) => s.spots.length);
  const source = useDXStore((s) => s.spotSource);
  const modelReady = useBandVerdicts().ready;
  return (
    <div className="hc-status">
      <span>
        <i className={count > 0 ? "" : "hc-status-idle"} />
        CLUSTER {count} · {source === "bridge" ? "BRIDGE" : "REST"}
      </span>
      <span>
        <i className={modelReady ? "" : "hc-status-idle"} />
        MODEL {modelReady ? "LIVE" : "WAITING"}
      </span>
    </div>
  );
}

interface HamClockWallProps {
  /** The existing map stage, rendered full-bleed under the rails. */
  children: ReactNode;
}

/**
 * Wall density: a full-bleed map with two translucent tile rails, a callsign
 * header with dual clocks, the existing DX news ticker, and a footer carrying
 * one pager per rail plus the WALL/DESK switch.
 */
export function HamClockWall({ children }: HamClockWallProps) {
  const pageIndex = useHamClockDisplayStore((s) => s.pageIndex);
  const stepPage = useHamClockDisplayStore((s) => s.stepPage);
  const density = useHamClockDisplayStore((s) => s.density);
  const setDensity = useHamClockDisplayStore((s) => s.setDensity);
  const pageCount = HAMCLOCK_WALL_PAGES.length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (shouldIgnoreKey(event)) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      stepPage(event.shiftKey ? "left" : "right", delta, pageCount);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepPage, pageCount]);

  return (
    <div className="hc-wall">
      <HamClockWallHeader />

      <div className="hc-stage">
        {children}
        <HamClockRail
          side="left"
          pageIndex={pageIndex.left}
          label="Left tile rail"
        />
        <HamClockRail
          side="right"
          pageIndex={pageIndex.right}
          label="Right tile rail"
        />
      </div>

      <DXNewsTicker className="rounded-none" />

      <footer className="hc-ftr">
        <HamClockPager
          side="left"
          pageIndex={pageIndex.left}
          onStep={(delta) => stepPage("left", delta, pageCount)}
        />
        <WallStatus />
        <div className="hc-mode" role="group" aria-label="Layout density">
          <button
            type="button"
            aria-pressed={density === "wall"}
            onClick={() => setDensity("wall")}
          >
            WALL
          </button>
          <button
            type="button"
            aria-pressed={density === "desk"}
            onClick={() => setDensity("desk")}
          >
            DESK
          </button>
        </div>
        <HamClockPager
          side="right"
          pageIndex={pageIndex.right}
          onStep={(delta) => stepPage("right", delta, pageCount)}
        />
      </footer>
    </div>
  );
}
