/**
 * LaunchWallSection (E7) — the "Launch Wall" block on the Kiosk page.
 *
 * One click opens a kiosk window on every monitor via the Window
 * Management API; browsers without it get cascaded windows to drag
 * into place. Runs fully local — no account or pairing needed.
 *
 * @module components/kiosk/LaunchWallSection
 */

import { useLaunchWall } from "@/hooks/useLaunchWall";
import type { KioskScene } from "@/stores/kioskStore";

export interface LaunchWallSectionProps {
  scenes: KioskScene[];
}

export function LaunchWallSection({ scenes }: LaunchWallSectionProps) {
  const { launchWall, launching, result, supportsMultiScreen } =
    useLaunchWall();

  return (
    <section className="bg-deep-space/60 border border-white/10 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider mb-2">
        Launch Wall
      </h2>
      <p className="text-sm text-gray-400 mb-3 max-w-xl">
        {supportsMultiScreen
          ? "Open a kiosk window on every connected monitor in one click — scenes are assigned around the wall in order. Your browser will ask for window-management permission the first time."
          : "Your browser can't place windows on specific monitors (Chromium-only feature). Launch opens one window per scene — drag each to a monitor and press F11."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void launchWall(scenes)}
          disabled={launching || scenes.length === 0}
          className="px-4 py-2 rounded-lg bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {launching ? "Launching…" : "⬛⬛ Launch Wall"}
        </button>
        {result && (
          <span className="text-xs text-gray-400">
            {result.mode === "multi-screen"
              ? `${result.opened} of ${result.screenCount} monitors launched`
              : `${result.opened} windows opened`}
            {result.blocked > 0 &&
              ` — ${result.blocked} blocked. Allow pop-ups for this site and try again.`}
          </span>
        )}
      </div>
    </section>
  );
}

LaunchWallSection.displayName = "LaunchWallSection";

export default LaunchWallSection;
