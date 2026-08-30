import { describe, expect, it } from "vitest";
import type { MapState } from "@/stores/mapStore";
import { buildLayerLegends } from "./layerLegends";
import { EQ_MAGNITUDE_COLORS } from "@/components/map/EarthquakeOverlay3D";
import { STORM_CATEGORY_HEX } from "@/components/map/TropicalCycloneOverlay3D";
import { RIVER_STATUS_HEX } from "@/components/map/RiverGaugeOverlay3D";

/** All layers off -- callers flip on only what a test needs. */
function noLayers(): MapState["layers"] {
  return {
    terminator: false,
    greyline: false,
    aurora: false,
    muf: false,
    nvis: false,
    spots: false,
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
    expect(buildLayerLegends(noLayers(), { spotColorMode: "mode" })).toEqual(
      [],
    );
  });

  it("orders enabled layers in the fixed display order, regardless of input order", () => {
    const layers = {
      ...noLayers(),
      fires: true,
      spots: true,
      earthquakes: true,
      satellites: true,
    };
    const specs = buildLayerLegends(layers, { spotColorMode: "mode" });
    expect(specs.map((s) => s.title)).toEqual([
      "DX Spots",
      "Satellites",
      "Earthquakes",
      "Fires",
    ]);
  });

  it("switches spots entries by spotColorMode", () => {
    const layers = { ...noLayers(), spots: true };

    const modeSpec = buildLayerLegends(layers, { spotColorMode: "mode" })[0];
    expect(modeSpec.entries.length).toBeGreaterThan(0);
    expect(modeSpec.entries.some((e) => e.label === "FT8/FT4/Digital")).toBe(
      true,
    );
    // FT8/FT4/DIGI/DATA dedupe to a single entry, not one entry each.
    expect(modeSpec.entries.filter((e) => e.color === modeSpec.entries[0].color).length).toBe(1);

    const bandSpec = buildLayerLegends(layers, { spotColorMode: "band" })[0];
    expect(bandSpec.entries.some((e) => e.label === "20m")).toBe(true);
    expect(bandSpec.entries.some((e) => e.label === "default")).toBe(false);
  });

  it("uses a note instead of swatches for snr and age spot color modes", () => {
    const layers = { ...noLayers(), spots: true };

    const snrSpec = buildLayerLegends(layers, { spotColorMode: "snr" })[0];
    expect(snrSpec.entries).toEqual([]);
    expect(snrSpec.note).toMatch(/signal strength/i);

    const ageSpec = buildLayerLegends(layers, { spotColorMode: "age" })[0];
    expect(ageSpec.entries).toEqual([]);
    expect(ageSpec.note).toMatch(/age/i);
  });

  it("titles the combined QSO spec based on which QSO layers are enabled", () => {
    const loggedOnly = buildLayerLegends(
      { ...noLayers(), loggedQsos: true },
      { spotColorMode: "mode" },
    );
    expect(loggedOnly[0].title).toBe("Logged QSOs");

    const contestOnly = buildLayerLegends(
      { ...noLayers(), contestQsos: true },
      { spotColorMode: "mode" },
    );
    expect(contestOnly[0].title).toBe("Contest QSOs");

    const both = buildLayerLegends(
      { ...noLayers(), contestQsos: true, loggedQsos: true },
      { spotColorMode: "mode" },
    );
    expect(both[0].title).toBe("QSOs");
  });

  it("earthquake entries match the exported magnitude color table exactly", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), earthquakes: true },
      { spotColorMode: "mode" },
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
      { spotColorMode: "mode" },
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
      { spotColorMode: "mode" },
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
    expect(buildLayerLegends(layers, { spotColorMode: "mode" })).toEqual([]);
  });

  it("gives lightning a note instead of swatches", () => {
    const spec = buildLayerLegends(
      { ...noLayers(), lightning: true },
      { spotColorMode: "mode" },
    )[0];
    expect(spec.entries).toEqual([]);
    expect(spec.note).toMatch(/strike/i);
  });
});
