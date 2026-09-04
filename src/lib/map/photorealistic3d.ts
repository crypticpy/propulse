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
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(
    canvas.getContext("webgl2") || canvas.getContext("webgl"),
  );
}

/** Google 3D tiles are attempted only when the flag is on and the session is Pro. */
export function shouldAttemptGooglePhotorealistic(
  subscriptionTier: "free" | "pro",
  config: Photorealistic3DConfig = getPhotorealistic3DConfig(),
): boolean {
  return subscriptionTier === "pro" && config.enabled;
}
