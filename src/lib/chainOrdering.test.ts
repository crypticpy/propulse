import { describe, expect, it } from "vitest";
import {
  getValidEquipmentTypes,
  validateChain,
} from "@/lib/chainOrdering";

describe("explicit path insertion catalog", () => {
  it("keeps filter and tuner available between a feedline and an antenna", () => {
    const labels = getValidEquipmentTypes().map((option) => option.label);
    expect(labels).toEqual([
      "Radio",
      "Amplifier",
      "Tuner",
      "Filter",
      "Switch",
      "Feedline",
      "Antenna",
    ]);
  });

  it("still surfaces ordering warnings instead of hiding the arrangement", () => {
    const warnings = validateChain(
      [
        { type: "feedline_run", feedlineRunId: "run" },
        { type: "radio", radioId: "radio" },
        { type: "antenna", antennaId: "antenna" },
      ],
      () => null,
    );
    expect(warnings.map((warning) => warning.code)).toContain("radio_not_first");
  });
});
