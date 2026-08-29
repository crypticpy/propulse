import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  brierScore,
  buildClimatology,
  densifyTruth,
  evaluateForecasts,
  hourOfDay,
  nearestRankPercentile,
  reliabilityBins,
  renderReport,
  skillScore,
} from "./forecast-eval-core.mjs";

describe("nearestRankPercentile", () => {
  it("returns nearest-rank values", () => {
    const values = [15, 20, 35, 40, 50];
    assert.equal(nearestRankPercentile(values, 30), 20);
    assert.equal(nearestRankPercentile(values, 50), 35);
    assert.equal(nearestRankPercentile(values, 100), 50);
    assert.equal(nearestRankPercentile(values, 1), 15);
  });

  it("returns null for empty input and does not mutate", () => {
    assert.equal(nearestRankPercentile([], 50), null);
    const values = [3, 1, 2];
    nearestRankPercentile(values, 50);
    assert.deepEqual(values, [3, 1, 2]);
  });
});

describe("densifyTruth", () => {
  it("adds zero rows for missing bands in aggregated hours only", () => {
    const dense = densifyTruth(
      [
        { hour_utc: "2026-08-29T10:00:00Z", band: "20m", spot_count: 50 },
        { hour_utc: "2026-08-29T11:00:00Z", band: "40m", spot_count: 30 },
      ],
      ["20m", "40m"],
    );
    assert.equal(dense.length, 4);
    const added = dense.find(
      (r) => r.hour_utc === "2026-08-29T10:00:00Z" && r.band === "40m",
    );
    assert.equal(added?.spot_count, 0);
  });
});

describe("buildClimatology", () => {
  it("floors thresholds at minSpots and derives open-rate under it", () => {
    // 4 samples for 20m at hod 10: [0, 0, 10, 20], P25 -> 0, floored to 5
    const rows = [0, 0, 10, 20].map((spot_count, i) => ({
      hour_utc: `2026-08-${String(10 + i).padStart(2, "0")}T10:00:00Z`,
      band: "20m",
      spot_count,
    }));
    const clim = buildClimatology(rows, { percentile: 25, minSpots: 5 });
    assert.equal(clim.threshold("20m", 10), 5);
    assert.equal(clim.climForecast("20m", 10), 0.5);
    assert.equal(clim.sampleCount("20m", 10), 4);
    assert.equal(clim.threshold("20m", 11), undefined);
  });
});

describe("brierScore / skillScore / reliabilityBins", () => {
  it("scores perfect, worst and uniform forecasts", () => {
    assert.equal(
      brierScore([
        { p: 1, outcome: true },
        { p: 0, outcome: false },
      ]),
      0,
    );
    assert.equal(
      brierScore([
        { p: 0, outcome: true },
        { p: 1, outcome: false },
      ]),
      1,
    );
    assert.equal(brierScore([{ p: 0.5, outcome: true }]), 0.25);
    assert.equal(brierScore([]), null);
  });

  it("computes skill relative to a reference", () => {
    assert.ok(Math.abs(skillScore(0.1, 0.2) - 0.5) < 1e-12);
    assert.ok(Math.abs(skillScore(0.3, 0.2) - -0.5) < 1e-12);
    assert.equal(skillScore(null, 0.2), null);
    assert.equal(skillScore(0.1, 0), null);
  });

  it("bins pairs by forecast probability, clamping p=1 into the top bin", () => {
    const bins = reliabilityBins(
      [
        { p: 0.05, outcome: false },
        { p: 0.05, outcome: true },
        { p: 1, outcome: true },
      ],
      10,
    );
    assert.equal(bins[0].n, 2);
    assert.equal(bins[0].observedFreq, 0.5);
    assert.ok(Math.abs(bins[0].meanForecast - 0.05) < 1e-12);
    assert.equal(bins[9].n, 1);
    assert.equal(bins[9].observedFreq, 1);
  });
});

describe("evaluateForecasts", () => {
  const nowMs = Date.parse("2026-08-29T12:00:00Z");

  function syntheticData() {
    // 12 baseline days, one hour-of-day (10:00 UTC), one band.
    // Even days busy (100 spots), odd days dead (0) -> clim p_open = 0.5.
    // With a 12-day window (cutoff Aug 17 12:00Z), days 10-17 are held-out
    // training and days 18-21 are the evaluation window.
    const truth = [];
    for (let day = 10; day < 22; day++) {
      truth.push({
        hour_utc: `2026-08-${day}T10:00:00.000Z`,
        band: "20m",
        spot_count: day % 2 === 0 ? 100 : 0,
      });
    }
    // Perfect physics forecaster over the evaluation days
    const snapshots = [];
    for (let day = 18; day < 22; day++) {
      snapshots.push({
        hour_utc: `2026-08-${day}T10:00:00.000Z`,
        band: "20m",
        source: "physics",
        horizon_hours: 0,
        p_open: day % 2 === 0 ? 1 : 0,
      });
    }
    return { truth, snapshots };
  }

  it("gives a perfect forecaster Brier 0 and positive skill vs climatology", () => {
    const { truth, snapshots } = syntheticData();
    const results = evaluateForecasts({
      snapshots,
      truth,
      nowMs,
      windowsDays: [12],
    });

    const [window] = results.windows;
    // Only the 8 pre-window days train the climatology (held out).
    assert.equal(window.trainingHours, 8);
    assert.equal(window.sources.length, 1);
    const physics = window.sources[0];
    assert.equal(physics.source, "physics");
    assert.equal(physics.n, 4);
    assert.equal(physics.baseRate, 0.5);
    assert.equal(physics.brier, 0);
    assert.equal(physics.brierClim, 0.25);
    assert.equal(physics.skillVsClim, 1);
    assert.equal(physics.skillVsPhysics, null);
    assert.equal(physics.perBand["20m"].n, 4);
  });

  it("only evaluates snapshots whose hour has ground truth and is in window", () => {
    const { truth, snapshots } = syntheticData();
    snapshots.push({
      hour_utc: "2026-08-29T11:00:00.000Z", // hour never aggregated
      band: "20m",
      source: "physics",
      horizon_hours: 0,
      p_open: 0.9,
    });
    const results = evaluateForecasts({
      snapshots,
      truth,
      nowMs,
      windowsDays: [2], // only days 27+ -> none of the day 18-21 snapshots
    });
    assert.equal(results.windows[0].sources.length, 0);
  });

  it("scores a non-physics source against physics on shared keys", () => {
    const { truth, snapshots } = syntheticData();
    for (const snap of [...snapshots]) {
      snapshots.push({ ...snap, source: "nowcast", p_open: 0.5 });
    }
    const results = evaluateForecasts({
      snapshots,
      truth,
      nowMs,
      windowsDays: [12],
    });
    const nowcast = results.windows[0].sources.find(
      (s) => s.source === "nowcast",
    );
    assert.equal(nowcast.brier, 0.25);
    // physics is perfect (Brier 0) on the same keys -> skill undefined (ref 0)
    assert.equal(nowcast.skillVsPhysics, null);
    assert.equal(nowcast.skillVsClim, 0);
  });

  it("reports percentile sensitivity for the physics source", () => {
    const { truth, snapshots } = syntheticData();
    const results = evaluateForecasts({
      snapshots,
      truth,
      nowMs,
      windowsDays: [12],
    });
    assert.equal(results.sensitivity.length, 3);
    for (const row of results.sensitivity) {
      assert.equal(row.n, 4);
      assert.equal(row.brier, 0);
    }
  });

  it("holds evaluated hours out of the threshold fit", () => {
    // All truth inside the evaluation window -> no training rows at all;
    // thresholds must fall back to minSpots instead of learning from the
    // outcomes being evaluated.
    const { truth, snapshots } = syntheticData();
    const results = evaluateForecasts({
      snapshots,
      truth,
      nowMs,
      windowsDays: [30],
    });
    const [window] = results.windows;
    assert.equal(window.trainingHours, 0);
    // With pClim ?? 0 the climatology reference scores its own miss rate.
    const physics = window.sources[0];
    assert.equal(physics.n, 4);
    assert.equal(physics.brier, 0);
    assert.equal(physics.brierClim, 0.5);
  });
});

describe("renderReport", () => {
  it("includes coverage, outcome definition, and per-window tables", () => {
    const nowMs = Date.parse("2026-08-29T12:00:00Z");
    const truth = [
      { hour_utc: "2026-08-28T10:00:00.000Z", band: "20m", spot_count: 100 },
      { hour_utc: "2026-08-29T10:00:00.000Z", band: "20m", spot_count: 100 },
    ];
    const snapshots = [
      {
        hour_utc: "2026-08-29T10:00:00.000Z",
        band: "20m",
        source: "physics",
        horizon_hours: 0,
        p_open: 0.8,
      },
    ];
    const results = evaluateForecasts({ snapshots, truth, nowMs });
    const report = renderReport(results, {
      generatedAt: "2026-08-29T12:00:00.000Z",
      snapshotHours: 1,
      truthHours: 2,
      baselineDays: 90,
    });

    assert.match(report, /# Forecast evaluation — 2026-08-29/);
    assert.match(report, /## Data coverage/);
    assert.match(report, /max\(5, P25/);
    assert.match(report, /held-out/);
    assert.match(report, /## 7-day window/);
    assert.match(report, /## 30-day window/);
    assert.match(report, /\| physics \| 0h \| 1 \|/);
  });
});
