import { defineConfig, devices } from "@playwright/test";
import { resolveE2EPort } from "./tests/support/sharedServer";

// Defaults to the one shared machine-wide dev server (port 5173). This suite
// never starts one on its own: webServer is only defined when explicitly
// opted in (PROPULSE_E2E_ALLOW_START=1) and the port is unchanged — an
// agent running `npm run test:solar:browser` on an idle machine must fail
// fast with globalSetup's message, not silently start the shared server. See
// docs/guides/LOCAL-AGENT-TESTING.md and tests/support/sharedServer.ts
// (globalSetup also rejects reusing a listener from a different worktree).
const port = resolveE2EPort();
const baseURL = `http://127.0.0.1:${port}`;
const allowStart =
  process.env.PROPULSE_E2E_ALLOW_START === "1" && port === 5173;

export default defineConfig({
  testDir: "./tests/solar",
  globalSetup: "./tests/support/sharedServer.ts",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL,
    serviceWorkers: "block",
    timezoneId: "America/Chicago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: allowStart
    ? {
        // Only used when explicitly opted in (see allowStart above); this
        // spawns the shared server itself when nothing is listening.
        command:
          process.env.PROPULSE_E2E_SERVER_COMMAND ??
          "node scripts/dev-session.mjs start --owner playwright --task solar-browser-tests --profile local",
        url: `${baseURL}/solar`,
        reuseExistingServer: true,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
        timeout: 120_000,
      }
    : undefined,
});
