import { describe, expect, it } from "vitest";
import {
  GOOGLE_KEY_FALLBACK_MESSAGE,
  getPhotorealistic3DConfig,
  photorealisticFallbackMessage,
  shouldAttemptGooglePhotorealistic,
} from "./photorealistic3d";

describe("getPhotorealistic3DConfig", () => {
  it("is closed by default", () => {
    const config = getPhotorealistic3DConfig({});
    expect(config.enabled).toBe(false);
  });

  it("requires an explicit feature gate", () => {
    const config = getPhotorealistic3DConfig({
      VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED: "false",
    });
    expect(config.enabled).toBe(false);
    expect(config.unavailableReason).toMatch(/disabled/i);
  });

  it("caps the configured pixel ratio to protect wall GPUs", () => {
    const config = getPhotorealistic3DConfig({
      VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED: "true",
      VITE_GOOGLE_PHOTOREALISTIC_MAX_DPR: "4",
    });
    expect(config.enabled).toBe(true);
    expect(config.maxDevicePixelRatio).toBe(2);
  });
});

describe("shouldAttemptGooglePhotorealistic", () => {
  const enabled = getPhotorealistic3DConfig({
    VITE_GOOGLE_PHOTOREALISTIC_3D_ENABLED: "true",
  });
  const disabled = getPhotorealistic3DConfig({});

  it("skips Google for free sessions even when the flag is on", () => {
    expect(shouldAttemptGooglePhotorealistic("free", enabled)).toBe(false);
  });

  it("skips Google when the experimental flag is off", () => {
    expect(shouldAttemptGooglePhotorealistic("pro", disabled)).toBe(false);
  });

  it("attempts Google only for Pro sessions with the flag on", () => {
    expect(shouldAttemptGooglePhotorealistic("pro", enabled)).toBe(true);
  });
});

describe("photorealisticFallbackMessage", () => {
  it("asks for a key only when Google was never attempted", () => {
    expect(
      photorealisticFallbackMessage({
        googleFailed: false,
        webglSupported: true,
        attemptedGoogle: false,
      }),
    ).toBe(GOOGLE_KEY_FALLBACK_MESSAGE);
  });

  it("does not blame a missing key after Google tiles fail", () => {
    expect(
      photorealisticFallbackMessage({
        googleFailed: true,
        webglSupported: true,
        attemptedGoogle: true,
      }),
    ).toMatch(/could not be loaded/i);
    expect(
      photorealisticFallbackMessage({
        googleFailed: true,
        webglSupported: true,
        attemptedGoogle: true,
      }),
    ).not.toMatch(/API key/i);
  });

  it("explains missing WebGL instead of asking for a key", () => {
    expect(
      photorealisticFallbackMessage({
        googleFailed: false,
        webglSupported: false,
        attemptedGoogle: true,
      }),
    ).toMatch(/browser or GPU/i);
  });
});
