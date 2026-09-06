import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  INCIDENT_MARKER,
  OPEN_AFTER_FAILURES,
  evaluateInferenceHealth,
  planIncidentAction,
  resetMonitorStateForTests,
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
    serving_profile: "nowcast",
  };
}

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

describe("evaluateInferenceHealth", () => {
  it("accepts the exact service contract", () => {
    expect(evaluateInferenceHealth(healthyBody(), MODEL)).toEqual({
      healthy: true,
      reason: "",
      servingProfile: "nowcast",
    });
  });

  it("rejects each contract violation with a specific reason", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...healthyBody(), status: "degraded" }, "status is not ok"],
      [{ ...healthyBody(), inference_mode: "live" }, "inference_mode is not shadow"],
      [{ ...healthyBody(), service_auth_enabled: false }, "service auth is not enabled"],
      [{ ...healthyBody(), model_version: "other-model" }, "model identity mismatch"],
      [{ ...healthyBody(), profiles: ["nowcast"] }, "profiles missing nowcast/physics"],
      [
        { ...healthyBody(), serving_profile: "voacap" },
        "serving_profile is missing or unexpected",
      ],
      [
        (() => {
          const body = healthyBody();
          delete body.serving_profile;
          return body;
        })(),
        "serving_profile is missing or unexpected",
      ],
    ];
    for (const [body, reason] of cases) {
      const verdict = evaluateInferenceHealth(body, MODEL);
      expect(verdict.healthy).toBe(false);
      expect(verdict.reason).toContain(reason);
    }
  });

  it("reports the physics serving profile as healthy too", () => {
    const verdict = evaluateInferenceHealth(
      { ...healthyBody(), serving_profile: "physics" },
      MODEL,
    );
    expect(verdict).toEqual({
      healthy: true,
      reason: "",
      servingProfile: "physics",
    });
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
    resetMonitorStateForTests();
  });

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

describe("incident reconciliation (alert-enabled)", () => {
  interface GhCall {
    method: string;
    url: string;
  }

  /**
   * Routes the health endpoint and the GitHub API through one fetch stub;
   * returns the GitHub calls in invocation order.
   */
  function stubEndpoints(options: {
    healthOk: boolean;
    openIssue?: number;
    listFails?: boolean;
  }): GhCall[] {
    const ghCalls: GhCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (!url.includes("api.github.com")) {
          return options.healthOk
            ? new Response(JSON.stringify(healthyBody()))
            : new Response("down", { status: 503 });
        }
        ghCalls.push({ method: init?.method ?? "GET", url });
        if (url.includes("issues?state=open")) {
          if (options.listFails) return new Response("nope", { status: 500 });
          const issues =
            options.openIssue === undefined
              ? []
              : [{ number: options.openIssue, body: INCIDENT_MARKER }];
          return new Response(JSON.stringify(issues));
        }
        return new Response(JSON.stringify({}), { status: 201 });
      }),
    );
    return ghCalls;
  }

  beforeEach(() => {
    vi.stubEnv("GITHUB_ALERT_TOKEN", "test-token");
    resetMonitorStateForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetMonitorStateForTests();
  });

  it("creates the incident issue only when the streak reaches the threshold", async () => {
    const ghCalls = stubEndpoints({ healthOk: false });
    const { db } = fakeDb();
    for (let tick = 1; tick <= OPEN_AFTER_FAILURES; tick++) {
      await runInferenceMonitor(db);
      const creates = ghCalls.filter(
        (c) => c.method === "POST" && c.url.endsWith("/issues"),
      );
      expect(creates).toHaveLength(tick < OPEN_AFTER_FAILURES ? 0 : 1);
    }
  });

  it("does not open a duplicate while an incident is already open", async () => {
    const ghCalls = stubEndpoints({ healthOk: false, openIssue: 7 });
    const { db } = fakeDb();
    for (let tick = 0; tick < OPEN_AFTER_FAILURES + 1; tick++) {
      await runInferenceMonitor(db);
    }
    expect(
      ghCalls.filter((c) => c.method === "POST" && c.url.endsWith("/issues")),
    ).toHaveLength(0);
  });

  it("closes the incident before posting the recovery comment", async () => {
    const ghCalls = stubEndpoints({ healthOk: true, openIssue: 7 });
    const { db, healthInserts } = fakeDb();
    await runInferenceMonitor(db);
    const mutations = ghCalls.filter((c) => c.method !== "GET");
    expect(mutations.map((c) => c.method)).toEqual(["PATCH", "POST"]);
    expect(mutations[0]?.url.endsWith("/issues/7")).toBe(true);
    expect(mutations[1]?.url.endsWith("/issues/7/comments")).toBe(true);
    expect(healthInserts[0]?.status).toBe("ok");
  });

  it("still reports the health verdict when GitHub reconciliation fails", async () => {
    stubEndpoints({ healthOk: false, listFails: true });
    const { db, healthInserts } = fakeDb();
    await expect(runInferenceMonitor(db)).resolves.toBeUndefined();
    expect(healthInserts[0]?.status).toBe("error");
    expect(String(healthInserts[0]?.error_message)).toContain("HTTP 503");
  });
});
