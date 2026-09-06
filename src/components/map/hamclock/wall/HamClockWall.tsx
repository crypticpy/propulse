import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { DXNewsTicker } from "@/components/map/DXNewsTicker";
import { useWallAutoPage } from "@/hooks/useWallAutoPage";
import { ensureHamClockThemeFont } from "@/lib/hamclock/themeFonts";
import { useHamClockDisplayStore, wallPages } from "@/stores/hamclockDisplayStore";
import { HamClockPager } from "./HamClockPager";
import { HamClockRail } from "./HamClockRail";
import { HamClockWallHeader } from "./HamClockWallHeader";
import { WallStatus } from "./WallStatus";

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
 * the existing DX news ticker, and a footer with one pager at the left end
 * and the health strip (`WallStatus`) at the right. Both rails share the one
 * page index, so the whole shell turns together. Desk renders the identical tree at `--hc-scale` ~0.72 with
 * opaque rails (`data-density`, `hamclock-wall.css`) instead of a second
 * layout, so a batch that adds a tile never has to build it twice. The
 * WALL/DESK switch lives in the header (alongside mode, projection and
 * settings, in the fixed slot — B1/HW-22), not the footer, so there is
 * exactly one control for it.
 */
export function HamClockWall({ children, onOpenSettings }: HamClockWallProps) {
  // Runs the auto-page dwell timer (wall spec §5, HW-20). Mounted here,
  // rather than in `HamClockView`, because this component only renders at
  // wall density — desk never runs the timer regardless of the stored
  // `autoPage.enabled` value.
  useWallAutoPage();

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
      </footer>
    </div>
  );
}
