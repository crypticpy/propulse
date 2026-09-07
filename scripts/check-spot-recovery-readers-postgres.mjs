#!/usr/bin/env node
/** Networkless disposable PostgreSQL check for gap-aware aggregate readers. */
import { fileURLToPath } from "node:url";
import { runStationPostgresHarness } from "./lib/station-postgres-harness.mjs";

if (process.argv.slice(2).join(" ") !== "--confirm-disposable-spot-recovery-readers-postgres") {
  throw new Error("Pass --confirm-disposable-spot-recovery-readers-postgres; no running database is targeted");
}

try {
  const result = await runStationPostgresHarness({
    root: fileURLToPath(new URL("../", import.meta.url)),
    namespace: "spots",
    files: [
      { kind: "fixture", path: "supabase/tests/spot_aggregation_recovery_readers_bootstrap.sql" },
      { kind: "migration", path: "supabase/migrations/20260907223000_spot_aggregation_recovery_readers.sql" },
      { kind: "fixture", path: "supabase/tests/spot_aggregation_recovery_readers_assertions.sql" },
    ],
  });
  console.log(JSON.stringify({
    status: "passed",
    ...result,
    scope: "Disposable gap-aware path reader SQL only; no production data, credentials, or model execution",
  }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
