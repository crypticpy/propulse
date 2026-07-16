#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RESEARCH_HEALTH_ISSUE_TITLE =
  "[Research health] NowCast monitor alert";
const ISSUE_MARKER = "<!-- propulse-research-health-monitor -->";
const GITHUB_API = "https://api.github.com";

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function normalizeMonitorPayload(payload) {
  if (typeof payload !== "object" || payload === null) {
    return {
      healthy: false,
      stateChanged: false,
      heartbeatAgeSeconds: null,
      deliveryFailed: 0,
      deliveryExhausted: 0,
      reasons: ["monitor response invalid"],
    };
  }
  const value = payload;
  if (value.monitorUnavailable === true) {
    return {
      healthy: false,
      stateChanged: false,
      heartbeatAgeSeconds: null,
      deliveryFailed: 0,
      deliveryExhausted: 0,
      reasons: ["monitor endpoint unavailable"],
    };
  }
  const delivery =
    typeof value.alertDelivery === "object" && value.alertDelivery !== null
      ? value.alertDelivery
      : {};
  const heartbeatAgeSeconds = finiteNonnegative(value.heartbeatAgeSeconds)
    ? Math.floor(value.heartbeatAgeSeconds)
    : null;
  const deliveryFailed = finiteNonnegative(delivery.failed)
    ? Math.floor(delivery.failed)
    : 0;
  const deliveryExhausted = finiteNonnegative(delivery.exhausted)
    ? Math.floor(delivery.exhausted)
    : 0;
  const schemaValid =
    typeof value.evaluated === "boolean" &&
    typeof value.heartbeatStale === "boolean" &&
    typeof value.stateChanged === "boolean" &&
    heartbeatAgeSeconds !== null &&
    typeof delivery.configured === "boolean" &&
    finiteNonnegative(delivery.failed) &&
    finiteNonnegative(delivery.exhausted);
  const reasons = [];
  if (!schemaValid) reasons.push("monitor response invalid");
  if (value.evaluated !== true) reasons.push("monitor evaluation incomplete");
  if (value.heartbeatStale === true) reasons.push("M5 heartbeat stale");
  if (deliveryFailed > 0) reasons.push("alert delivery failed");
  if (deliveryExhausted > 0) reasons.push("alert delivery retries exhausted");
  return {
    healthy: schemaValid && reasons.length === 0,
    stateChanged: value.stateChanged === true,
    heartbeatAgeSeconds,
    deliveryFailed,
    deliveryExhausted,
    reasons,
  };
}

function validateRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must be owner/name");
  }
}

async function githubJson(fetchImpl, token, url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  const response = await fetchImpl(url, { ...init, headers });
  if (!response.ok) {
    const requestId = response.headers.get("x-github-request-id") ?? "unavailable";
    const rateLimit =
      response.headers.get("x-ratelimit-remaining") ?? "unavailable";
    throw new Error(
      `GitHub issue request failed with ${response.status}; request_id=${requestId}; rate_limit_remaining=${rateLimit}`,
    );
  }
  return response.status === 204 ? null : response.json();
}

function openMonitorIssue(rows) {
  if (!Array.isArray(rows)) return null;
  return (
    rows.find(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        !("pull_request" in row) &&
        typeof row.body === "string" &&
        row.body.includes(ISSUE_MARKER) &&
        Number.isInteger(row.number),
    ) ?? null
  );
}

function alertBody(status) {
  const age =
    status.heartbeatAgeSeconds === null
      ? "unavailable"
      : `${status.heartbeatAgeSeconds} seconds`;
  return `${ISSUE_MARKER}
The independent GitHub-hosted monitor detected a NowCast research-health problem.

- Reason: ${status.reasons.join(", ")}
- M5 heartbeat age: ${age}
- Failed webhook deliveries this run: ${status.deliveryFailed}
- Exhausted webhook deliveries: ${status.deliveryExhausted}

This issue contains aggregate operational state only. It excludes callsigns, grids, equipment, user data, secrets, and private endpoint addresses.`;
}

function recoveryBody(status) {
  const age =
    status.heartbeatAgeSeconds === null
      ? "unavailable"
      : `${status.heartbeatAgeSeconds} seconds`;
  return `${ISSUE_MARKER}
A genuine healthy heartbeat was observed again. Current heartbeat age: ${age}. Closing the monitor incident.`;
}

export async function reconcileResearchHealthIssue({
  payload,
  repository,
  token,
  fetchImpl = fetch,
}) {
  validateRepository(repository);
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("GITHUB_TOKEN is unavailable");
  }
  const status = normalizeMonitorPayload(payload);
  const base = `${GITHUB_API}/repos/${repository}`;
  const rows = await githubJson(
    fetchImpl,
    token,
    `${base}/issues?state=open&per_page=100`,
  );
  const issue = openMonitorIssue(rows);

  if (!status.healthy) {
    if (!issue) {
      const created = await githubJson(fetchImpl, token, `${base}/issues`, {
        method: "POST",
        body: JSON.stringify({
          title: RESEARCH_HEALTH_ISSUE_TITLE,
          body: alertBody(status),
        }),
      });
      return {
        healthy: false,
        action: "created",
        issueNumber: created?.number ?? null,
        reasons: status.reasons,
      };
    }
    if (status.stateChanged) {
      await githubJson(
        fetchImpl,
        token,
        `${base}/issues/${issue.number}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body: alertBody(status) }),
        },
      );
      return {
        healthy: false,
        action: "commented",
        issueNumber: issue.number,
        reasons: status.reasons,
      };
    }
    return {
      healthy: false,
      action: "unchanged",
      issueNumber: issue.number,
      reasons: status.reasons,
    };
  }

  if (!issue) {
    return { healthy: true, action: "unchanged", issueNumber: null, reasons: [] };
  }
  await githubJson(
    fetchImpl,
    token,
    `${base}/issues/${issue.number}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body: recoveryBody(status) }),
    },
  );
  await githubJson(fetchImpl, token, `${base}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "completed" }),
  });
  return {
    healthy: true,
    action: "closed",
    issueNumber: issue.number,
    reasons: [],
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("usage: reconcile-research-health-issue.mjs INPUT");
  let payload;
  try {
    payload = JSON.parse(await readFile(input, "utf8"));
  } catch {
    payload = { monitorUnavailable: true };
  }
  const result = await reconcileResearchHealthIssue({
    payload,
    repository: process.env.GITHUB_REPOSITORY ?? "",
    token: process.env.GITHUB_TOKEN ?? "",
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
