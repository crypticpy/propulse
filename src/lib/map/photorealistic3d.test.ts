import { describe, expect, it } from "vitest";
import { getPhotorealistic3DConfig } from "./photorealistic3d";

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
