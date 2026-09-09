import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    // Cap parallel test workers. Vitest's default is (CPU count - 1), which on
    // an 18-core box means 17 workers per run; several agents running
    // `vitest run` at once pinned the whole machine (2026-09-08). Override
    // with VITEST_MAX_WORKERS=<n> (or a percentage such as "50%") when a
    // single run has the machine to itself, e.g. in CI.
    maxWorkers: process.env.VITEST_MAX_WORKERS ?? 4,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "api/**/*.test.ts"],
    coverage: {
      include: ["src/lib/solar/**", "src/lib/api/solarClient.ts", "api/_lib/solarHandler.ts"],
    },
  },
});
