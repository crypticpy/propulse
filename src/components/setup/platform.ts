/**
 * Shared setup-platform toolkit for BridgeInfoPage and SetupGuidePage
 * (#1097). Both pages let the user pick Windows/macOS/Linux to filter
 * platform-specific install commands, and both used to persist that
 * choice under their own localStorage key — so picking a platform on one
 * page had no effect on the other. This module is the single source of
 * truth for detecting, labeling, and persisting that choice.
 */

export type Platform = "windows" | "macos" | "linux";

/**
 * Canonical localStorage key for the remembered platform choice, read and
 * written by both pages via `getInitialPlatform()` / `persistPlatform()`.
 *
 * This reuses SetupGuidePage's pre-#1097 key rather than inventing a third
 * one. Neither key ever recorded a deliberate choice: both pre-#1097 pages
 * wrote their own key unconditionally on mount with the auto-detected
 * value, so whichever key was written last just reflects which page the
 * user opened most recently, not an explicit pick. The tie-break is that
 * `/setup` sees more traffic than BridgeInfoPage's disconnected state, and
 * a wrong guess there only costs the user one click on a visible platform
 * tab. There is no telemetry to confirm this; it is a judgment call for the
 * design review to override if it looks wrong.
 */
export const PLATFORM_STORAGE_KEY = "propulse-setup-guide-platform";

/**
 * BridgeInfoPage's pre-#1097 key. Read once for migration on
 * `getInitialPlatform()` and never written again.
 */
const LEGACY_PLATFORM_STORAGE_KEY = "propulse-bridge-setup-platform";

function isPlatform(value: string | null): value is Platform {
  return value === "windows" || value === "macos" || value === "linux";
}

/** Detect the user's platform from the user agent / navigator.platform. */
export function detectPlatform(): Platform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const plat =
    typeof navigator !== "undefined"
      ? ((navigator as Navigator & { platform?: string }).platform ?? "")
      : "";
  const s = `${ua} ${plat}`.toLowerCase();
  if (s.includes("mac")) return "macos";
  if (s.includes("win")) return "windows";
  return "linux";
}

/** Human-readable label for a platform. */
export function platformLabel(p: Platform): string {
  switch (p) {
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
    case "linux":
      return "Linux";
  }
}

/**
 * Reads the remembered platform choice: canonical key if valid, else the
 * legacy BridgeInfoPage key if valid, else `detectPlatform()`. This is a
 * pure read — it never writes. Copying a legacy value forward to the
 * canonical key is done by the pages' `useEffect(() => persistPlatform(...),
 * [platform])` on mount, not here, so this can safely run during render
 * (including twice under StrictMode) without touching storage.
 */
export function getInitialPlatform(): Platform {
  try {
    const chosen = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (isPlatform(chosen)) return chosen;

    const legacy = localStorage.getItem(LEGACY_PLATFORM_STORAGE_KEY);
    if (isPlatform(legacy)) return legacy;
  } catch {
    // localStorage unavailable (private browsing, disabled storage, etc.)
  }
  return detectPlatform();
}

/** Persists the platform choice under the canonical key. */
export function persistPlatform(platform: Platform): void {
  try {
    localStorage.setItem(PLATFORM_STORAGE_KEY, platform);
  } catch {
    // ignore
  }
}
