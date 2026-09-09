import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // See ../vitest.config.ts for why this is capped: several agents running
    // `vitest run` at once can pin a shared machine. Override with
    // VITEST_MAX_WORKERS when a single run has the machine to itself.
    maxWorkers: process.env.VITEST_MAX_WORKERS ?? 4,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
