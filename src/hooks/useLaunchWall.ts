/**
 * Launch Wall (E7) — one click, every monitor becomes a kiosk display.
 *
 * Uses the Chromium Window Management API (window.getScreenDetails) to
 * open one kiosk window per physical screen, assigning scenes
 * round-robin. Browsers without the API (or with permission denied)
 * fall back to cascaded popup windows the operator drags into place.
 *
 * @module hooks/useLaunchWall
 */

import { useCallback, useState } from "react";
import type { KioskScene } from "@/stores/kioskStore";

// Minimal shapes for the Window Management API — not yet in lib.dom.
interface ScreenDetailedLike {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  label?: string;
}

interface ScreenDetailsLike {
  screens: readonly ScreenDetailedLike[];
}

type WindowWithScreenDetails = Window & {
  getScreenDetails?: () => Promise<ScreenDetailsLike>;
};

export function buildKioskUrl(sceneId: string): string {
  return `/kiosk?start=1&scene=${encodeURIComponent(sceneId)}`;
}

/**
 * Round-robin scene→screen assignment: every screen gets a scene; when
 * scenes run short they repeat. Returns one entry per screen.
 */
export function assignScenesToScreens<T>(
  scenes: readonly T[],
  screenCount: number,
): T[] {
  if (scenes.length === 0 || screenCount <= 0) return [];
  return Array.from(
    { length: screenCount },
    (_, i) => scenes[i % scenes.length],
  );
}

export interface LaunchWallResult {
  mode: "multi-screen" | "fallback";
  opened: number;
  blocked: number;
  screenCount: number | null;
}

const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 800;
const CASCADE_STEP = 48;

async function getScreens(): Promise<readonly ScreenDetailedLike[] | null> {
  const win = window as WindowWithScreenDetails;
  if (typeof win.getScreenDetails !== "function") return null;
  try {
    // Triggers the window-management permission prompt on first use
    const details = await win.getScreenDetails();
    return details.screens.length > 0 ? details.screens : null;
  } catch {
    // Permission denied or API misbehaved — fall back gracefully
    return null;
  }
}

function openWindows(
  scenes: readonly KioskScene[],
  screens: readonly ScreenDetailedLike[] | null,
): LaunchWallResult {
  let opened = 0;
  let blocked = 0;

  if (screens) {
    const assigned = assignScenesToScreens(scenes, screens.length);
    assigned.forEach((scene, i) => {
      const s = screens[i];
      const features = [
        "popup=1",
        `left=${s.availLeft}`,
        `top=${s.availTop}`,
        `width=${s.availWidth}`,
        `height=${s.availHeight}`,
      ].join(",");
      const win = window.open(
        buildKioskUrl(scene.id),
        `propulse-wall-${i}`,
        features,
      );
      if (win) opened += 1;
      else blocked += 1;
    });
    return { mode: "multi-screen", opened, blocked, screenCount: screens.length };
  }

  scenes.forEach((scene, i) => {
    const features = [
      "popup=1",
      `left=${CASCADE_STEP * (i + 1)}`,
      `top=${CASCADE_STEP * (i + 1)}`,
      `width=${FALLBACK_WIDTH}`,
      `height=${FALLBACK_HEIGHT}`,
    ].join(",");
    const win = window.open(
      buildKioskUrl(scene.id),
      `propulse-wall-${i}`,
      features,
    );
    if (win) opened += 1;
    else blocked += 1;
  });
  return { mode: "fallback", opened, blocked, screenCount: null };
}

export function useLaunchWall() {
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<LaunchWallResult | null>(null);

  const launchWall = useCallback(async (scenes: readonly KioskScene[]) => {
    if (scenes.length === 0) return;
    setLaunching(true);
    try {
      const screens = await getScreens();
      setResult(openWindows(scenes, screens));
    } finally {
      setLaunching(false);
    }
  }, []);

  const supportsMultiScreen =
    typeof (window as WindowWithScreenDetails).getScreenDetails === "function";

  return { launchWall, launching, result, supportsMultiScreen };
}
