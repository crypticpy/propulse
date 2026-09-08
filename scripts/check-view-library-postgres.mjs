#!/usr/bin/env node
/** Uses the existing ownership-verified, networkless disposable PostgreSQL harness. */
import { fileURLToPath } from "node:url";
import { runStationPostgresHarness } from "./lib/station-postgres-harness.mjs";
if (process.argv.slice(2).join(" ") !== "--confirm-disposable-view-postgres") {
  throw new Error("Pass --confirm-disposable-view-postgres; no running database is targeted");
}
try {
  const result = await runStationPostgresHarness({
    root: fileURLToPath(new URL("../", import.meta.url)), namespace: "views",
    files: [
      { kind: "fixture", path: "supabase/tests/view_library_bootstrap.sql" },
      { kind: "migration", path: "supabase/migrations/20260907180000_view_library.sql" },
      { kind: "fixture", path: "supabase/tests/view_library_acceptance.sql" },
    ],
  });
  console.log(JSON.stringify({ status: "passed", ...result, scope: "Disposable SQL only; API and signed-in browser checks are separate" }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
