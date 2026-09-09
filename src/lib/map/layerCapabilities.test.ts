import { describe, expect, it } from "vitest";
import {
  AZIMUTHAL_SUPPORTED_LAYER_KEYS,
  FLAT_UNSUPPORTED_LAYER_KEYS,
  PROP_SPHERE_LAYER_KEYS,
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

const AZIMUTHAL_SUPPORTED = new Set<PropSphereLayerKey>(
  AZIMUTHAL_SUPPORTED_LAYER_KEYS,
);
const FLAT_UNSUPPORTED = new Set<PropSphereLayerKey>(
  FLAT_UNSUPPORTED_LAYER_KEYS,
);

function expectedAvailable(
  layer: PropSphereLayerKey,
  projection: PropSphereViewMode,
): boolean {
  if (projection === "globe") return true;
  if (projection === "flat") return !FLAT_UNSUPPORTED.has(layer);
  return AZIMUTHAL_SUPPORTED.has(layer);
}

const LAYER_PROJECTION_CASES = PROP_SPHERE_LAYER_KEYS.flatMap((layer) =>
  VIEW_MODES.map((projection) => ({ layer, projection })),
);

describe("PropSphere renderer capability matrix", () => {
  it.each(LAYER_PROJECTION_CASES)(
    "$layer × $projection",
    ({ layer, projection }) => {
      expect(getLayerAvailability(layer, projection).available).toBe(
        expectedAvailable(layer, projection),
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

/** Hero-truthfulness layers from issue #625. Radar drapes on flat; the
 * others are globe-only. Azimuthal draws none of them. */
const HERO_LAYER_TRUTH = [
  ["drap", { globe: true, flat: false, azimuthal: false }],
  ["radar", { globe: true, flat: true, azimuthal: false }],
  ["goesCloud", { globe: true, flat: false, azimuthal: false }],
  ["ducting", { globe: true, flat: false, azimuthal: false }],
  ["sporadicE", { globe: true, flat: false, azimuthal: false }],
] as const;

describe("hero layer × projection truth (#625)", () => {
  it.each(
    HERO_LAYER_TRUTH.flatMap(([layer, expected]) =>
      VIEW_MODES.map((projection) => ({
        layer,
        projection,
        available: expected[projection],
      })),
    ),
  )("$layer on $projection → $available", ({ layer, projection, available }) => {
    expect(getLayerAvailability(layer, projection).available).toBe(available);
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
      layers: ["spots", "terminator"] as const,
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
});

describe("formatHeroProjectionChip", () => {
  it("is silent when preferred already draws the set", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["radar"], "flat"),
        "flat",
      ),
    ).toBeUndefined();
  });

  it("explains a flat → globe switch for DRAP", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["drap"], "flat"),
        "flat",
      ),
    ).toBe(
      "Switched to 3D globe because the flat map cannot draw DRAP",
    );
  });

  it("lists every layer that forced the switch", () => {
    expect(
      formatHeroProjectionChip(
        resolveHeroProjection(["drap", "goesCloud", "ducting"], "flat"),
        "flat",
      ),
    ).toBe(
      "Switched to 3D globe because the flat map cannot draw DRAP, GOES, and ducting",
    );
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
