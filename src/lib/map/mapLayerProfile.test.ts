import { describe, expect, it } from "vitest";
import { AZIMUTHAL_LAYER_PROFILE, FLAT_LAYER_PROFILE } from "./mapLayerProfile";

describe("MapLayerProfile", () => {
  it("carries the same field set on both profiles", () => {
    expect(Object.keys(FLAT_LAYER_PROFILE).sort()).toEqual(
      Object.keys(AZIMUTHAL_LAYER_PROFILE).sort(),
    );
  });

  it("has an id string and every other value a finite number", () => {
    for (const profile of [FLAT_LAYER_PROFILE, AZIMUTHAL_LAYER_PROFILE]) {
      for (const [key, value] of Object.entries(profile)) {
        if (key === "id") {
          expect(typeof value).toBe("string");
        } else {
          expect(typeof value).toBe("number");
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it("ids identify the flat map and the azimuthal disc", () => {
    expect(FLAT_LAYER_PROFILE.id).toBe("flat");
    expect(AZIMUTHAL_LAYER_PROFILE.id).toBe("azimuthal");
  });
});
