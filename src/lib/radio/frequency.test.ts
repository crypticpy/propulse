import { expect, it } from "vitest";
import { parseFrequencyKHz } from "./frequency";

it.each([
  ["7.074", 7074], [" 14.074 MHz ", 14074], ["7074.125 kHz", 7074.125],
  ["7074125 Hz", 7074.125], [".475", 475],
] as const)("interprets the units in %s", (input, expected) => {
  expect(parseFrequencyKHz(input)).toBeCloseTo(expected, 8);
});
it.each(["", "-7.074", "14.074 / 7.074", "7.074foo", "Infinity", "0", "1e6", "99999999999999999999"])("rejects ambiguous or invalid input %s", (input) => {
  expect(parseFrequencyKHz(input)).toBeNaN();
});
