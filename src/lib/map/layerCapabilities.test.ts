import { describe, expect, it } from "vitest";
import { LAYER_REGISTRY } from "./layerRegistry";
import {
  PROP_SPHERE_LAYER_KEYS,
  enabledHeroCriticalLayers,
  formatHeroProjectionChip,
  getLayerAvailability,
  normalizeExclusiveLayers,
  resolveHeroProjection,
  standardBasemapCaveat,
  toggleExclusiveLayer,
  type PropSphereLayerKey,
  type PropSphereViewMode,
} from "./layerCapabilities";

const VIEW_MODES = ["globe", "flat", "azimuthal"] as const;

/** Hardcoded expected matrix — not derived from the production sets. */
const EXPECTED_LAYER_PROJECTION = {
  terminator: { globe: true, flat: true, azimuthal: true },
  greyline: { globe: true, flat: true, azimuthal: false },
  aurora: { globe: true, flat: true, azimuthal: false },
  muf: { globe: true, flat: true, azimuthal: false },
  nvis: { globe: true, flat: false, azimuthal: false },
  spots: { globe: true, flat: true, azimuthal: true },
  activations: { globe: true, flat: true, azimuthal: true },
  spotTraces: { globe: true, flat: true, azimuthal: true },
  nightLights: { globe: true, flat: true, azimuthal: true },
  lunarSubpoint: { globe: true, flat: true, azimuthal: true },
  labels: { globe: true, flat: true, azimuthal: true },
  satellites: { globe: true, flat: true, azimuthal: false },
  earthquakes: { globe: true, flat: true, azimuthal: true },
  weather: { globe: true, flat: true, azimuthal: true },
  lightning: { globe: true, flat: true, azimuthal: true },
  wspr: { globe: true, flat: true, azimuthal: false },
  contestQsos: { globe: true, flat: true, azimuthal: false },
  loggedQsos: { globe: true, flat: true, azimuthal: false },
  fires: { globe: true, flat: true, azimuthal: true },
  radar: { globe: true, flat: true, azimuthal: false },
  issTracker: { globe: true, flat: false, azimuthal: false },
  gridActivity: { globe: true, flat: true, azimuthal: true },
  ionosphere: { globe: true, flat: false, azimuthal: false },
  rayPath: { globe: true, flat: false, azimuthal: false },
  drap: { globe: true, flat: false, azimuthal: false },
  geomagField: { globe: true, flat: false, azimuthal: false },
  noiseFloor: { globe: true, flat: false, azimuthal: false },
  meteorShowers: { globe: true, flat: false, azimuthal: false },
  beacons: { globe: true, flat: false, azimuthal: false },
  spectrumRing: { globe: true, flat: false, azimuthal: false },
  ducting: { globe: true, flat: false, azimuthal: false },
  sporadicE: { globe: true, flat: false, azimuthal: false },
  satelliteFootprints: { globe: true, flat: true, azimuthal: false },
  ft8Spotter: { globe: true, flat: true, azimuthal: false },
  goesCloud: { globe: true, flat: false, azimuthal: false },
  tec: { globe: true, flat: false, azimuthal: false },
  repeaters: { globe: true, flat: false, azimuthal: false },
  riverGauges: { globe: true, flat: false, azimuthal: false },
  aprs: { globe: true, flat: false, azimuthal: false },
  tropical: { globe: true, flat: false, azimuthal: false },
  sst: { globe: true, flat: false, azimuthal: false },
  timeStations: { globe: true, flat: false, azimuthal: false },
} as const satisfies Record<
  PropSphereLayerKey,
  Record<PropSphereViewMode, boolean>
>;

const LAYER_PROJECTION_CASES = PROP_SPHERE_LAYER_KEYS.flatMap((layer) =>
  VIEW_MODES.map((projection) => ({ layer, projection })),
);

function registryLabel(layer: string): string {
  return LAYER_REGISTRY[layer as PropSphereLayerKey]?.name ?? layer;
}

describe("PropSphere renderer capability matrix", () => {
  it.each(LAYER_PROJECTION_CASES)(
    "$layer × $projection",
    ({ layer, projection }) => {
      expect(getLayerAvailability(layer, projection).available).toBe(
        EXPECTED_LAYER_PROJECTION[layer][projection],
      );
    },
  );

  it("prevents globe-only overlays from becoming silent no-ops", () => {
    expect(getLayerAvailability("radar", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("spectrumRing", "azimuthal").available).toBe(
      false,
    );
    // These four have globe implementations only — FlatMapView has no
    // hooks or draw code for them, so claiming flat support was a lie.
    for (const key of ["repeaters", "riverGauges", "aprs", "tropical"]) {
      expect(getLayerAvailability(key, "flat").available).toBe(false);
    }
  });

  it("allows layers implemented by the selected renderer", () => {
    expect(getLayerAvailability("radar", "globe")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("earthquakes", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("activations", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("activations", "azimuthal")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("lunarSubpoint", "globe")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("lunarSubpoint", "flat")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("lunarSubpoint", "azimuthal")).toEqual({
      available: true,
    });
    expect(getLayerAvailability("stateBorders", "flat")).toEqual({
      available: true,
    });
  });

  it("rejects stale or external layer keys", () => {
    expect(getLayerAvailability("not-a-layer", "globe")).toEqual({
      available: false,
      reason: "Unknown layer control",
    });
  });

  it("keeps live-source layers enabled without env flags", () => {
    for (const key of ["repeaters", "aprs", "wspr", "lightning", "tec"]) {
      expect(getLayerAvailability(key, "globe")).toEqual({ available: true });
    }
  });

  it("keeps only one full-globe surface data overlay active", () => {
    const next = toggleExclusiveLayer(
      { radar: false, goesCloud: true, muf: true, spots: true },
      "radar",
    );
    expect(next).toEqual({
      radar: true,
      goesCloud: false,
      muf: false,
      spots: true,
    });
  });

  it("normalizes profile and preset writes with a deterministic preference", () => {
    expect(
      normalizeExclusiveLayers(
        { radar: true, goesCloud: true, muf: true, spots: true },
        "muf",
      ),
    ).toEqual({
      radar: false,
      goesCloud: false,
      muf: true,
      spots: true,
    });
  });
});

describe("enabledHeroCriticalLayers", () => {
  it("returns only the #625 family that is actually on", () => {
    expect(
      enabledHeroCriticalLayers({
        drap: true,
        radar: true,
        muf: true,
        goesCloud: false,
        ducting: true,
        greyline: true,
      }),
    ).toEqual(["drap", "ducting"]);
  });
});

describe("resolveHeroProjection", () => {
  it.each([
    {
      name: "keeps preferred flat when every layer can draw",
      layers: ["spots", "terminator", "radar"] as const,
      preferred: "flat" as const,
      projection: "flat",
      forcedBy: [],
    },
    {
      name: "keeps preferred globe when it can draw the set",
      layers: ["drap", "goesCloud"] as const,
      preferred: "globe" as const,
      projection: "globe",
      forcedBy: [],
    },
    {
      name: "keeps preferred azimuthal when the set is in its table",
      layers: ["spots", "terminator", "gridActivity"] as const,
      preferred: "azimuthal" as const,
      projection: "azimuthal",
      forcedBy: [],
    },
    {
      name: "switches flat → globe for DRAP",
      layers: ["drap"] as const,
      preferred: "flat" as const,
      projection: "globe",
      forcedBy: ["drap"],
    },
    {
      name: "switches flat → globe for GOES, ducting and sporadic-E",
      layers: ["goesCloud", "ducting", "sporadicE"] as const,
      preferred: "flat" as const,
      projection: "globe",
      forcedBy: ["goesCloud", "ducting", "sporadicE"],
    },
    {
      name: "does not switch flat for radar (flat canvas drapes it)",
      layers: ["radar"] as const,
      preferred: "flat" as const,
      projection: "flat",
      forcedBy: [],
    },
    {
      name: "switches azimuthal → globe for radar",
      layers: ["radar"] as const,
      preferred: "azimuthal" as const,
      projection: "globe",
      forcedBy: ["radar"],
    },
    {
      name: "switches azimuthal → globe for DRAP and names only the blockers",
      layers: ["spots", "drap"] as const,
      preferred: "azimuthal" as const,
      projection: "globe",
      forcedBy: ["drap"],
    },
    {
      name: "keeps preferred on an empty set",
      layers: [] as const,
      preferred: "flat" as const,
      projection: "flat",
      forcedBy: [],
    },
  ])("$name", ({ layers, preferred, projection, forcedBy }) => {
    expect(resolveHeroProjection(layers, preferred)).toEqual({
      projection,
      forcedBy,
    });
  });

  it("keeps preferred and reports unknown ids that no projection can draw", () => {
    expect(resolveHeroProjection(["not-a-layer"], "flat")).toEqual({
      projection: "flat",
      forcedBy: ["not-a-layer"],
    });
  });
});

describe("formatHeroProjectionChip", () => {
  it("is silent when preferred already draws the set", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["radar"], "flat"),
        "flat",
        registryLabel,
      ),
    ).toBeUndefined();
  });

  it("explains a flat → globe switch using registry names", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["drap"], "flat"),
        "flat",
        registryLabel,
      ),
    ).toBe(
      "Switched to 3D globe because the flat map cannot draw D-RAP Absorption",
    );
  });

  it("lists every layer that forced the switch", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["drap", "goesCloud", "ducting"], "flat"),
        "flat",
        registryLabel,
      ),
    ).toBe(
      "Switched to 3D globe because the flat map cannot draw D-RAP Absorption, GOES-East Cloud, and Ducting Climatology",
    );
  });

  it("still speaks when no projection can draw the set", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["not-a-layer"], "flat"),
        "flat",
        registryLabel,
      ),
    ).toBe("the flat map cannot draw not-a-layer");
  });

  it("names the on-screen projection when the force was yielded", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["drap"], "flat"),
        "flat",
        registryLabel,
        "flat",
      ),
    ).toBe("the flat map cannot draw D-RAP Absorption");
  });
});

describe("standardBasemapCaveat (B6 PR #222 fix #1, corrected)", () => {
  it("has no caveat on globe — the standard bucket renders the chosen provider", () => {
    expect(standardBasemapCaveat("globe")).toBeUndefined();
  });

  it("notes that Flat draws its own basemap, ignoring OSM vs CARTO", () => {
    expect(standardBasemapCaveat("flat")).toBe(
      "Flat map draws its own standard basemap",
    );
  });

  it("notes that Azimuthal draws its own basemap, ignoring OSM vs CARTO", () => {
    expect(standardBasemapCaveat("azimuthal")).toBe(
      "Azimuthal draws its own standard basemap",
    );
  });
});
