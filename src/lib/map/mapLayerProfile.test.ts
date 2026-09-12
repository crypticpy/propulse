import { describe, expect, it } from "vitest";
import { AZIMUTHAL_LAYER_PROFILE, FLAT_LAYER_PROFILE } from "./mapLayerProfile";

describe("MapLayerProfile", () => {
  it("FLAT_LAYER_PROFILE.fires pins the measured flat-map values", () => {
    expect(FLAT_LAYER_PROFILE.id).toBe("flat");
    expect(FLAT_LAYER_PROFILE.fires).toEqual({
      minRadiusPx: 1.5,
      maxRadiusPx: 6,
      frpPerRadiusPx: 80,
      glowAlpha: 0.2,
    });
  });

  it("AZIMUTHAL_LAYER_PROFILE.fires pins the measured azimuthal-disc values", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.id).toBe("azimuthal");
    expect(AZIMUTHAL_LAYER_PROFILE.fires).toEqual({
      minRadiusPx: 1.5,
      maxRadiusPx: 5,
      frpPerRadiusPx: 100,
      glowAlpha: 0.25,
    });
  });

  it("differs from the flat profile in exactly maxRadiusPx, frpPerRadiusPx and glowAlpha", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.fires.minRadiusPx).toBe(
      FLAT_LAYER_PROFILE.fires.minRadiusPx,
    );
    expect(AZIMUTHAL_LAYER_PROFILE.fires.maxRadiusPx).not.toBe(
      FLAT_LAYER_PROFILE.fires.maxRadiusPx,
    );
    expect(AZIMUTHAL_LAYER_PROFILE.fires.frpPerRadiusPx).not.toBe(
      FLAT_LAYER_PROFILE.fires.frpPerRadiusPx,
    );
    expect(AZIMUTHAL_LAYER_PROFILE.fires.glowAlpha).not.toBe(
      FLAT_LAYER_PROFILE.fires.glowAlpha,
    );
  });

  it("FLAT_LAYER_PROFILE.quakes pins the measured flat-map values", () => {
    expect(FLAT_LAYER_PROFILE.quakes).toEqual({
      maxRadiusPx: 20,
      pxPerMagnitude: 3,
    });
  });

  it("AZIMUTHAL_LAYER_PROFILE.quakes pins the measured azimuthal-disc values", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.quakes).toEqual({
      maxRadiusPx: 15,
      pxPerMagnitude: 2.5,
    });
  });

  it("differs from the flat profile in both quakes.maxRadiusPx and quakes.pxPerMagnitude", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.quakes.maxRadiusPx).not.toBe(
      FLAT_LAYER_PROFILE.quakes.maxRadiusPx,
    );
    expect(AZIMUTHAL_LAYER_PROFILE.quakes.pxPerMagnitude).not.toBe(
      FLAT_LAYER_PROFILE.quakes.pxPerMagnitude,
    );
  });

  it("FLAT_LAYER_PROFILE.weatherAlerts pins the measured flat-map value", () => {
    expect(FLAT_LAYER_PROFILE.weatherAlerts).toEqual({
      labelMinZoomScale: 1.5,
    });
  });

  it("AZIMUTHAL_LAYER_PROFILE.weatherAlerts pins the measured azimuthal-disc value", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.weatherAlerts).toEqual({
      labelMinZoomScale: 0,
    });
  });

  it("differs from the flat profile in weatherAlerts.labelMinZoomScale; this must fail if the two values were swapped", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.weatherAlerts.labelMinZoomScale).not.toBe(
      FLAT_LAYER_PROFILE.weatherAlerts.labelMinZoomScale,
    );
    expect(FLAT_LAYER_PROFILE.weatherAlerts.labelMinZoomScale).toBe(1.5);
    expect(AZIMUTHAL_LAYER_PROFILE.weatherAlerts.labelMinZoomScale).toBe(0);
  });
});
