import { describe, expect, it } from "vitest";
import type { MapState } from "@/stores/mapStore";
import { buildLayerLegends } from "./layerLegends";
import {
  AGE_COLOR_STOPS,
  BAND_COLORS,
  getAgeColor,
  getSnrColor,
  SNR_COLOR_STOPS,
} from "@/lib/utils/spotColors";
import { EQ_MAGNITUDE_COLORS } from "@/components/map/EarthquakeOverlay3D";
import { STORM_CATEGORY_HEX } from "@/components/map/TropicalCycloneOverlay3D";
import { RIVER_STATUS_HEX } from "@/components/map/RiverGaugeOverlay3D";
import {
  FIRE_CORE_COLOR,
  FIRE_GLOW_COLOR,
} from "@/components/map/FireOverlay3D";
import {
  LIGHTNING_COLOR_FLAT,
  LIGHTNING_COLOR_STRONG,
  LIGHTNING_COLOR_WEAK,
} from "@/lib/map/lightningColors";
import { getQsoBandColor } from "@/lib/map/qsoBandColors";
import { WSPR_BAND_COLORS, getWsprBandColor } from "@/lib/map/wsprBandColors";

/** All layers off -- callers flip on only what a test needs. */
function noLayers(): MapState["layers"] {
  return {
    terminator: false,
    greyline: false,
    aurora: false,
    muf: false,
    nvis: false,
    spots: false,
    activations: false,
    spotTraces: false,
    nightLights: false,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
    goesCloud: false,
    tec: false,
    repeaters: false,
    riverGauges: false,
    aprs: false,
    tropical: false,
    sst: false,
    timeStations: false,
  };
}

describe("buildLayerLegends", () => {
  it("returns an empty array when nothing is enabled", () => {
    expect(
      buildLayerLegends(noLayers(), {
        spotColorMode: "mode",
        viewMode: "globe",
      }),
    ).toEqual([]);
  });

  it("orders enabled layers in the fixed display order, regardless of input order", () => {
    const layers = {
      ...noLayers(),
      fires: true,
      spots: true,
      earthquakes: true,
      satellites: true,
    };
    const specs = buildLayerLegends(layers, {
      spotColorMode: "mode",
      viewMode: "globe",
    });
    expect(specs.map((s) => s.title)).toEqual([
      "DX Spots",
      "Satellites",
      "Earthquakes",
      "Fires",
    ]);
  });

  it("switches spots entries by spotColorMode", () => {
    const layers = { ...noLayers(), spots: true };

    const modeSpec = buildLayerLegends(layers, {
      spotColorMode: "mode",
      viewMode: "globe",
    })[0];
    expect(modeSpec.entries.length).toBeGreaterThan(0);
    expect(modeSpec.entries.some((e) => e.label === "FT8/FT4/Digital")).toBe(
      true,
    );
    // FT8/FT4/DIGI/DATA dedupe to a single entry, not one entry each.
    expect(
      modeSpec.entries.filter((e) => e.color === modeSpec.entries[0].color)
        .length,
    ).toBe(1);

    const bandSpec = buildLayerLegends(layers, {
      spotColorMode: "band",
      viewMode: "globe",
    })[0];
    expect(bandSpec.entries.some((e) => e.label === "20m")).toBe(true);
    expect(bandSpec.entries.some((e) => e.label === "default")).toBe(false);
  });

  it("shows activator callsign pills with the shared band palette", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), activations: true },
      { spotColorMode: "mode", viewMode: "azimuthal" },
    )[0];

    expect(spec.title).toBe("Activations");
    expect(spec.entries.find((entry) => entry.label === "20m")?.color).toBe(
      BAND_COLORS["20m"],
    );
    expect(spec.entries.find((entry) => entry.label === "Other")?.color).toBe(
      BAND_COLORS.default,
    );
    expect(spec.note).toContain("POTA/SOTA/WWFF");
  });

  it("shows the real SNR and age ramps, matching what getSpotColor draws", () => {
    const layers = { ...noLayers(), spots: true };
    const bandSpec = buildLayerLegends(layers, {
      spotColorMode: "band",
      viewMode: "globe",
    })[0];
    expect(bandSpec.note).toBeUndefined();

    const snrSpec = buildLayerLegends(layers, {
      spotColorMode: "snr",
      viewMode: "globe",
    })[0];
    expect(snrSpec.entries.map((e) => e.color)).toEqual(
      SNR_COLOR_STOPS.map((s) => s.color),
    );
    // Every swatch has to be a color getSnrColor can actually produce.
    for (const stop of SNR_COLOR_STOPS) {
      if (Number.isFinite(stop.minDb)) {
        expect(getSnrColor(stop.minDb)).toBe(stop.color);
      }
    }

    const ageSpec = buildLayerLegends(layers, {
      spotColorMode: "age",
      viewMode: "globe",
    })[0];
    expect(ageSpec.entries.map((e) => e.color)).toEqual(
      AGE_COLOR_STOPS.map((s) => s.color),
    );
    expect(getAgeColor(0)).toBe(ageSpec.entries[0].color);

    // Neither ramp may silently be the band palette again.
    expect(snrSpec.entries).not.toEqual(bandSpec.entries);
    expect(ageSpec.entries).not.toEqual(bandSpec.entries);
  });

  it("includes every band getQsoBandColor has a dedicated color for", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), loggedQsos: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    const labels = spec.entries.map((e) => e.label);
    expect(labels).toContain("60m");
    // Every entry must carry the renderer's own color for that band, and no
    // two bands may collapse onto the generic VHF/UHF+ fallback.
    for (const entry of spec.entries) {
      expect(entry.color).toBe(getQsoBandColor(entry.label.replace("m", "")));
    }
    expect(new Set(spec.entries.map((e) => e.color)).size).toBe(
      spec.entries.length,
    );
  });

  it("titles the combined QSO spec based on which QSO layers are enabled", () => {
    const loggedOnly = buildLayerLegends(
      { ...noLayers(), loggedQsos: true },
      { spotColorMode: "mode", viewMode: "globe" },
    );
    expect(loggedOnly[0].title).toBe("Logged QSOs");

    const contestOnly = buildLayerLegends(
      { ...noLayers(), contestQsos: true },
      { spotColorMode: "mode", viewMode: "globe" },
    );
    expect(contestOnly[0].title).toBe("Contest QSOs");

    const both = buildLayerLegends(
      { ...noLayers(), contestQsos: true, loggedQsos: true },
      { spotColorMode: "mode", viewMode: "globe" },
    );
    expect(both[0].title).toBe("QSOs");
  });

  it("earthquake entries match the exported magnitude color table exactly", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), earthquakes: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    expect(spec.entries).toEqual(
      EQ_MAGNITUDE_COLORS.map((band) => ({
        color: band.color,
        label: band.label,
      })),
    );
  });

  it("tropical cyclone entries source colors from the exported category table", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), tropical: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    const colorsByLabel = Object.fromEntries(
      spec.entries.map((e) => [e.label, e.color]),
    );
    expect(colorsByLabel["TD"]).toBe(STORM_CATEGORY_HEX.TD);
    expect(colorsByLabel["TS"]).toBe(STORM_CATEGORY_HEX.TS);
    expect(colorsByLabel["Cat 1–2"]).toBe(STORM_CATEGORY_HEX["1"]);
    expect(colorsByLabel["Cat 3"]).toBe(STORM_CATEGORY_HEX["3"]);
    expect(colorsByLabel["Cat 4"]).toBe(STORM_CATEGORY_HEX["4"]);
    expect(colorsByLabel["Cat 5"]).toBe(STORM_CATEGORY_HEX["5"]);
  });

  it("river gauge entries match the exported status color table exactly", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), riverGauges: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    const colorsByLabel = Object.fromEntries(
      spec.entries.map((e) => [e.label, e.color]),
    );
    expect(colorsByLabel["Normal"]).toBe(RIVER_STATUS_HEX.normal);
    expect(colorsByLabel["Action"]).toBe(RIVER_STATUS_HEX.action);
    expect(colorsByLabel["Minor flood"]).toBe(RIVER_STATUS_HEX.minor);
    expect(colorsByLabel["Moderate flood"]).toBe(RIVER_STATUS_HEX.moderate);
    expect(colorsByLabel["Major flood"]).toBe(RIVER_STATUS_HEX.major);
  });

  it("excludes raster/field layers even when enabled", () => {
    const layers = {
      ...noLayers(),
      radar: true,
      aurora: true,
      drap: true,
      tec: true,
      muf: true,
      nvis: true,
      ionosphere: true,
      terminator: true,
      greyline: true,
      nightLights: true,
      labels: true,
      gridActivity: true,
      spectrumRing: true,
      noiseFloor: true,
      ducting: true,
      sporadicE: true,
      satelliteFootprints: true,
      spotTraces: true,
      goesCloud: true,
      sst: true,
      rayPath: true,
      geomagField: true,
    };
    expect(
      buildLayerLegends(layers, { spotColorMode: "mode", viewMode: "globe" }),
    ).toEqual([]);
  });

  it("omits globe-only layers when the flat or azimuthal renderer is active", () => {
    // Every legend-able layer on at once.
    const layers = {
      ...noLayers(),
      spots: true,
      ft8Spotter: true,
      satellites: true,
      beacons: true,
      wspr: true,
      loggedQsos: true,
      earthquakes: true,
      weather: true,
      tropical: true,
      riverGauges: true,
      meteorShowers: true,
      issTracker: true,
      repeaters: true,
      aprs: true,
      timeStations: true,
      fires: true,
      lightning: true,
    };
    const keysFor = (viewMode: "globe" | "flat" | "azimuthal") =>
      buildLayerLegends(layers, { spotColorMode: "mode", viewMode }).map(
        (s) => s.key,
      );

    const globe = keysFor("globe");
    const flat = keysFor("flat");
    const azimuthal = keysFor("azimuthal");

    // Neither 2D renderer has any code path for these seven.
    for (const globeOnly of [
      "beacons",
      "tropical",
      "riverGauges",
      "meteorShowers",
      "repeaters",
      "aprs",
      "timeStations",
    ] as const) {
      expect(globe).toContain(globeOnly);
      expect(flat).not.toContain(globeOnly);
      expect(azimuthal).not.toContain(globeOnly);
    }

    // Flat draws these; azimuthal does not.
    for (const flatOnly of ["ft8Spotter", "satellites", "wspr"] as const) {
      expect(flat).toContain(flatOnly);
      expect(azimuthal).not.toContain(flatOnly);
    }
    expect(flat).toContain("loggedQsos");
    expect(azimuthal).not.toContain("loggedQsos");

    // Drawn by all three.
    for (const universal of [
      "spots",
      "earthquakes",
      "weather",
      "fires",
      "lightning",
      "issTracker",
    ] as const) {
      expect(azimuthal).toContain(universal);
    }

    // Each view is a subset of the one above it, never a superset.
    expect(flat.every((k) => globe.includes(k))).toBe(true);
    expect(azimuthal.every((k) => flat.includes(k))).toBe(true);
  });

  it("describes the lightning ramp the active renderer actually uses", () => {
    const layers = { ...noLayers(), lightning: true };

    const globe = buildLayerLegends(layers, {
      spotColorMode: "mode",
      viewMode: "globe",
    })[0];
    expect(globe.entries.map((e) => e.color)).toEqual([
      LIGHTNING_COLOR_WEAK,
      LIGHTNING_COLOR_STRONG,
    ]);

    // Flat/azimuthal draw amber and switch to white above the kA threshold.
    for (const viewMode of ["flat", "azimuthal"] as const) {
      const spec = buildLayerLegends(layers, {
        spotColorMode: "mode",
        viewMode,
      })[0];
      expect(spec.entries.map((e) => e.color)).toEqual([
        LIGHTNING_COLOR_FLAT,
        LIGHTNING_COLOR_STRONG,
      ]);
      expect(spec.entries.some((e) => e.color === LIGHTNING_COLOR_WEAK)).toBe(
        false,
      );
    }
  });

  it("gives lightning real swatches sourced from the overlay's color ramp", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), lightning: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    expect(spec.entries.map((e) => e.color)).toEqual([
      LIGHTNING_COLOR_WEAK,
      LIGHTNING_COLOR_STRONG,
    ]);
  });

  it("shows the fire core color, not the translucent outer glow", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), fires: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    expect(spec.entries).toEqual([
      { color: FIRE_CORE_COLOR, label: "Active fire" },
    ]);
    expect(FIRE_CORE_COLOR).not.toBe(FIRE_GLOW_COLOR);
  });

  it("sources WSPR entries from the palette both renderers share", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), wspr: true },
      { spotColorMode: "mode", viewMode: "globe" },
    )[0];
    expect(spec.entries).toEqual(
      WSPR_BAND_COLORS.map((band) => ({
        color: band.color,
        label: band.label,
      })),
    );
    // The ladder must resolve real WSPR dial frequencies to the right band.
    expect(getWsprBandColor(1.8366)).toBe(spec.entries[0].color);
    expect(getWsprBandColor(14.0956)).toBe(
      spec.entries.find((e) => e.label === "20m")!.color,
    );
  });
});
