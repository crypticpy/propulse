import { BandVerdictDetailsDialog } from "propulse";

// entry is typed `any` at the component boundary but must satisfy
// BandLadderEntry's real shape (src/hooks/useBandVerdicts.ts) — the dialog
// destructures entry.result.evaluation/.inputs/.counts directly.
const now = Date.now();

export function VerifiedOpen() {
  const entry = {
    band: "20m",
    stable: "verified",
    fading: false,
    since: now - 42 * 60_000,
    result: {
      scopeId: "regional:EU",
      band: "20m",
      at: now,
      evaluation: {
        state: "verified",
        surprise: false,
        physicsOpen: true,
        verified: true,
        trend: "steady",
        why: [
          "Forecast p_open 0.71 → open (enter ≥0.60, exit <0.40)",
          "9 obs from 5 reporters in 20 min → verified (verify ≥6 obs / ≥3 reporters)",
          "Rate 4 vs 4 prior 10 min → steady",
        ],
      },
      inputs: {
        physicsScore: 0.71,
        obs20m: 9,
        reporters20m: 5,
        count10mRecent: 4,
        count10mPrior: 4,
      },
      counts: {
        count60m: 26,
        sourceCounts60m: { rbn: 14, pskreporter: 9, dxcluster: 3 },
        modeObs20m: { cw: 2, digital: 5, phone: 2 },
      },
    },
  };
  const canonical = {
    band: "20m",
    scopeType: "regional" as const,
    scopeKey: "EU",
    state: "verified" as const,
    stableSince: new Date(now - 42 * 60_000).toISOString(),
    surprise: false,
    openedAt: new Date(now - 55 * 60_000).toISOString(),
    inputs: { opens_in_min: null, fades_in_min: 95 },
    updatedAt: new Date(now - 2 * 60_000).toISOString(),
    stale: false,
  };
  const activity = {
    band: "20m",
    count60m: 26,
    obs20m: 9,
    reporters20m: 5,
    count10mRecent: 4,
    count10mPrior: 4,
    sourceCounts60m: { rbn: 14, pskreporter: 9, dxcluster: 3 },
    modeObs20m: { cw: 2, digital: 5, phone: 2 },
    thresholds: { p25: 6, p75: 22, p95: 40 },
    median60m: 14,
    sampleCount: 210,
    level: "busy" as const,
    trend: "steady" as const,
    crowded: false,
  };
  return (
    <BandVerdictDetailsDialog
      entry={entry}
      activity={activity}
      canonical={canonical}
      scopeLabel="Regional · Europe"
      onClose={() => {}}
    />
  );
}

export function HotSurprise() {
  const entry = {
    band: "15m",
    stable: "hot",
    fading: false,
    since: now - 8 * 60_000,
    result: {
      scopeId: "global",
      band: "15m",
      at: now,
      evaluation: {
        state: "hot",
        surprise: true,
        physicsOpen: false,
        verified: true,
        trend: "rising",
        why: [
          "Forecast p_open 0.31 → closed (enter ≥0.60, exit <0.40)",
          "14 obs from 8 reporters in 20 min → verified (verify ≥6 obs / ≥3 reporters)",
          "Rate 11 vs 3 prior 10 min → rising",
          "Activity the forecast did not predict — possible Es/TEP opening",
        ],
      },
      inputs: {
        physicsScore: 0.31,
        obs20m: 14,
        reporters20m: 8,
        count10mRecent: 11,
        count10mPrior: 3,
      },
      counts: {
        count60m: 38,
        sourceCounts60m: { rbn: 20, pskreporter: 12, dxcluster: 6 },
        modeObs20m: { digital: 9, phone: 5 },
      },
    },
  };
  const canonical = {
    band: "15m",
    scopeType: "global" as const,
    scopeKey: "",
    state: "hot" as const,
    stableSince: new Date(now - 8 * 60_000).toISOString(),
    surprise: true,
    openedAt: new Date(now - 14 * 60_000).toISOString(),
    inputs: { opens_in_min: null, fades_in_min: null },
    updatedAt: new Date(now - 1 * 60_000).toISOString(),
    stale: false,
  };
  const activity = {
    band: "15m",
    count60m: 38,
    obs20m: 14,
    reporters20m: 8,
    count10mRecent: 11,
    count10mPrior: 3,
    sourceCounts60m: { rbn: 20, pskreporter: 12, dxcluster: 6 },
    modeObs20m: { digital: 9, phone: 5 },
    thresholds: { p25: 4, p75: 12, p95: 22 },
    median60m: 8,
    sampleCount: 180,
    level: "exceptional" as const,
    trend: "rising" as const,
    crowded: true,
  };
  return (
    <BandVerdictDetailsDialog
      entry={entry}
      activity={activity}
      canonical={canonical}
      scopeLabel="Global"
      onClose={() => {}}
    />
  );
}
