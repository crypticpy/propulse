/**
 * useSeasonalDayTexture
 *
 * Graceful upgrade path for monthly Blue Marble basemap textures (parity
 * item G19, hi-res tier added later).
 *
 * Given the already-loaded base day texture, this hook probes candidate
 * monthly textures for the current UTC month and upgrades to the first one
 * that exists (HEAD request reporting an image content-type):
 *
 *   1. hi-res 5400x2700 from the public `textures` storage bucket — only
 *      when the user opted in via Settings → Appearance,
 *   2. bundled web-size /textures/months/earth-day-MM.jpg,
 *
 * falling back to the base texture when no candidate is available. The
 * month is computed when the effect runs and never re-checked while the
 * component stays mounted. Kiosk displays reload daily, so a fresh mount
 * naturally picks up the current month. Toggling the hi-res setting
 * re-runs the probe live — no reload needed.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Public storage CDN hosting the full-resolution NASA Blue Marble monthlies
 * (migration 20260829230000, uploaded by scripts/upload-hires-textures.mjs).
 * Hardcoded rather than derived from VITE_SUPABASE_URL so env-unset wall/LAN
 * builds keep the hi-res option; the imagery is public-domain 2004 data
 * served with a one-year cache lifetime.
 */
const HI_RES_TEXTURE_BASE_URL =
  "https://jikgeihhyluuonqdwlrr.supabase.co/storage/v1/object/public/textures";

/**
 * Candidate monthly texture URLs in probe order for the given date's UTC
 * month. Exported for tests.
 */
export function getSeasonalTextureCandidates(
  hiRes: boolean,
  date: Date = new Date(),
): string[] {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const local = `/textures/months/earth-day-${month}.jpg`;
  return hiRes
    ? [`${HI_RES_TEXTURE_BASE_URL}/months/earth-day-${month}.jpg`, local]
    : [local];
}

export function useSeasonalDayTexture(
  baseTexture: THREE.Texture,
): THREE.Texture {
  const hiRes = useSettingsStore((s) => s.globeHiResTextures);
  const [texture, setTexture] = useState<THREE.Texture>(baseTexture);

  useEffect(() => {
    let cancelled = false;
    let seasonalTexture: THREE.Texture | null = null;
    const candidates = getSeasonalTextureCandidates(hiRes);

    async function tryUpgrade() {
      for (const path of candidates) {
        try {
          const res = await fetch(path, { method: "HEAD" });
          if (!res.ok) continue;

          const contentType = res.headers.get("content-type") ?? "";
          if (!contentType.startsWith("image")) continue;

          const loaded = await new THREE.TextureLoader().loadAsync(path);
          if (cancelled) {
            loaded.dispose();
            return;
          }

          loaded.colorSpace = baseTexture.colorSpace;
          loaded.anisotropy = baseTexture.anisotropy;
          loaded.wrapS = baseTexture.wrapS;
          loaded.wrapT = baseTexture.wrapT;
          loaded.needsUpdate = true;

          seasonalTexture = loaded;
          setTexture(loaded);
          return;
        } catch (err) {
          // Monthly assets are optional and the hi-res CDN may be
          // unreachable offline -- a failed candidate is not a bug.
          console.debug(
            "[useSeasonalDayTexture] texture candidate unavailable:",
            path,
            err,
          );
        }
      }
    }

    void tryUpgrade();

    return () => {
      cancelled = true;
      if (seasonalTexture) {
        // Reset before disposing so the material never samples a disposed
        // texture while the next effect run re-probes.
        setTexture(baseTexture);
        seasonalTexture.dispose();
      }
    };
    // The base texture is stable for the life of the globe; only the hi-res
    // opt-in re-runs the probe. Month is deliberately mount-only -- see doc
    // comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiRes]);

  return texture;
}

export default useSeasonalDayTexture;
