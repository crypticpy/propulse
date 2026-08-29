import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const REQUIRED_ENV = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
};

const touched = [
  ...Object.keys(REQUIRED_ENV),
  "ARCHIVE_PRUNING_ENABLED",
  "ARCHIVE_FORECAST_COMPACTION_ENABLED",
  "ARCHIVE_PRUNE_BATCH_SIZE",
  "ARCHIVE_PATH_STATS_PRUNE",
  "DB_SIZE_BUDGET_MB",
  "RETENTION_SOLAR",
  "RETENTION_TLE",
];
const original = Object.fromEntries(touched.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of touched) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setRequiredEnvironment(): void {
  Object.assign(process.env, REQUIRED_ENV);
  for (const key of touched.slice(Object.keys(REQUIRED_ENV).length)) {
    delete process.env[key];
  }
}

describe("archive retention configuration", () => {
  it("fails closed and uses the documented non-archive windows", () => {
    setRequiredEnvironment();

    const config = loadConfig();

    expect(config.archive).toEqual({
      pruningEnabled: false,
      forecastCompactionEnabled: false,
      pruneBatchSize: 10_000,
      pathStats: { hotDays: 90, pruneEnabled: false, maxDaysPerRun: 2 },
    });
    expect(config.dbSizeBudgetMb).toBe(3072);
    expect(config.retention.solar).toBe(120);
    expect(config.retention.tle).toBe(7);
  });

  it("only enables pruning for an explicit true value", () => {
    setRequiredEnvironment();
    process.env.ARCHIVE_PRUNING_ENABLED = "true";
    process.env.ARCHIVE_FORECAST_COMPACTION_ENABLED = "true";
    process.env.ARCHIVE_PRUNE_BATCH_SIZE = "25000";
    process.env.ARCHIVE_PATH_STATS_PRUNE = "true";
    // Budgets are not subject to parseBatchSize's 50k cap.
    process.env.DB_SIZE_BUDGET_MB = "60000";
    expect(loadConfig().dbSizeBudgetMb).toBe(60_000);
    expect(loadConfig().archive).toEqual({
      pruningEnabled: true,
      forecastCompactionEnabled: true,
      pruneBatchSize: 25_000,
      pathStats: { hotDays: 90, pruneEnabled: true, maxDaysPerRun: 2 },
    });

    process.env.ARCHIVE_PRUNING_ENABLED = "yes";
    process.env.ARCHIVE_FORECAST_COMPACTION_ENABLED = "yes";
    process.env.ARCHIVE_PRUNE_BATCH_SIZE = "50001";
    process.env.ARCHIVE_PATH_STATS_PRUNE = "yes";
    expect(loadConfig().archive).toEqual({
      pruningEnabled: false,
      forecastCompactionEnabled: false,
      pruneBatchSize: 10_000,
      pathStats: { hotDays: 90, pruneEnabled: false, maxDaysPerRun: 2 },
    });
  });
});
