import { describe, expect, it } from "vitest";
import { migrateLegacyKioskPins } from "./legacyKioskMigration";

function scene(id: string, hamclock: unknown) {
  return {
    id, name: "Operator name", route: "/map", enabled: false,
    durationSec: 45, transition: "cut", unknown: { keep: true },
    map: { layoutMode: "hamclock", viewMode: "flat", hamclock },
  };
}

describe("captured legacy kiosk pin migration", () => {
  it.each([0, 1, 2, 3, 4, 5])("replays shipped pin replacement at v%s without replacing scene edits", (version) => {
    const scenes = [
      scene("default-wall", { leftPage: 2, rightPage: 1, theme: "brass" }),
      scene("default-hamclock-weather", { leftPage: 0 }),
      scene("custom", { leftPage: 1, rightPage: 4, theme: "classic" }),
    ];
    const result = migrateLegacyKioskPins({ version, state: { scenes } });
    expect(result.scenes).toEqual([
      { ...scenes[0], map: { ...scenes[0].map, hamclock: { leftPage: "spots", rightPage: "spots" } } },
      { ...scenes[1], map: { ...scenes[1].map, hamclock: { leftPage: "weather", rightPage: "weather" } } },
      { ...scenes[2], map: { ...scenes[2].map, hamclock: { leftPage: "solar", rightPage: "sdr", theme: "classic" } } },
    ]);
  });

  it("preserves explicit v6 default-scene pins while translating both rails", () => {
    const result = migrateLegacyKioskPins({ version: 6, state: {
      scenes: [scene("default-wall", { leftPage: 2, rightPage: 3, theme: "brass" })],
    } });
    expect(result.scenes).toEqual([scene("default-wall", { leftPage: "forecast", rightPage: "weather", theme: "brass" })]);
  });

  it.each([
    [0, "spots"], [1, "solar"], [2, "forecast"], [3, "weather"], [4, "sdr"],
    [5, "spots"], [12, "forecast"], [-1, "spots"], [1.5, "spots"],
    [NaN, "spots"], [Infinity, "spots"],
  ])("matches the historical clamp/modulo rule for numeric pin %s", (index, expected) => {
    const result = migrateLegacyKioskPins({ version: 6, state: {
      scenes: [scene("custom", { leftPage: index, rightPage: index })],
    } });
    expect(result.scenes).toEqual([scene("custom", { leftPage: expected, rightPage: expected })]);
  });

  it("leaves v7 pin values for outer validation rather than reinterpreting numeric data", () => {
    const original = { version: 7, state: { scenes: [scene("default-wall", { leftPage: 2, rightPage: "weather" })] } };
    expect(migrateLegacyKioskPins(original)).toEqual(original.state);
  });

  it("does not add missing scenes, map configuration, or absent pins", () => {
    const state = { scenes: [{ id: "default-wall" }, scene("custom", undefined), null, "invalid"] };
    expect(migrateLegacyKioskPins({ version: 5, state })).toEqual(state);
    expect(migrateLegacyKioskPins({ version: 0, state: { scenes: [] } })).toEqual({ scenes: [] });
    expect(migrateLegacyKioskPins(undefined)).toEqual({});
  });

  it("treats unversioned captured state as legacy and preserves unknown data without aliasing", () => {
    const original = {
      scenes: [scene("custom", { rightPage: 3, extension: { kept: true } })],
      rotation: { enabled: true, intervalSec: 90 }, unknown: { nested: ["kept"] },
    };
    const backup = structuredClone(original);
    const result = migrateLegacyKioskPins(original);
    expect(result.scenes).toEqual([scene("custom", { rightPage: "weather", extension: { kept: true } })]);
    expect(result.rotation).toEqual(original.rotation);
    expect(result.unknown).toEqual(original.unknown);
    expect(result.unknown).not.toBe(original.unknown);
    (result.unknown as { nested: string[] }).nested.push("new");
    (result.scenes as ReturnType<typeof scene>[])[0].unknown.keep = false;
    expect(original).toEqual(backup);
  });
});
