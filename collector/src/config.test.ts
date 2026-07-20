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
    });
    expect(config.retention.solar).toBe(120);
    expect(config.retention.tle).toBe(7);
  });

  it("only enables pruning for an explicit true value", () => {
    setRequiredEnvironment();
    process.env.ARCHIVE_PRUNING_ENABLED = "true";
    process.env.ARCHIVE_FORECAST_COMPACTION_ENABLED = "true";
    process.env.ARCHIVE_PRUNE_BATCH_SIZE = "25000";
    expect(loadConfig().archive).toEqual({
      pruningEnabled: true,
      forecastCompactionEnabled: true,
      pruneBatchSize: 25_000,
    });

    process.env.ARCHIVE_PRUNING_ENABLED = "yes";
    process.env.ARCHIVE_FORECAST_COMPACTION_ENABLED = "yes";
    process.env.ARCHIVE_PRUNE_BATCH_SIZE = "50001";
    expect(loadConfig().archive).toEqual({
      pruningEnabled: false,
      forecastCompactionEnabled: false,
      pruneBatchSize: 10_000,
    });
  });
});
