#!/usr/bin/env node
/** Isolated SQL verification for monthly archive source-coverage contracts. */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { runStationPostgresHarness } from "./lib/station-postgres-harness.mjs";

if (process.argv.slice(2).join(" ") !== "--confirm-disposable-spot-recovery-postgres") {
  throw new Error("Pass --confirm-disposable-spot-recovery-postgres; no running database is targeted");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const bootstrap = readFileSync(`${root}/supabase/tests/spot_recovery_monthly_bootstrap.sql`, "utf8");
const exactFunctions = [
  ["supabase/migrations/20260719000000_propagation_archive_foundation.sql", [
    "register_propagation_archive_manifest", "verify_propagation_archive_manifest",
    "seal_propagation_archive_manifest", "record_propagation_archive_restore",
  ]],
  ["supabase/tests/spot_recovery_archive_bootstrap.sql", [
    "record_spot_aggregation_gap", "prune_archived_path_hourly_stats",
  ]],
];
for (const [relativePath, names] of exactFunctions) {
  const source = readFileSync(`${root}/${relativePath}`, "utf8");
  for (const name of names) {
    const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    const end = source.indexOf("\n$$;", start) + 4;
    if (start < 0 || end < 4 || !bootstrap.includes(source.slice(start, end))) {
      throw new Error(`Monthly bootstrap drifted from ${relativePath}: ${name}`);
    }
  }
}

try {
  const result = await runStationPostgresHarness({
    root,
    namespace: "spots",
    files: [
      { kind: "fixture", path: "supabase/tests/spot_recovery_monthly_bootstrap.sql" },
      { kind: "migration", path: "supabase/migrations/20260908090000_spot_recovery_monthly_coverage.sql" },
      { kind: "fixture", path: "supabase/tests/spot_recovery_monthly_assertions.sql" },
    ],
  });
  console.log(JSON.stringify({ status: "passed", ...result, scope: "Disposable synthetic monthly archive SQL contract only" }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
