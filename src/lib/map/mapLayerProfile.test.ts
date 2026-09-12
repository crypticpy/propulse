import { describe, expect, it } from "vitest";
import { AZIMUTHAL_LAYER_PROFILE, FLAT_LAYER_PROFILE } from "./mapLayerProfile";
import type { MapLayerProfile } from "./mapLayerProfile";
import { createEquirectangularProjection } from "./projection";
import { traceRing } from "@/components/map/layers/bordersLayer";

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

  // #1091 PR 7: drawNightBoostedBordersLayer reads profile.nightClip.stepDeg
  // to decide the terminator sample spacing (was a hardcoded literal in each
  // view's inline function before the shared-layer extraction).
  it("FLAT_LAYER_PROFILE.nightClip pins the measured flat-map terminator sample step", () => {
    expect(FLAT_LAYER_PROFILE.nightClip).toEqual({ stepDeg: 2 });
  });

  it("AZIMUTHAL_LAYER_PROFILE.nightClip pins the measured azimuthal-disc terminator sample step", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.nightClip).toEqual({ stepDeg: 3 });
  });

  it("differs from the flat profile in nightClip.stepDeg; this must fail if the two values were swapped", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.nightClip.stepDeg).not.toBe(
      FLAT_LAYER_PROFILE.nightClip.stepDeg,
    );
    expect(FLAT_LAYER_PROFILE.nightClip.stepDeg).toBe(2);
    expect(AZIMUTHAL_LAYER_PROFILE.nightClip.stepDeg).toBe(3);
  });

  // #1091 PR 7 (F3): `borders` is now required on both profiles so
  // `traceRing` can read `profile.borders` without a null-check. The flat
  // map's wrap-and-repeat seam never reads this group -- it carries the
  // azimuthal disc's own values as an intentionally-inert placeholder (see
  // the `MapLayerProfile.borders` doc comment). A test that merely restates
  // those placeholder values (as a previous version of this test did) can't
  // tell "never read" from "read and happens not to matter yet" -- so this
  // poisons `borders` with values that would visibly break the azimuthal
  // seam (a negative `rimDrop`/`jumpBreakFraction`) and asserts the flat
  // seam's traced ops are unaffected.
  it("FLAT_LAYER_PROFILE.borders placeholder is never read by the flat map's seam", () => {
    const projection = createEquirectangularProjection({
      width: 1024,
      height: 512,
      zoomScale: 1,
    });
    const ring: [number, number][] = [
      [10, 10],
      [20, 20],
      [10, 30],
    ];

    function trace(profile: MapLayerProfile): string[] {
      const ops: string[] = [];
      const ctx = {
        moveTo: (x: number, y: number) => ops.push(`moveTo:${x},${y}`),
        lineTo: (x: number, y: number) => ops.push(`lineTo:${x},${y}`),
        closePath: () => ops.push("closePath"),
      } as unknown as CanvasRenderingContext2D;
      traceRing(ctx, ring, projection, profile);
      return ops;
    }

    const poisoned: MapLayerProfile = {
      ...FLAT_LAYER_PROFILE,
      borders: { rimDrop: -1, jumpBreakFraction: -1 },
    };

    const baseline = trace(FLAT_LAYER_PROFILE);
    expect(baseline.length).toBeGreaterThan(0);
    expect(trace(poisoned)).toEqual(baseline);
  });

  it("AZIMUTHAL_LAYER_PROFILE.borders pins the measured azimuthal-disc values", () => {
    expect(AZIMUTHAL_LAYER_PROFILE.borders).toEqual({
      rimDrop: 0.99,
      jumpBreakFraction: 0.25,
    });
  });
});
