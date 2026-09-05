import { useCallback, useEffect, type ReactNode } from "react";
import { DXNewsTicker } from "@/components/map/DXNewsTicker";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { ensureHamClockThemeFont } from "@/lib/hamclock/themeFonts";
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
 * a pager control at each end. Both rails and both pagers share the one page
 * index — pick the page from either side of the screen and the whole wall
 * turns to it together. The WALL/DESK switch lives in the header (alongside
 * mode, projection and settings, in the fixed slot the desk header also
 * uses — B1/HW-22), not the footer, so there is exactly one control for it.
 */
export function HamClockWall({ children }: HamClockWallProps) {
  // Both rails follow one page (wall spec §4/§5): `left` is the canonical
  // index the store keeps `right` mirrored to, so the wall only ever reads
  // one number.
  const page = useHamClockDisplayStore((s) => s.pageIndex.left);
  const stepPage = useHamClockDisplayStore((s) => s.stepPage);
  const theme = useHamClockDisplayStore((s) => s.theme);
  const pageCount = HAMCLOCK_WALL_PAGES.length;
  const onStep = useCallback(
    (delta: number) => stepPage("left", delta, pageCount),
    [stepPage, pageCount],
  );

  // The serif themes' faces are fetched the first time a wall runs one, so
  // the default look never pays for fonts it does not use.
  useEffect(() => {
    ensureHamClockThemeFont(theme);
  }, [theme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (shouldIgnoreKey(event)) return;
      event.preventDefault();
      // One shared page, so either arrow key steps the whole wall regardless
      // of which rail the operator is thinking of.
      onStep(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onStep]);

  return (
    <div className="hc-wall">
      <HamClockWallHeader />

      <div className="hc-stage">
        {children}
        <HamClockRail side="left" pageIndex={page} label="Left tile rail" />
        <HamClockRail side="right" pageIndex={page} label="Right tile rail" />
      </div>

      <DXNewsTicker className="rounded-none" />

      <footer className="hc-ftr">
        <HamClockPager pageIndex={page} onStep={onStep} />
        <WallStatus />
        <HamClockPager pageIndex={page} onStep={onStep} />
      </footer>
    </div>
  );
}
