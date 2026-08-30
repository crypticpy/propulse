import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  OPEN_AFTER_FAILURES,
  evaluateInferenceHealth,
  planIncidentAction,
  runInferenceMonitor,
} from "./inferenceMonitor.js";

const MODEL = "propagation_v4_2_phase2_scale-a6-retrospective-internal-50000000";

function healthyBody(): Record<string, unknown> {
  return {
    status: "ok",
    inference_mode: "shadow",
    service_auth_enabled: true,
    model_version: MODEL,
    profiles: ["nowcast", "physics"],
  };
}

describe("evaluateInferenceHealth", () => {
  it("accepts the exact service contract", () => {
    expect(evaluateInferenceHealth(healthyBody(), MODEL)).toEqual({
      healthy: true,
      reason: "",
    });
  });

  it("rejects each contract violation with a specific reason", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...healthyBody(), status: "degraded" }, "status is not ok"],
      [{ ...healthyBody(), inference_mode: "live" }, "inference_mode is not shadow"],
      [{ ...healthyBody(), service_auth_enabled: false }, "service auth is not enabled"],
      [{ ...healthyBody(), model_version: "other-model" }, "model identity mismatch"],
      [{ ...healthyBody(), profiles: ["nowcast"] }, "profiles missing nowcast/physics"],
    ];
    for (const [body, reason] of cases) {
      const verdict = evaluateInferenceHealth(body, MODEL);
      expect(verdict.healthy).toBe(false);
      expect(verdict.reason).toContain(reason);
    }
  });

  it("aggregates multiple violations into one reason", () => {
    const verdict = evaluateInferenceHealth(
      { ...healthyBody(), status: "down", profiles: [] },
      MODEL,
    );
    expect(verdict.healthy).toBe(false);
    expect(verdict.reason).toContain("status is not ok");
    expect(verdict.reason).toContain("profiles missing nowcast/physics");
  });

  it("rejects non-object bodies", () => {
    for (const body of [null, "ok", 5, ["ok"]]) {
      expect(evaluateInferenceHealth(body, MODEL).healthy).toBe(false);
    }
  });
});

describe("planIncidentAction", () => {
  it("opens only after the failure streak threshold", () => {
    expect(planIncidentAction(false, OPEN_AFTER_FAILURES - 1, false)).toBe("none");
    expect(planIncidentAction(false, OPEN_AFTER_FAILURES, false)).toBe("open");
    expect(planIncidentAction(false, OPEN_AFTER_FAILURES + 5, false)).toBe("open");
  });

  it("never double-opens and closes on first recovery", () => {
    expect(planIncidentAction(false, OPEN_AFTER_FAILURES, true)).toBe("none");
    expect(planIncidentAction(true, 0, true)).toBe("close");
    expect(planIncidentAction(true, 0, false)).toBe("none");
  });
});

describe("runInferenceMonitor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeDb(): {
    db: SupabaseClient;
    healthInserts: Array<Record<string, unknown>>;
  } {
    const healthInserts: Array<Record<string, unknown>> = [];
    const db = {
      from(table: string) {
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
    return { db, healthInserts };
  }

  it("reports ok on a contract-conformant response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(healthyBody()))),
    );
    const { db, healthInserts } = fakeDb();
    await runInferenceMonitor(db);
    expect(healthInserts[0]?.status).toBe("ok");
  });

  it("reports error without throwing when the endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const { db, healthInserts } = fakeDb();
    await expect(runInferenceMonitor(db)).resolves.toBeUndefined();
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toContain("unreachable");
  });
});
