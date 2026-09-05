import { expect, it } from "vitest";
import { readHomePreferences } from "./useHomePreferences";
it("isolates desktop pins from mobile and drops unknown or duplicate widget IDs", () => {
  expect(readHomePreferences(JSON.stringify({ desktop: ["moon", "moon", "invented"], mobile: ["clocks"] }))).toEqual({ desktop: ["moon"], mobile: ["clocks"] });
  expect(readHomePreferences('{broken')).toEqual({ desktop: [], mobile: [] });
  expect(readHomePreferences(JSON.stringify({desktop:["moon"]})).mobile).toEqual([]);
});
