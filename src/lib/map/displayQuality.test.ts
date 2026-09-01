import { describe, expect, it } from "vitest";
import { resolveDisplayQuality } from "./displayQuality";

describe("resolveDisplayQuality", () => {
  it("automatically selects UHD for a 4K framebuffer", () => {
    const settings = resolveDisplayQuality("auto", {
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 1,
      saveData: false,
    });
    expect(settings.effective).toBe("uhd");
  });

  it("honors browser data-saver before display resolution", () => {
    const settings = resolveDisplayQuality("auto", {
      cssWidth: 3840,
      cssHeight: 2160,
      devicePixelRatio: 2,
      saveData: true,
    });
    expect(settings.effective).toBe("data-saver");
  });

  it("keeps Extreme explicit and more aggressive than UHD", () => {
    const environment = {
      cssWidth: 1280,
      cssHeight: 720,
      devicePixelRatio: 1,
      saveData: true,
    };
    const uhd = resolveDisplayQuality("uhd", environment);
    const extreme = resolveDisplayQuality("extreme", environment);

    expect(extreme.maxDevicePixelRatio).toBeGreaterThan(
      uhd.maxDevicePixelRatio,
    );
    expect(extreme.globeErrorTarget).toBeLessThan(uhd.globeErrorTarget);
    expect(extreme.flatTileCacheSize).toBeGreaterThan(uhd.flatTileCacheSize);
  });
});
