import { describe, expect, it } from "vitest";
import { buildSolarBriefing, usableEvidence, type BriefingInputs, type SolarEvidence } from "./briefing";
import { buildSolarTrends } from "./trends";
import type { SolarSourceId } from "./contracts";
import { getSolarSourcePolicy } from "./sourcePolicies";
const now = Date.parse("2026-09-04T12:00:00Z");
const stamp = new Date(now).toISOString();
function evidence<T>(sourceId: SolarSourceId, data: T): SolarEvidence<T> {
  return { sourceId, data, state: "fresh", resource: { state: "fresh", cacheOutcome: "network", observationAgeMs: 0, envelope: { schemaVersion: 1, sourceId, product: sourceId, provider: "NOAA", sourceUrl: "https://services.swpc.noaa.gov", observedAt: stamp, fetchedAt: stamp, data } } };
}
function inputs(): BriefingInputs {
  return {
    kp: evidence("noaa-k-index", [{ time_tag: stamp, kp: 2, kind: "estimated", noaa_scale: null, a_running: null }]),
    flux: evidence("noaa-solar-flux", [{ time_tag: stamp, flux: 150, frequency: 2800, schedule: "noon" }]),
    magnetometer: evidence("noaa-magnetometer", [{ time_tag: stamp, bz_gsm: 2, by_gsm: null, bt: 3 }]),
    xray: evidence("noaa-xray", [{ time_tag: stamp, flux: 1e-7, energy: "0.1-0.8nm", satellite: 18 }]),
    scales: evidence("swpc-scales", { observed_at: stamp, radio_blackout: { scale: 0, text: "none" }, solar_radiation: { scale: 0, text: "none" }, geomagnetic_storm: { scale: 0, text: "none" } }),
    alerts: evidence("swpc-alerts", []),
  };
}
describe("HF briefing", () => {
  it("supports background conditions only with complete current impact evidence", () => {
    const result = buildSolarBriefing(inputs(), now);
    expect(result.tone).toBe("supportive");
    expect(result.state).toBe("fresh");
    expect(result.evidence).toHaveLength(6);
    expect(result.statements.every((s) => s.sources.length > 0)).toBe(true);
  });
  it.each(["radio_blackout", "solar_radiation", "geomagnetic_storm"] as const)("prioritizes %s despite supportive background inputs", (kind) => {
    const data = inputs(); data.scales.data![kind].scale = 2;
    const result = buildSolarBriefing(data, now);
    expect(result.tone).toBe("impact");
    expect(result.title).not.toMatch(/Supportive/);
    expect(result.statements[0].kind).toBe("impact");
  });
  it("presents simultaneous impacts without an aggregate score", () => {
    const data = inputs();
    data.scales.data!.radio_blackout.scale = 1;
    data.scales.data!.solar_radiation.scale = 2;
    expect(buildSolarBriefing(data, now).statements.filter((s) => s.kind === "impact")).toHaveLength(2);
  });
  it("surfaces X-ray activity and both timestamps when the scale snapshot differs", () => {
    const data = inputs(); data.xray.data![0].flux = 1e-4;
    data.scales.resource!.envelope.observedAt = new Date(now - 60_000).toISOString();
    const result = buildSolarBriefing(data, now);
    expect(result.tone).toBe("impact");
    expect(result.statements.find((s) => s.id === "different-times")?.sources).toEqual(["noaa-xray", "swpc-scales"]);
    expect(result.evidence.find((e) => e.sourceId === "swpc-scales")?.observedAt).not.toBe(stamp);
  });
  it("never turns a single southward Bz into an observed storm", () => {
    const data = inputs(); data.magnetometer.data![0].bz_gsm = -20;
    const result = buildSolarBriefing(data, now);
    expect(result.tone).not.toBe("impact");
    expect(result.statements.find((s) => s.id === "bz")?.kind).toBe("upstream");
  });
  it("a recent watch is a notice, not evidence of an active event", () => {
    const data = inputs(); data.alerts.data!.push({ product_id: "WATA", issued_at: stamp, title: "Tomorrow", severity: "watch", message: "A future watch" });
    const result = buildSolarBriefing(data, now);
    expect(result.tone).toBe("watch");
    expect(result.statements.find((s) => s.id === "bulletin")?.kind).toBe("notice");
  });
  it("missing, null, stale and expired impact evidence cannot establish an all-clear", () => {
    for (const state of ["unavailable", "stale", "partial"] as const) {
      const data = inputs(); data.scales.state = state;
      const result = buildSolarBriefing(data, now);
      expect(result.state).toBe("partial"); expect(result.tone).toBe("unknown");
    }
    const data = inputs(); data.scales.data!.radio_blackout.scale = null;
    expect(buildSolarBriefing(data, now).missing).toContain("Radio-blackout scale");
  });
  it("rechecks retained query data at the exact hard TTL and uses snapshot freshness policy", () => {
    const data = inputs();
    data.kp.resource!.envelope.observedAt = new Date(now - 2 * 3_600_000).toISOString();
    expect(usableEvidence(data.kp, now).data).toBeDefined();
    const limit = getSolarSourcePolicy("noaa-xray").hardTtlMs;
    expect(usableEvidence(data.xray, now + limit).data).toBeUndefined();
    const result = buildSolarBriefing(data, now + 3 * 86_400_000);
    expect(result.state).toBe("unavailable");
    expect(result.statements).toHaveLength(0);
  });
  it("qualifies coverage when Kp contains only predictions or Bz has only null samples", () => {
    const data = inputs();
    data.kp.data![0].kind = "predicted";
    data.magnetometer.data![0].bz_gsm = null;
    const result = buildSolarBriefing(data, now);
    expect(result.state).toBe("partial");
    expect(result.missing).toEqual(expect.arrayContaining([getSolarSourcePolicy("noaa-k-index").label, getSolarSourcePolicy("noaa-magnetometer").label]));
  });
});
describe("change summaries", () => {
  it("does not report flat conditions when history is sparse or gapped", () => {
    const data = inputs();
    expect(buildSolarTrends(data, now).every((t) => t.summary === "Not enough comparable history")).toBe(true);
    data.magnetometer.data!.unshift({ ...data.magnetometer.data![0], time_tag: new Date(now - 20 * 60_000).toISOString(), bz_gsm: -5 });
    expect(buildSolarTrends(data, now)[2].from).toBeUndefined();
  });
  it("compares non-predicted Kp intervals and preserves the comparison times", () => {
    const data = inputs();
    data.kp.data!.unshift({ ...data.kp.data![0], time_tag: new Date(now - 10_800_000).toISOString(), kp: 1 });
    data.kp.data!.push({ ...data.kp.data![0], time_tag: new Date(now + 10_800_000).toISOString(), kp: 9, kind: "predicted" });
    const result = buildSolarTrends(data, now)[0];
    expect(result.summary).toMatch(/Up 1.0 Kp/); expect(result.to).toBe(stamp);
  });
  it("compares like solar-flux schedules, not unrelated intraday observations", () => {
    const data = inputs();
    data.flux.data!.unshift({ ...data.flux.data![0], time_tag: new Date(now - 86_400_000).toISOString(), flux: 140 });
    data.flux.data!.splice(1, 0, { ...data.flux.data![0], time_tag: new Date(now - 3_600_000).toISOString(), flux: 180, schedule: "morning" });
    expect(buildSolarTrends(data, now)[1].summary).toMatch(/Up 10/);
  });
});
describe("trend tone and series", () => {
  it("colors Kp by disruption risk: rising is danger, falling is success", () => {
    const rising = inputs();
    rising.kp.data!.unshift({ ...rising.kp.data![0], time_tag: new Date(now - 10_800_000).toISOString(), kp: 1 });
    expect(buildSolarTrends(rising, now)[0].tone).toBe("danger");

    const falling = inputs();
    falling.kp.data![0].kp = 1;
    falling.kp.data!.unshift({ ...falling.kp.data![0], time_tag: new Date(now - 10_800_000).toISOString(), kp: 4 });
    expect(buildSolarTrends(falling, now)[0].tone).toBe("success");
  });
  it("colors solar flux by usability: rising is success, falling is warning", () => {
    const rising = inputs();
    rising.flux.data!.unshift({ ...rising.flux.data![0], time_tag: new Date(now - 86_400_000).toISOString(), flux: 140 });
    expect(buildSolarTrends(rising, now)[1].tone).toBe("success");

    const falling = inputs();
    falling.flux.data![0].flux = 140;
    falling.flux.data!.unshift({ ...falling.flux.data![0], time_tag: new Date(now - 86_400_000).toISOString(), flux: 150 });
    expect(buildSolarTrends(falling, now)[1].tone).toBe("warning");
  });
  it("colors Bz by its own sign: swinging southward is danger, northward is success", () => {
    const southward = inputs();
    southward.magnetometer.data!.unshift({ ...southward.magnetometer.data![0], time_tag: new Date(now - 3 * 60_000).toISOString(), bz_gsm: 5 });
    expect(buildSolarTrends(southward, now)[2].tone).toBe("danger");

    const northward = inputs();
    northward.magnetometer.data![0].bz_gsm = -5;
    northward.magnetometer.data!.unshift({ ...northward.magnetometer.data![0], time_tag: new Date(now - 3 * 60_000).toISOString(), bz_gsm: -8 });
    expect(buildSolarTrends(northward, now)[2].tone).toBe("success");
  });
  it("colors X-ray by absorption risk: rising is warning, falling is info", () => {
    const rising = inputs();
    rising.xray.data!.unshift({ ...rising.xray.data![0], time_tag: new Date(now - 4 * 60_000).toISOString(), flux: 1e-8 });
    expect(buildSolarTrends(rising, now)[3].tone).toBe("warning");

    const falling = inputs();
    falling.xray.data![0].flux = 1e-8;
    falling.xray.data!.unshift({ ...falling.xray.data![0], time_tag: new Date(now - 4 * 60_000).toISOString(), flux: 1e-7 });
    expect(buildSolarTrends(falling, now)[3].tone).toBe("info");
  });
  it("marks an unchanged reading as muted regardless of metric", () => {
    const data = inputs();
    data.kp.data!.unshift({ ...data.kp.data![0], time_tag: new Date(now - 10_800_000).toISOString() });
    expect(buildSolarTrends(data, now)[0].tone).toBe("muted");
  });
  it("trims the trailing series to the last 24 hours, capped at 48 points, newest last", () => {
    const data = inputs();
    data.flux.data = Array.from({ length: 60 }, (_, i) => ({
      time_tag: new Date(now - (59 - i) * 3_600_000).toISOString(),
      flux: 100 + i,
      frequency: 2800 as const,
      schedule: "noon",
    }));
    const series = buildSolarTrends(data, now)[1].series;
    expect(series.length).toBeLessThanOrEqual(48);
    expect(series.at(-1)?.value).toBe(159);
    expect(Date.parse(series[0].timestamp)).toBeGreaterThanOrEqual(now - 24 * 3_600_000);
  });
});
