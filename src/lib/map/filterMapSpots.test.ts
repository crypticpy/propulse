import { expect, it } from "vitest";
import { filterMapSpots } from "./filterMapSpots";

it("filters band and mode before display density is applied, without removing analysis reports", () => {
  const spots = [
    { band: "40m", mode: "FT8" },
    { band: "20m", mode: "CW" },
    { band: "20m", mode: "FT8" },
    { band: "20m", mode: "FT8" },
  ];
  expect(filterMapSpots(spots, { bands: [], modes: [] })).toBe(spots);
  expect(
    filterMapSpots(spots, { bands: ["20M"], modes: ["ft8"] }).slice(0, 1),
  ).toEqual([spots[2]]);
  expect(filterMapSpots(spots, { bands: ["10m"], modes: [] })).toEqual([]);
  expect(spots).toHaveLength(4);
});
