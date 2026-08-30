import { describe, expect, it } from "vitest";

import { blendPOpen, computePhysicsBandScores } from "../collectors/forecastSnapshot.js";
import { buildLitFracPhysics, PHYSICS_BASIS } from "./physicsArm.js";

// 03:00Z equinox: East Asia in daylight, North America in darkness — the
// exact hour the v1 global mean fired false surprises on the high bands.
const T_03Z = Date.UTC(2026, 2, 20, 3, 0);

describe("buildLitFracPhysics", () => {
  // sfi 180: 10m day = Excellent (0.9), night = Poor (0.2) — max contrast.
  const arm = buildLitFracPhysics(2, 180, T_03Z);

  it("carries the P1 basis string", () => {
    expect(arm.basis).toBe(PHYSICS_BASIS);
    expect(PHYSICS_BASIS).toBe("continent-litfrac-v1");
  });

  it("scores a daylit continent above a dark one on a day band", () => {
    // 10m at kp=2 sfi=180: day Excellent (0.9), night Poor (0.2).
    expect(arm.fLitFor("regional", "AS")).toBeGreaterThan(0.8);
    expect(arm.fLitFor("regional", "NA")).toBeLessThan(0.2);
    expect(arm.scoreFor("regional", "AS", "10m")).toBeGreaterThan(0.7);
    expect(arm.scoreFor("regional", "NA", "10m")).toBeLessThan(0.35);
  });

  it("flips the ordering on a night band", () => {
    // 160m: day Poor (0.2), night Good (0.7) — dark NA beats daylit AS.
    expect(arm.scoreFor("regional", "NA", "160m")).toBeGreaterThan(
      arm.scoreFor("regional", "AS", "160m"),
    );
  });

  it("blends the global scope by the planetary lit fraction", () => {
    const score = computePhysicsBandScores(2, 180).find(
      (s) => s.band === "10m",
    )!;
    expect(arm.scoreFor("global", "", "10m")).toBeCloseTo(
      blendPOpen(score, arm.fLitFor("global", "")),
      10,
    );
  });

  it("falls back to the global fraction for continents without anchors", () => {
    expect(arm.fLitFor("regional", "AN")).toBe(arm.fLitFor("global", ""));
    expect(arm.scoreFor("regional", "AN", "20m")).toBe(
      arm.scoreFor("global", "", "20m"),
    );
  });

  it("returns 0 for unknown bands", () => {
    expect(arm.scoreFor("global", "", "2m")).toBe(0);
  });
});
