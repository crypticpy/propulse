import { describe, expect, it } from "vitest";

import { applyIdentitySave } from "./applyIdentitySave";
import type { UserStation } from "@/types/user";

const baseOptions = {
  createId: () => "new-home-id",
  now: () => "2026-01-01T00:00:00.000Z",
};

describe("applyIdentitySave", () => {
  it("mirrors the retained active location, not the new Home, when adding a Home", () => {
    const portable: UserStation = {
      callsign: "N5XXX",
      homeLocationId: "",
      activeLocationId: "portable-1",
      savedLocations: [
        {
          id: "portable-1",
          name: "Field Day Site",
          grid: "EM10AA",
          lat: 30.0,
          lon: -97.5,
          type: "other",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      grid: "",
      lat: 0,
      lon: 0,
    };

    const result = applyIdentitySave(
      portable,
      { callsign: "N5XXX", operatorName: "", grid: "EM12BB" },
      baseOptions,
    );

    expect(result).not.toBeNull();
    // Active location is retained and still active.
    expect(result?.activeLocationId).toBe("portable-1");
    // Legacy mirrors follow the retained active location, not the new Home.
    expect(result?.grid).toBe("EM10AA");
    expect(result?.lat).toBe(30.0);
    expect(result?.lon).toBe(-97.5);
    // The new Home was still created and saved.
    expect(result?.homeLocationId).toBe("new-home-id");
    expect(result?.savedLocations).toHaveLength(2);
  });

  it("mirrors the new Home when there is no other active location", () => {
    const station: UserStation = {
      callsign: "N5XXX",
      homeLocationId: "",
      activeLocationId: null,
      savedLocations: [],
      grid: "",
      lat: 0,
      lon: 0,
    };

    const result = applyIdentitySave(
      station,
      { callsign: "N5XXX", operatorName: "", grid: "EM12BB" },
      baseOptions,
    );

    expect(result?.grid).toBe("EM12BB");
    expect(result?.homeLocationId).toBe("new-home-id");
  });

  it("blanks the saved Home's grid when the locator is cleared, keeping lat/lon", () => {
    const station: UserStation = {
      callsign: "N5XXX",
      homeLocationId: "home-1",
      activeLocationId: null,
      savedLocations: [
        {
          id: "home-1",
          name: "Home",
          grid: "EM12BB",
          lat: 30.1,
          lon: -97.6,
          type: "home",
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ],
      grid: "EM12BB",
      lat: 30.1,
      lon: -97.6,
    };

    const result = applyIdentitySave(
      station,
      { callsign: "N5XXX", operatorName: "", grid: "" },
      baseOptions,
    );

    expect(result?.grid).toBe("");
    const home = result?.savedLocations.find((loc) => loc.id === "home-1");
    expect(home?.grid).toBe("");
    expect(home?.lat).toBe(30.1);
    expect(home?.lon).toBe(-97.6);
  });
});
