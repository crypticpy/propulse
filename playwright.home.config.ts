import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const port = Number(process.env.PROPULSE_E2E_PORT ?? 5194);
export default defineConfig({
  ...base,
  testDir: "./tests/home",
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: process.env.PROPULSE_E2E_SERVER_COMMAND ?? `node scripts/dev-session.mjs start --owner playwright-home --task home-browser-tests --profile local --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    timeout: 120_000,
  },
});
