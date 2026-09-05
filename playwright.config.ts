import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PROPULSE_E2E_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PROPULSE_E2E_PORT");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/solar",
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
  webServer: {
    command: process.env.PROPULSE_E2E_SERVER_COMMAND ?? `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/solar`,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    timeout: 120_000,
  },
});
