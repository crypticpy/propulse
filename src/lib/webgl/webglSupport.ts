/**
 * WebGL preflight check.
 *
 * Probes for WebGL support with a throwaway canvas before any Three.js
 * renderer is constructed, so a browser with the GPU process disabled
 * never attempts to create a real rendering context.
 */

export type WebGLUnsupportedReason = "no-document" | "no-context" | "threw";

export interface WebGLSupportResult {
  supported: boolean;
  reason: WebGLUnsupportedReason | null;
}

export function probeWebGLSupport(): WebGLSupportResult {
  if (typeof document === "undefined") {
    return { supported: false, reason: "no-document" };
  }

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) {
      return { supported: false, reason: "no-context" };
    }
    // Release the probe context so repeated probes never crowd out the live globe.
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return { supported: true, reason: null };
  } catch {
    return { supported: false, reason: "threw" };
  }
}

export function isWebGLSupported(): boolean {
  return probeWebGLSupport().supported;
}
