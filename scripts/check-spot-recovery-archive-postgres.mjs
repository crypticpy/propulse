#!/usr/bin/env node
/** Isolated SQL verification for archive known-gap coverage. */
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
      { kind: "fixture", path: "supabase/tests/spot_recovery_archive_bootstrap.sql" },
      { kind: "migration", path: "supabase/migrations/20260908080000_spot_recovery_archive_coverage.sql" },
      { kind: "fixture", path: "supabase/tests/spot_recovery_archive_assertions.sql" },
    ],
  });
  console.log(JSON.stringify({ status: "passed", ...result, scope: "Disposable synthetic SQL contract only" }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
