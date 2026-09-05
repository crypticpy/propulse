import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { DXNewsTicker } from "@/components/map/DXNewsTicker";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { ensureHamClockThemeFont } from "@/lib/hamclock/themeFonts";
import { useDXStore } from "@/stores/dxStore";
import { useHamClockDisplayStore, wallPages } from "@/stores/hamclockDisplayStore";
import { HamClockPager } from "./HamClockPager";
import { HamClockRail } from "./HamClockRail";
import { HamClockWallHeader } from "./HamClockWallHeader";

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
  /** Forwarded to `HamClockWallHeader`; opens the single settings dialog
   * `HamClockView` owns above the density branch. */
  onOpenSettings: () => void;
}

/**
 * The HamClock shell at both densities (wall spec §3, §15, HW-24/HW-25): a
 * full-bleed map with two tile rails, a callsign header with dual clocks,
 * the existing DX news ticker, and a footer carrying a pager control at
 * each end. Both rails and both pagers share the one page index — pick the
 * page from either side of the screen and the whole shell turns to it
 * together. Desk renders the identical tree at `--hc-scale` ~0.72 with
 * opaque rails (`data-density`, `hamclock-wall.css`) instead of a second
 * layout, so a batch that adds a tile never has to build it twice. The
 * WALL/DESK switch lives in the header (alongside mode, projection and
 * settings, in the fixed slot — B1/HW-22), not the footer, so there is
 * exactly one control for it.
 */
export function HamClockWall({ children, onOpenSettings }: HamClockWallProps) {
  // Both rails follow one page (wall spec §4/§5): `left` is the canonical
  // index the store keeps `right` mirrored to, so the wall only ever reads
  // one number.
  const page = useHamClockDisplayStore((s) => s.pageIndex.left);
  const stepPage = useHamClockDisplayStore((s) => s.stepPage);
  const theme = useHamClockDisplayStore((s) => s.theme);
  const density = useHamClockDisplayStore((s) => s.density);
  const railLayout = useHamClockDisplayStore((s) => s.railLayout);
  // The pages the operator's own layout actually cycles through (wall spec
  // §4/§5, review pass after B4), not a fixed shipped five — a preset with
  // one page steps one page, not five with empty rails.
  const pages = useMemo(() => wallPages(railLayout), [railLayout]);
  const pageCount = pages.length;
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
    <div className="hc-wall" data-density={density}>
      <HamClockWallHeader onOpenSettings={onOpenSettings} />

      <div className="hc-stage">
        {children}
        <HamClockRail side="left" pageIndex={page} label="Left tile rail" />
        <HamClockRail side="right" pageIndex={page} label="Right tile rail" />
      </div>

      <DXNewsTicker className="rounded-none" />

      <footer className="hc-ftr">
        <HamClockPager pages={pages} pageIndex={page} onStep={onStep} />
        <WallStatus />
        <HamClockPager pages={pages} pageIndex={page} onStep={onStep} />
      </footer>
    </div>
  );
}
