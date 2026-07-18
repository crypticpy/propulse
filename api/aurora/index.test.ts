import { describe, expect, it } from "vitest";
import { compactAuroraPayload } from "./index";

describe("aurora payload compaction", () => {
  it("keeps only coordinates the renderer can display", () => {
    expect(
      compactAuroraPayload({
        "Observation Time": "observed",
        "Forecast Time": "forecast",
        coordinates: [
          [10, 60, 0],
          [20, 65, 9],
          [30, 70, 10],
          [40, 75, 80],
          ["bad", 1, 99],
        ],
      }),
    ).toEqual({
      "Observation Time": "observed",
      "Forecast Time": "forecast",
      coordinates: [
        [30, 70, 10],
        [40, 75, 80],
      ],
    });
  });
});
