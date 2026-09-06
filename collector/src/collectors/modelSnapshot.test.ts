import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { REFERENCE_BANDS, referencePaths } from "../lib/referenceSurface.js";
import {
  collectModelSnapshot,
  resetModelSnapshotStateForTests,
} from "./modelSnapshot.js";

const MODEL_VERSION =
  "propagation_v4_2_phase2_scale-a6-retrospective-internal-50000000";
const PATHS = referencePaths();

interface FakeDb {
  db: SupabaseClient;
  upserts: unknown[];
  upsertOptions: Array<Record<string, unknown>>;
  healthInserts: Array<Record<string, unknown>>;
}

function fakeDb(): FakeDb {
  const upserts: unknown[] = [];
  const upsertOptions: Array<Record<string, unknown>> = [];
  const healthInserts: Array<Record<string, unknown>> = [];
  const db = {
    from(table: string) {
      if (table === "forecast_snapshots") {
        return {
          upsert: async (rows: unknown, options: Record<string, unknown>) => {
            upserts.push(rows);
            upsertOptions.push(options);
            return { error: null };
          },
        };
      }
      if (table === "collector_health") {
        return {
          insert: async (row: Record<string, unknown>) => {
            healthInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async () => ({ error: null }),
  } as unknown as SupabaseClient;
  return { db, upserts, upsertOptions, healthInserts };
}

/** A valid /v1/propagation/reference response body for a given band. */
function referenceBody(
  band: string,
  options: {
    profile?: string | ((index: number) => string);
    probability?: (index: number) => number;
    predictionsOverride?: unknown[];
  } = {},
): Record<string, unknown> {
  const profileOption = options.profile;
  const profileFor: (index: number) => string =
    typeof profileOption === "function"
      ? profileOption
      : () => profileOption ?? "physics";
  const probabilityFor = options.probability ?? (() => 0.4);
  return {
    model_version: MODEL_VERSION,
    feature_contract: "reference-surface-v1",
    issue_time: "2026-09-06T15:00:00+00:00",
    valid_time: "2026-09-06T15:30:00+00:00",
    band,
    data_freshness: { operational_weather: 420 },
    profile_counts: { [profileFor(0)]: PATHS.length },
    predictions:
      options.predictionsOverride ??
      PATHS.map((p, i) => ({
        origin_grid4: p.origin_grid4,
        target_grid4: p.target_grid4,
        core_probability: probabilityFor(i),
        confidence: 0.8,
        profile: profileFor(i),
        missing_feature_count: 11,
      })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("collectModelSnapshot", () => {
  beforeEach(() => {
    vi.stubEnv("INFERENCE_SERVICE_TOKEN", "test-token");
    vi.stubEnv("INFERENCE_BASE_URL", "https://inference.example");
    resetModelSnapshotStateForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetModelSnapshotStateForTests();
  });

  /** referenceBody() with the first prediction's fields overridden. */
  function referenceBodyWithBadFirstPrediction(
    band: string,
    badFields: Record<string, unknown>,
  ): Record<string, unknown> {
    const base = referenceBody(band) as {
      predictions: Array<Record<string, unknown>>;
    };
    const predictions = [...base.predictions];
    predictions[0] = { ...predictions[0], ...badFields };
    return { ...base, predictions };
  }

  it("writes 10 rows with correct p_open, source, mode_class, and meta shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(referenceBody(body.band, { probability: () => 0.4 }));
      }),
    );

    const { db, upserts, upsertOptions, healthInserts } = fakeDb();
    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(1);
    const rows = upserts[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.band))).toEqual(new Set(REFERENCE_BANDS));

    for (const row of rows) {
      expect(row.source).toBe("model_physics");
      expect(row.mode_class).toBe("digital");
      expect(row.horizon_hours).toBe(0);
      expect(row.p_open).toBeCloseTo(0.4, 5);

      const meta = row.meta as Record<string, unknown>;
      expect(meta.surface_id).toBe("hubs11-v1");
      expect(meta.model_version).toBe(MODEL_VERSION);
      expect(meta.feature_contract).toBe("reference-surface-v1");
      expect(meta.n_paths).toBe(110);
      expect(meta.power_w).toBe(5);
      expect(meta.confidence_mean).toBeCloseTo(0.8, 5);
      expect(meta.missing_feature_count_max).toBe(11);
      expect(meta.mixed_profiles).toBeUndefined();

      const byOrigin = meta.by_origin as Record<string, number>;
      expect(Object.keys(byOrigin)).toHaveLength(11);
      expect(byOrigin.EM12).toBeCloseTo(0.4, 5);

      const byContinentPair = meta.by_continent_pair as Record<string, number>;
      expect(byContinentPair["NA>EU"]).toBeCloseTo(0.4, 5);
    }

    expect(upsertOptions[0]?.onConflict).toBe(
      "hour_utc,band,source,horizon_hours,mode_class",
    );
    expect(upsertOptions[0]?.ignoreDuplicates).toBe(true);
    expect(healthInserts[0]?.status).toBe("ok");
  });

  it("writes model_nowcast with mixed_profiles when a batch mixes profiles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(
          referenceBody(body.band, {
            profile: (i) => (i % 2 === 0 ? "physics" : "nowcast"),
            probability: () => 0.5,
          }),
        );
      }),
    );

    const { db, upserts } = fakeDb();
    await collectModelSnapshot(db);

    const rows = upserts[0] as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.source).toBe("model_nowcast");
      const meta = row.meta as Record<string, unknown>;
      expect(meta.mixed_profiles).toBe(true);
    }
  });

  it("writes model_nowcast (no mixed flag) when every prediction is nowcast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(referenceBody(body.band, { profile: "nowcast" }));
      }),
    );

    const { db, upserts } = fakeDb();
    await collectModelSnapshot(db);

    const rows = upserts[0] as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.source).toBe("model_nowcast");
      const meta = row.meta as Record<string, unknown>;
      expect(meta.mixed_profiles).toBeUndefined();
    }
  });

  it("writes nothing and reports an error on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/HTTP 401/);
  });

  it("writes nothing and reports an error on a 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/HTTP 500/);
  });

  it("writes nothing and reports an error on a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/unreachable/);
  });

  it("writes nothing and reports an error on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json{")));
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed JSON/);
  });

  it("writes nothing and reports an error when predictions length doesn't match the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        const full = referenceBody(body.band) as { predictions: unknown[] };
        return jsonResponse({ ...full, predictions: full.predictions.slice(0, 5) });
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/predictions, expected 110/);
  });

  it("writes nothing and reports an error when a prediction pair doesn't match the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        const full = referenceBody(body.band) as {
          predictions: Array<Record<string, unknown>>;
        };
        const swapped = [...full.predictions];
        swapped[0] = { ...swapped[0], origin_grid4: "AA00" };
        return jsonResponse({ ...full, predictions: swapped });
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed or mismatched/);
  });

  it("does not write a partial surface when a later band fails", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        call++;
        const body = JSON.parse(String(init?.body)) as { band: string };
        if (call === 3) return new Response("down", { status: 500 });
        return jsonResponse(referenceBody(body.band));
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
  });

  it("skips the run and never calls fetch when the token is unset", async () => {
    vi.stubEnv("INFERENCE_SERVICE_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
    expect(healthInserts).toHaveLength(0);
  });

  it("sends requests sequentially, one band at a time, in REFERENCE_BANDS order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const bandsSeen: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const body = JSON.parse(String(init?.body)) as { band: string };
        bandsSeen.push(body.band);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight--;
        return jsonResponse(referenceBody(body.band));
      }),
    );

    const { db } = fakeDb();
    await collectModelSnapshot(db);

    expect(maxInFlight).toBe(1);
    expect(bandsSeen).toEqual([...REFERENCE_BANDS]);
  });

  it("carries the bearer header, JSON content type, and all 110 paths on every request", async () => {
    const seenHeaders: Array<Record<string, string>> = [];
    const seenPaths: number[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe("https://inference.example/v1/propagation/reference");
        seenHeaders.push(init?.headers as Record<string, string>);
        const body = JSON.parse(String(init?.body)) as {
          band: string;
          declared_power_watts: number;
          paths: unknown[];
        };
        seenPaths.push(body.paths.length);
        expect(body.declared_power_watts).toBe(5);
        return jsonResponse(referenceBody(body.band));
      }),
    );

    const { db } = fakeDb();
    await collectModelSnapshot(db);

    expect(seenHeaders).toHaveLength(10);
    for (const headers of seenHeaders) {
      expect(headers.Authorization).toBe("Bearer test-token");
      expect(headers["Content-Type"]).toBe("application/json");
    }
    expect(seenPaths).toEqual(new Array(10).fill(110));
  });

  it("clamps valid_time to issue_time when the tick runs after the hour's :30 midpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-06T15:47:00Z"));
    const seenBodies: Array<{ issue_time: string; valid_time: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          band: string;
          issue_time: string;
          valid_time: string;
        };
        seenBodies.push(body);
        return jsonResponse(referenceBody(body.band));
      }),
    );

    const { db } = fakeDb();
    await collectModelSnapshot(db);

    expect(seenBodies.length).toBeGreaterThan(0);
    for (const body of seenBodies) {
      expect(body.valid_time).toBe(body.issue_time);
    }
  });

  it("uses the hour's :30 midpoint as valid_time when the tick runs before it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-06T15:10:00Z"));
    const seenBodies: Array<{ issue_time: string; valid_time: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          band: string;
          issue_time: string;
          valid_time: string;
        };
        seenBodies.push(body);
        return jsonResponse(referenceBody(body.band));
      }),
    );

    const { db } = fakeDb();
    await collectModelSnapshot(db);

    expect(seenBodies.length).toBeGreaterThan(0);
    for (const body of seenBodies) {
      expect(body.valid_time).toBe("2026-09-06T15:30:00.000Z");
      expect(Date.parse(body.valid_time)).toBeGreaterThan(
        Date.parse(body.issue_time),
      );
    }
  });

  it("rejects a core_probability outside [0, 1]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(
          referenceBodyWithBadFirstPrediction(body.band, {
            core_probability: 1.5,
          }),
        );
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed or mismatched/);
  });

  it("rejects a confidence outside [0, 1]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(
          referenceBodyWithBadFirstPrediction(body.band, { confidence: -0.1 }),
        );
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed or mismatched/);
  });

  it("rejects a non-integer missing_feature_count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(
          referenceBodyWithBadFirstPrediction(body.band, {
            missing_feature_count: 2.5,
          }),
        );
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed or mismatched/);
  });

  it("rejects a negative missing_feature_count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(
          referenceBodyWithBadFirstPrediction(body.band, {
            missing_feature_count: -1,
          }),
        );
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed or mismatched/);
  });

  it("rejects an unknown profile string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { band: string };
        return jsonResponse(
          referenceBodyWithBadFirstPrediction(body.band, {
            profile: "ensemble",
          }),
        );
      }),
    );
    const { db, upserts, healthInserts } = fakeDb();

    await collectModelSnapshot(db);

    expect(upserts).toHaveLength(0);
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toMatch(/malformed or mismatched/);
  });
});
