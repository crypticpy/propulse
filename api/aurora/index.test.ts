import { describe, expect, it } from "vitest";
import { compactAuroraPayload } from "../_lib/handlers/aurora";

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
          [50, 80, 99, 1],
          [60, 80, Number.POSITIVE_INFINITY],
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
