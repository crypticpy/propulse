import { describe, expect, it } from "vitest";

import {
  selectAvailableTileProvider,
  selectTileProvider,
} from "./providers";

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
