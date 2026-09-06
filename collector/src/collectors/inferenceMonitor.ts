/**
 * Inference service uptime monitor (ported from the GitHub Actions workflow
 * .github/workflows/propagation-uptime-monitor.yml, retired 2026-08-30 —
 * two scheduled Actions runs per hour were burning the account's private-repo
 * minutes; the collector runs 24/7 on Railway so this check is free here).
 *
 * Every tick: fetch the inference /health endpoint, validate the same
 * contract the workflow enforced (status ok, shadow mode, service auth on,
 * immutable model identity, nowcast + physics profiles), and report through
 * the collector health system (/health + collector_health).
 *
 * Durable GitHub incident issues are preserved: when GITHUB_ALERT_TOKEN is
 * configured (fine-grained PAT, issues:write on the repo), the monitor
 * opens the same marker-tagged issue after OPEN_AFTER_FAILURES consecutive
 * failed ticks and closes it on recovery — identical marker and title to
 * the old workflow, so it adopts any incident the workflow left open.
 *
 * Outside-in coverage (a Railway-wide outage takes this monitor down with
 * the service it watches) is provided by the collector-liveness deadman
 * step in .github/workflows/solar-provider-synthetic.yml.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../logger.js";
import { reportHealth } from "../health.js";
import { reportToDb } from "../lib/db-helpers.js";

const HEALTH_ENDPOINT =
  process.env.INFERENCE_HEALTH_URL ||
  "https://propulse-inference-production.up.railway.app/v1/propagation/health";
const EXPECTED_MODEL =
  process.env.INFERENCE_EXPECTED_MODEL ||
  "propagation_v4_2_phase2_scale-a6-retrospective-internal-50000000";
// Read lazily so tests can stub the env per-case.
const alertToken = (): string => process.env.GITHUB_ALERT_TOKEN || "";
const alertRepo = (): string =>
  process.env.GITHUB_ALERT_REPO || "crypticpy/propulse";

const FETCH_TIMEOUT_MS = 20_000;

/** Same marker/title as the retired workflow so incidents carry over. */
export const INCIDENT_MARKER = "<!-- propulse-inference-uptime-monitor -->";
const INCIDENT_TITLE = "[Propagation uptime] Inference service alert";

/**
 * Consecutive failed ticks before an incident opens. At the 10-min default
 * cadence this matches the old workflow's alert latency (~30 min: 30-min
 * cron × 4 in-run retries) while ignoring single-tick blips.
 */
export const OPEN_AFTER_FAILURES = 3;

export interface HealthVerdict {
  healthy: boolean;
  reason: string;
  servingProfile?: string;
}

/** Profiles the inference service may report itself as actually serving. */
const EXPECTED_SERVING_PROFILES = new Set(["nowcast", "physics"]);

/** Validate the health body against the immutable service contract. */
export function evaluateInferenceHealth(
  body: unknown,
  expectedModel: string,
): HealthVerdict {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { healthy: false, reason: "health response is not a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const profiles = Array.isArray(b.profiles) ? (b.profiles as unknown[]) : [];
  const servingProfile =
    typeof b.serving_profile === "string" ? b.serving_profile : undefined;
  const failures: string[] = [];
  if (b.status !== "ok") failures.push("status is not ok");
  if (b.inference_mode !== "shadow") failures.push("inference_mode is not shadow");
  if (b.service_auth_enabled !== true) failures.push("service auth is not enabled");
  if (b.model_version !== expectedModel) failures.push("model identity mismatch");
  if (!profiles.includes("nowcast") || !profiles.includes("physics")) {
    failures.push("profiles missing nowcast/physics");
  }
  if (!servingProfile || !EXPECTED_SERVING_PROFILES.has(servingProfile)) {
    failures.push("serving_profile is missing or unexpected");
  }
  return failures.length === 0
    ? { healthy: true, reason: "", servingProfile }
    : { healthy: false, reason: failures.join("; "), servingProfile };
}

export type IncidentAction = "open" | "close" | "none";

/** Flap guard: open only after a failure streak, close on first recovery. */
export function planIncidentAction(
  healthy: boolean,
  consecutiveFailures: number,
  incidentOpen: boolean,
): IncidentAction {
  if (healthy) return incidentOpen ? "close" : "none";
  if (!incidentOpen && consecutiveFailures >= OPEN_AFTER_FAILURES) return "open";
  return "none";
}

// ─── GitHub incident reconciliation ─────────────────────────────────────────

const GH_HEADERS = (): Record<string, string> => ({
  Authorization: `Bearer ${alertToken()}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "propulse-collector",
  "Content-Type": "application/json",
});

async function findOpenIncident(): Promise<number | null> {
  const res = await fetch(
    `https://api.github.com/repos/${alertRepo()}/issues?state=open&per_page=100`,
    { headers: GH_HEADERS(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`issue list failed: HTTP ${res.status}`);
  const issues = (await res.json()) as Array<Record<string, unknown>>;
  const match = issues.find(
    (issue) =>
      !("pull_request" in issue) &&
      typeof issue.body === "string" &&
      issue.body.includes(INCIDENT_MARKER),
  );
  return match ? (match.number as number) : null;
}

async function openIncident(reason: string): Promise<void> {
  const body = [
    INCIDENT_MARKER,
    "The collector's inference uptime monitor detected a Propulse inference availability problem.",
    "",
    `- Reason: ${reason}`,
    `- Checked at: ${new Date().toISOString()}`,
    "",
    "This incident contains aggregate service state only. It excludes user data, station data, secrets, and request payloads.",
  ].join("\n");
  const res = await fetch(
    `https://api.github.com/repos/${alertRepo()}/issues`,
    {
      method: "POST",
      headers: GH_HEADERS(),
      body: JSON.stringify({ title: INCIDENT_TITLE, body }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`issue create failed: HTTP ${res.status}`);
}

async function closeIncident(issueNumber: number): Promise<void> {
  // Close before commenting: if the comment landed first and the close then
  // failed, every later healthy tick would rediscover the still-open issue
  // and post a duplicate recovery comment. A close without a comment is
  // self-healing; a comment without a close is not.
  const closeRes = await fetch(
    `https://api.github.com/repos/${alertRepo()}/issues/${issueNumber}`,
    {
      method: "PATCH",
      headers: GH_HEADERS(),
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!closeRes.ok) throw new Error(`issue close failed: HTTP ${closeRes.status}`);
  const comment = [
    INCIDENT_MARKER,
    "The collector monitor observed the expected A6 inference service again. Closing this incident.",
  ].join("\n");
  const commentRes = await fetch(
    `https://api.github.com/repos/${alertRepo()}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: GH_HEADERS(),
      body: JSON.stringify({ body: comment }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!commentRes.ok) {
    throw new Error(`issue comment failed: HTTP ${commentRes.status}`);
  }
}

let warnedNoToken = false;

/** Never throws — alerting problems must not mask the health verdict. */
async function reconcileIncident(
  verdict: HealthVerdict,
  consecutiveFailures: number,
): Promise<void> {
  if (!alertToken()) {
    if (!warnedNoToken) {
      warnedNoToken = true;
      log("warn", "GITHUB_ALERT_TOKEN not set — inference incidents surface in /health only");
    }
    return;
  }
  try {
    const issueNumber = await findOpenIncident();
    const action = planIncidentAction(
      verdict.healthy,
      consecutiveFailures,
      issueNumber !== null,
    );
    if (action === "open") {
      await openIncident(verdict.reason);
      log("warn", "Opened inference incident issue", { repo: alertRepo() });
    } else if (action === "close" && issueNumber !== null) {
      await closeIncident(issueNumber);
      log("info", "Closed inference incident issue", { issueNumber });
    }
  } catch (err) {
    log("error", "Incident reconciliation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Collector job ──────────────────────────────────────────────────────────

let consecutiveFailures = 0;

/** Test-only: reset the failure streak and the no-token warning latch. */
export function resetMonitorStateForTests(): void {
  consecutiveFailures = 0;
  warnedNoToken = false;
}

async function fetchVerdict(): Promise<HealthVerdict> {
  try {
    const res = await fetch(HEALTH_ENDPOINT, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return { healthy: false, reason: `inference endpoint HTTP ${res.status}` };
    }
    return evaluateInferenceHealth(await res.json(), EXPECTED_MODEL);
  } catch (err) {
    return {
      healthy: false,
      reason: `inference endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function runInferenceMonitor(db: SupabaseClient): Promise<void> {
  const start = Date.now();
  const verdict = await fetchVerdict();
  consecutiveFailures = verdict.healthy ? 0 : consecutiveFailures + 1;

  await reconcileIncident(verdict, consecutiveFailures);

  const durationMs = Date.now() - start;
  if (verdict.healthy) {
    reportHealth("inference-monitor", "ok", 0);
    await reportToDb(db, "inference-monitor", "ok", 0, durationMs);
    log("info", "Inference health check ok", {
      servingProfile: verdict.servingProfile,
    });
  } else {
    reportHealth("inference-monitor", "error", 0);
    await reportToDb(db, "inference-monitor", "error", 0, durationMs, verdict.reason);
    log("warn", "Inference health check failed", {
      reason: verdict.reason,
      consecutiveFailures,
      servingProfile: verdict.servingProfile,
    });
  }
}
