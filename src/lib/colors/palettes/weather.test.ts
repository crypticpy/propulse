import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { WeatherLegend } from "@/components/atmos/WeatherLegend";
import type { StormCategory } from "@/lib/api/tropical";
import type { WeatherAlert } from "@/lib/api/weather";
import {
  ALERT_SEVERITY_COLORS,
  ATMOS_ALERT_SEVERITY_COLORS,
  ATMOS_RIVER_STATUS_HEX,
  ATMOS_STORM_CATEGORY_HEX,
  ATMOS_STORM_LEGEND_ENTRIES,
  ATMOS_WEATHER_LEGEND_ENTRIES,
  EQ_MAGNITUDE_COLORS,
  RIVER_LEGEND_ENTRIES,
  RIVER_STATUS_HEX,
  STORM_CATEGORY_HEX,
  STORM_LEGEND_ENTRIES,
  WEATHER_LEGEND_ENTRIES,
  getAtmosStormColor,
  getEarthquakeMagnitudeColor,
  getWeatherSeverityColor,
  getWeatherSeverityTint,
} from "./weather";

vi.mock("@/stores/atmosStore", () => ({
  useAtmosStore: (selector: (state: unknown) => unknown) =>
    selector({
      layerVisibility: { alerts: true, tropical: true },
    }),
}));

describe("weather and seismic palette preservation", () => {
  it.each([
    [-Infinity, "#88cc44"],
    [-1, "#88cc44"],
    [0, "#88cc44"],
    [3.999999, "#88cc44"],
    [4, "#ffcc00"],
    [4.999999, "#ffcc00"],
    [5, "#ff8800"],
    [6.999999, "#ff8800"],
    [7, "#ff2020"],
    [10, "#ff2020"],
    [Infinity, "#ff2020"],
    [NaN, "#88cc44"],
  ])("preserves magnitude %s as %s", (magnitude, color) => {
    expect(getEarthquakeMagnitudeColor(magnitude as number)).toBe(color);
  });

  it("preserves descending inclusive magnitude stops and labels", () => {
    expect(EQ_MAGNITUDE_COLORS).toEqual([
      { minMagnitude: 7, label: "M7+", color: "#ff2020" },
      { minMagnitude: 5, label: "M5–7", color: "#ff8800" },
      { minMagnitude: 4, label: "M4–5", color: "#ffcc00" },
      { minMagnitude: -Infinity, label: "<M4", color: "#88cc44" },
    ]);
  });

  it.each([
    { severity: "Extreme", hex: "#ff0040", channels: "255, 0, 64" },
    { severity: "Severe", hex: "#ff6600", channels: "255, 102, 0" },
    { severity: "Moderate", hex: "#ffaa00", channels: "255, 170, 0" },
    { severity: "Minor", hex: "#ffdd44", channels: "255, 221, 68" },
    { severity: "Unknown", hex: "#ffdd44", channels: "255, 221, 68" },
  ])(
    "preserves $severity colors and both map UI tint contexts",
    ({ severity, hex, channels }) => {
      const value = severity as WeatherAlert["severity"];
      expect(getWeatherSeverityColor(value)).toBe(hex);
      expect(getWeatherSeverityTint(value, "modal")).toBe(
        `rgba(${channels}, 0.15)`,
      );
      expect(getWeatherSeverityTint(value, "flyout")).toBe(
        `rgba(${channels}, 0.2)`,
      );
      expect(getWeatherSeverityColor(value, "atmos")).toBe(
        severity === "Unknown" ? "#888888" : hex,
      );
      expect(ATMOS_ALERT_SEVERITY_COLORS[value]).toBe(
        getWeatherSeverityColor(value, "atmos"),
      );
    },
  );

  it("retains missing-severity fallback contexts without adding a map Unknown legend bucket", () => {
    const invalid = "unexpected imported value" as WeatherAlert["severity"];
    expect(getWeatherSeverityColor(invalid)).toBe("#ffdd44");
    expect(getWeatherSeverityColor(invalid, "atmos")).toBe("#888888");
    expect(Object.keys(ALERT_SEVERITY_COLORS)).toEqual([
      "Extreme",
      "Severe",
      "Moderate",
      "Minor",
    ]);
  });

  it("preserves distinct cyclone and river contexts rather than unifying their hues", () => {
    expect(STORM_CATEGORY_HEX).toEqual({
      TD: "#3b82f6",
      TS: "#eab308",
      "1": "#f97316",
      "2": "#f97316",
      "3": "#ef4444",
      "4": "#dc2626",
      "5": "#991b1b",
    });
    expect(ATMOS_STORM_CATEGORY_HEX).toEqual({
      TD: "#3b82f6",
      TS: "#eab308",
      "1": "#f97316",
      "2": "#f97316",
      "3": "#ef4444",
      "4": "#ef4444",
      "5": "#ef4444",
    });
    for (const category of ["TD", "TS", "1", "2", "3", "4", "5"] as const) {
      expect(getAtmosStormColor(category)).toBe(
        ATMOS_STORM_CATEGORY_HEX[category],
      );
    }
    for (const unknown of ["unexpected", "constructor", "__proto__"]) {
      expect(getAtmosStormColor(unknown as StormCategory)).toBe("#ef4444");
    }
    expect(RIVER_STATUS_HEX).toEqual({
      normal: "#22c55e",
      action: "#eab308",
      minor: "#f97316",
      moderate: "#ef4444",
      major: "#991b1b",
    });
    expect(ATMOS_RIVER_STATUS_HEX).toEqual({
      normal: "#3b82f6",
      action: "#eab308",
      minor: "#f97316",
      moderate: "#ef4444",
      major: "#dc2626",
    });
  });

  it("preserves each legend's ordering and category grouping", () => {
    expect(WEATHER_LEGEND_ENTRIES.map((row) => row.label)).toEqual([
      "Extreme",
      "Severe",
      "Moderate",
      "Minor",
    ]);
    expect(ATMOS_WEATHER_LEGEND_ENTRIES.map((row) => row.text)).toEqual([
      "Minor",
      "Moderate",
      "Severe",
      "Extreme",
    ]);
    expect(STORM_LEGEND_ENTRIES).toEqual([
      { label: "TD", color: "#3b82f6" },
      { label: "TS", color: "#eab308" },
      { label: "Cat 1–2", color: "#f97316" },
      { label: "Cat 3", color: "#ef4444" },
      { label: "Cat 4", color: "#dc2626" },
      { label: "Cat 5", color: "#991b1b" },
    ]);
    expect(ATMOS_STORM_LEGEND_ENTRIES).toEqual([
      { text: "TD", color: "#3b82f6" },
      { text: "TS", color: "#eab308" },
      { text: "Cat 1-2", color: "#f97316" },
      { text: "Cat 3-5", color: "#ef4444" },
    ]);
    expect(RIVER_LEGEND_ENTRIES.map((row) => row.label)).toEqual([
      "Normal",
      "Action",
      "Minor flood",
      "Moderate flood",
      "Major flood",
    ]);
  });

  it("renders Atmos alert legend swatches using the actual marker colors", () => {
    render(createElement(WeatherLegend));
    for (const [label, color] of [
      ["Minor", "rgb(255, 221, 68)"],
      ["Moderate", "rgb(255, 170, 0)"],
      ["Severe", "rgb(255, 102, 0)"],
      ["Extreme", "rgb(255, 0, 64)"],
    ]) {
      const swatch = screen.getByText(label)
        .previousElementSibling as HTMLElement;
      expect(swatch.style.backgroundColor).toBe(color);
    }
    expect(screen.queryByText("Unknown")).toBeNull();
    expect(screen.getByText("Cat 3-5")).toBeTruthy();
  });

  it("keeps the palette free of runtime renderer or API imports", () => {
    const source = readFileSync(
      resolve("src/lib/colors/palettes/weather.ts"),
      "utf8",
    );
    const parsed = ts.createSourceFile(
      "weather.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of parsed.statements) {
      if (ts.isImportDeclaration(statement))
        expect(statement.importClause?.isTypeOnly).toBe(true);
    }
  });
});
