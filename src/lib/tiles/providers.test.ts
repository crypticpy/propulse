import { describe, expect, it } from "vitest";

import {
  selectAvailableTileProvider,
  selectTileProvider,
} from "./providers";

describe("selectTileProvider with tileProviderId", () => {
  it("honours a matching provider id ahead of the tier default", () => {
    expect(selectTileProvider("standard", "free", "carto-dark").id).toBe(
      "carto-dark",
    );
    expect(selectTileProvider("satellite", "pro", "esri-world").id).toBe(
      "esri-world",
    );
  });

  it("falls back to the tier default when the id belongs to the other style bucket", () => {
    // carto-dark is a "standard" provider — requesting it under "satellite"
    // is a stale choice from before a style switch, not a valid selection.
    expect(selectTileProvider("satellite", "free", "carto-dark").id).toBe(
      "esri-world",
    );
    expect(selectTileProvider("standard", "pro", "mapbox-satellite").id).toBe(
      "osm",
    );
  });

  it("falls back to the tier default when the id requires Pro and the tier is free", () => {
    expect(
      selectTileProvider("satellite", "free", "mapbox-satellite").id,
    ).toBe("esri-world");
  });

  it("falls back to the tier default when no id is given", () => {
    expect(selectTileProvider("standard", "free", null).id).toBe("osm");
    expect(selectTileProvider("satellite", "pro").id).toBe(
      "mapbox-satellite",
    );
  });
});

describe("selectAvailableTileProvider", () => {
  const requested = selectTileProvider("satellite", "pro");

  it("uses the requested provider while it remains available", () => {
    expect(selectAvailableTileProvider(requested, new Set())?.id).toBe(
      "mapbox-satellite",
    );
  });

  it("settles on the static surface after requested and fallback fail", () => {
    expect(
      selectAvailableTileProvider(requested, new Set(["mapbox-satellite"]))
        ?.id,
    ).toBe("esri-world");
    expect(
      selectAvailableTileProvider(
        requested,
        new Set(["mapbox-satellite", "esri-world"]),
      ),
    ).toBeNull();
  });
});
