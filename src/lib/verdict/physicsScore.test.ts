import { describe, expect, it } from "vitest";

import { calculateBandConditions } from "@/lib/utils/bands";
import {
  CONDITION_SCORE,
  PATH_STATUS_SCORE,
  bandPhysicsScores,
  pathPhysicsScores,
  stationPhysicsScores,
} from "@/lib/verdict/physicsScore";

const KP = 2;
const SFI = 150;
const DATE = new Date("2026-08-29T15:00:00Z");
const NEW_YORK = { lat: 40.7, lon: -74.0 };
const LONDON = { lat: 51.5, lon: -0.1 };

describe("stationPhysicsScores", () => {
  it("maps the kp/sfi table exactly as the v1 word table did", () => {
    const day = stationPhysicsScores(KP, SFI, true);
    for (const status of calculateBandConditions(KP, SFI)) {
      expect(day.get(status.name)).toBe(CONDITION_SCORE[status.dayCondition]);
    }
    const night = stationPhysicsScores(KP, SFI, false);
    for (const status of calculateBandConditions(KP, SFI)) {
      expect(night.get(status.name)).toBe(
        CONDITION_SCORE[status.nightCondition],
      );
    }
  });

  it("covers all 11 bands in display order", () => {
    const scores = stationPhysicsScores(KP, SFI, true);
    expect([...scores.keys()]).toEqual([
      "160m", "80m", "60m", "40m", "30m",
      "20m", "17m", "15m", "12m", "10m", "6m",
    ]);
  });
});

describe("pathPhysicsScores", () => {
  it("scores the 10 HF path bands with the path-status vocabulary", () => {
    const scores = pathPhysicsScores(NEW_YORK, LONDON, KP, SFI, DATE);
    expect(scores.size).toBe(10);
    expect(scores.has("6m")).toBe(false);
    const allowed = new Set(Object.values(PATH_STATUS_SCORE));
    for (const score of scores.values()) {
      expect(allowed.has(score)).toBe(true);
    }
  });
});

describe("bandPhysicsScores", () => {
  it("falls back to the station table when no target exists", () => {
    const scores = bandPhysicsScores({
      kp: KP,
      sfi: SFI,
      isDaylight: true,
      home: NEW_YORK,
      date: DATE,
    });
    expect(scores).toEqual(stationPhysicsScores(KP, SFI, true));
  });

  it("overrides HF bands with path scores but keeps 6m on the station table", () => {
    const merged = bandPhysicsScores({
      kp: KP,
      sfi: SFI,
      isDaylight: true,
      home: NEW_YORK,
      target: LONDON,
      date: DATE,
    });
    const path = pathPhysicsScores(NEW_YORK, LONDON, KP, SFI, DATE);
    const station = stationPhysicsScores(KP, SFI, true);

    for (const [band, score] of path) {
      expect(merged.get(band)).toBe(score);
    }
    expect(merged.get("6m")).toBe(station.get("6m"));
    // Display order survives the override
    expect([...merged.keys()]).toEqual([...station.keys()]);
  });

  it("keeps every score in [0, 1]", () => {
    const merged = bandPhysicsScores({
      kp: 7,
      sfi: 75,
      isDaylight: false,
      home: NEW_YORK,
      target: { lat: -33.9, lon: 151.2 }, // Sydney — long path, low SFI
      date: DATE,
    });
    for (const score of merged.values()) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
