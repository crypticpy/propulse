#!/usr/bin/env node
/** Isolated synthetic contract check for the spot aggregation recovery wrapper. */
import { fileURLToPath } from "node:url";
import { runStationPostgresHarness } from "./lib/station-postgres-harness.mjs";

if (process.argv.slice(2).join(" ") !== "--confirm-disposable-spot-recovery-postgres") {
  throw new Error("Pass --confirm-disposable-spot-recovery-postgres; no running database is targeted");
}

try {
  const result = await runStationPostgresHarness({
    root: fileURLToPath(new URL("../", import.meta.url)),
    namespace: "spots",
    files: [
      { kind: "fixture", path: "supabase/tests/spot_recovery_bootstrap.sql" },
      { kind: "migration", path: "supabase/migrations/20260907220000_spot_aggregation_recovery.sql" },
      { kind: "fixture", path: "supabase/tests/spot_recovery_assertions.sql" },
    ],
  });
  console.log(JSON.stringify({
    status: "passed",
    ...result,
    scope: "Disposable PostgreSQL synthetic wrapper contract only; production collector functions and data are not loaded",
  }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
