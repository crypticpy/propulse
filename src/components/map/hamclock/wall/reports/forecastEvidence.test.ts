import { expect, it } from "vitest";
import type { PropagationPrediction } from "@/lib/propagation/modelClient";
import { horizonEvidence, modelEvidence, modelWords } from "./forecastEvidence";
const now = Date.parse("2026-09-07T20:05:00Z");
const prediction: PropagationPrediction = {
  band: "20m", target_grid4: "PM95", mode: "FT8", profile: "nowcast",
  issue_time: new Date(now).toISOString(), valid_time: new Date(now).toISOString(),
  core_probability: 0.7, personalized_probability: 0.8, confidence: 0.9,
  model_version: "fixture", feature_contract: "fixture", ood_flags: [], top_factors: [], assumptions: [], data_freshness: {},
};
const context = { band: "20m", targetGrid: "PM95aa", mode: "FT8", hourIndex: Math.floor(now / 3_600_000), now };
it("rejects neighboring scope, time and fallback values instead of comparing them", () => {
  expect(modelEvidence(prediction, context).prediction).toBe(prediction);
  for (const patch of [{ band: "40m" }, { target_grid4: "EM38" }, { mode: "SSB" }, { profile: "physics" }, { valid_time: new Date(now + 3_600_000).toISOString() }, { issue_time: new Date(now - 16 * 60_000).toISOString() }, { confidence: NaN }]) {
    expect(modelEvidence({ ...prediction, ...patch }, context).prediction).toBeNull();
  }
});
it("keeps every horizon visible and never extends the current prediction", () => {
  const rows = horizonEvidence([3], new Map([[3, prediction]]), { ...context, issueTime: now }, "RUNTIME NOT ACTIVATED");
  expect(rows.map(row => row.hours)).toEqual([3, 6, 12, 24]);
  expect(rows[0].reason).toBe("SELECTED HOUR NOT COVERED");
  expect(rows.slice(1).every(row => row.reason === "RUNTIME NOT ACTIVATED")).toBe(true);
  const future = { ...prediction, valid_time: new Date(now + 3 * 3_600_000).toISOString() };
  expect(horizonEvidence([3], new Map([[3, future]]), { ...context, issueTime: now }, "OFF")[0].prediction).toBe(future);
});
it("spells out model flags", () => {
  expect(modelWords(["path_history_stale", "outside-training-range"])).toBe("path history stale · outside training range");
  expect(modelWords([])).toBe("NONE REPORTED");
});
