import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { resolveE2EProfile } from "./tests/support/sharedServer";

// Same shared server as playwright.config.ts (port 5173, no --port override)
// — this suite must never spawn its own on a different port. See F1 in
// docs/guides/LOCAL-AGENT-TESTING.md.
const port = Number(process.env.PROPULSE_E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;
const allowStart =
  process.env.PROPULSE_E2E_ALLOW_START === "1" && port === 5173;

export default defineConfig({
  ...base,
  testDir: "./tests/home",
  use: { ...base.use, baseURL },
  webServer: allowStart
    ? {
        // Profile matches resolveE2EProfile() — see playwright.config.ts —
        // so PROPULSE_E2E_GUEST=1 PROPULSE_E2E_ALLOW_START=1 autostarts a
        // `connected`-profile server for guest.spec.ts instead of a `local`
        // one that sharedServer.ts's globalSetup would immediately reject.
        command:
          process.env.PROPULSE_E2E_SERVER_COMMAND ??
          `node scripts/dev-session.mjs start --owner playwright-home --task home-browser-tests --profile ${resolveE2EProfile()}`,
        url: `${baseURL}/`,
        reuseExistingServer: true,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
        timeout: 120_000,
      }
    : undefined,
});
