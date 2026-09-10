import { realpath } from "node:fs/promises";
import { portAvailable, SINGLE_SERVER_RULE } from "../../scripts/dev-session.mjs";

/**
 * One shared machine-wide dev server, not a Playwright-managed one: both
 * browser suites default to it. PROPULSE_E2E_PORT overrides the target
 * origin for a one-off check against a different already-running server;
 * it does not itself start anything (see playwright.config.ts's
 * PROPULSE_E2E_ALLOW_START gate).
 */
export function resolveE2EPort(): number {
  const port = Number(process.env.PROPULSE_E2E_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      "PROPULSE_E2E_PORT must be an integer from 1024 through 65535.",
    );
  }
  return port;
}

/**
 * Runs once before all tests (after webServer, if configured, has already
 * started or confirmed reuse of a listener — see the plugin ordering in
 * playwright/lib/runner: webServer setup precedes globalSetup). Fails fast
 * with the single-server rule when nothing is listening, and — this is the
 * Codex P1 fix — refuses to reuse a listener that answers
 * /__propulse_dev_session with a different worktree's root: a same-port
 * server from another checkout would otherwise let this branch's tests run
 * silently against different source code.
 */
export default async function globalSetup(): Promise<void> {
  const port = resolveE2EPort();
  if (await portAvailable(port)) {
    throw new Error(
      `Nothing is listening on port ${port}. ${SINGLE_SERVER_RULE} This suite ` +
        "does not start one for you unless PROPULSE_E2E_ALLOW_START=1 is set " +
        "(see playwright.config.ts) — ask the orchestrator, or check " +
        "`npm run dev:session -- status`.",
    );
  }
  const origin = `http://127.0.0.1:${port}`;
  const response = await fetch(`${origin}/__propulse_dev_session`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(
      `${origin} is listening but did not answer /__propulse_dev_session ` +
        `(status ${response.status}). It may not be a ProPulse dev server.`,
    );
  }
  const identity = (await response.json()) as { root?: string };
  const thisRoot = await realpath(process.cwd());
  if (identity.root !== thisRoot) {
    throw new Error(
      `${origin} is serving a different tree than this one. Served: ` +
        `${identity.root ?? "unknown"}. This worktree: ${thisRoot}. Ask its ` +
        "owner to restart against this branch, or run these tests from the " +
        "worktree it already serves — never start a second server to work " +
        "around this.",
    );
  }
}
