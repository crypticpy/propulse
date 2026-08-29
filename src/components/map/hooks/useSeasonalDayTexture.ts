/**
 * useSeasonalDayTexture
 *
 * Graceful upgrade path for monthly Blue Marble basemap textures (parity
 * item G19 -- mechanism only, assets land later).
 *
 * Given the already-loaded base day texture, this hook probes for a
 * higher-fidelity monthly texture at `/textures/months/earth-day-MM.jpg`
 * (MM = current UTC month, 01-12) via a HEAD request. If the asset exists
 * and reports an image content-type, it's loaded and returned in place of
 * the base texture; otherwise the base texture is returned unchanged.
 *
 * Mount-only: the month is computed once and never re-checked while the
 * component stays mounted. Kiosk displays reload daily, so a fresh mount
 * naturally picks up the current month.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";

function getSeasonalTexturePath(): string {
  const month = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  return `/textures/months/earth-day-${month}.jpg`;
}

export function useSeasonalDayTexture(
  baseTexture: THREE.Texture,
): THREE.Texture {
  const [texture, setTexture] = useState<THREE.Texture>(baseTexture);

  useEffect(() => {
    let cancelled = false;
    let seasonalTexture: THREE.Texture | null = null;
    const path = getSeasonalTexturePath();

    async function tryUpgrade() {
      try {
        const res = await fetch(path, { method: "HEAD" });
        if (!res.ok) return;

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image")) return;

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
      } catch (err) {
        // Monthly assets are optional and absent by default -- a failed
        // fetch is not a bug. Debug-level only, no console.error spam.
        console.debug(
          "[useSeasonalDayTexture] seasonal texture unavailable:",
          err,
        );
      }
    }

    void tryUpgrade();

    return () => {
      cancelled = true;
      if (seasonalTexture) {
        seasonalTexture.dispose();
      }
    };
    // Mount-only by design -- see doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return texture;
}

export default useSeasonalDayTexture;
