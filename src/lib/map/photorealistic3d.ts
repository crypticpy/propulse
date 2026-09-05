import { isWebGLSupported } from "@/lib/webgl/webglSupport";

export interface Photorealistic3DConfig {
  enabled: boolean;
  maxDevicePixelRatio: number;
  unavailableReason: string | null;
}

interface Photorealistic3DEnvironment {
  VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED?: string;
  VITE_GOOGLE_PHOTOREALISTIC_MAX_DPR?: string;
}

/**
 * Resolve the experimental provider gate without ever logging or persisting
 * the browser-restricted Google key.
 */
export function getPhotorealistic3DConfig(
  environment: Photorealistic3DEnvironment = import.meta.env,
): Photorealistic3DConfig {
  if (environment.VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED !== "true") {
    return {
      enabled: false,
      maxDevicePixelRatio: 1.5,
      unavailableReason: "Photorealistic 3D is disabled by configuration.",
    };
  }

  const requestedDpr = Number(
    environment.VITE_GOOGLE_PHOTOREALISTIC_MAX_DPR ?? "1.5",
  );
  const maxDevicePixelRatio = Number.isFinite(requestedDpr)
    ? Math.max(1, Math.min(2, requestedDpr))
    : 1.5;
  return {
    enabled: true,
    maxDevicePixelRatio,
    unavailableReason: null,
  };
}

export function supportsPhotorealistic3D(): boolean {
  return isWebGLSupported();
}

/** Google 3D tiles are attempted only when the flag is on and the session is Pro. */
export function shouldAttemptGooglePhotorealistic(
  subscriptionTier: "free" | "pro",
  config: Photorealistic3DConfig = getPhotorealistic3DConfig(),
): boolean {
  return subscriptionTier === "pro" && config.enabled;
}

export const GOOGLE_KEY_FALLBACK_MESSAGE =
  "Using Esri World Imagery. Add a Google Map Tiles API key for photorealistic city-scale detail.";

/** Operator-facing reason for the Esri globe, never blaming a missing key the session already has. */
export function photorealisticFallbackMessage(input: {
  googleFailed: boolean;
  webglSupported: boolean;
  attemptedGoogle: boolean;
}): string {
  if (input.googleFailed) {
    return "Using Esri World Imagery. Google photorealistic tiles could not be loaded.";
  }
  if (input.attemptedGoogle && !input.webglSupported) {
    return "Using Esri World Imagery. This browser or GPU cannot render photorealistic 3D tiles.";
  }
  return GOOGLE_KEY_FALLBACK_MESSAGE;
}
