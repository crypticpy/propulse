#!/usr/bin/env node
/**
 * Owned PostgreSQL-only synthetic test gate; no HTTP/JWT/PostgREST/Storage claim.
 * Usage: node scripts/check-station-postgres.mjs --confirm-disposable-station-postgres
 * Optional explicit files: --migration supabase/migrations/<station-name>.sql
 *                          --fixture supabase/tests/<station-name>.sql
 * Repeated file flags execute in the supplied order. Never replays all migrations.
 * Selected files are trusted pure SQL: no psql meta commands or backslashes,
 * including in comments/literals (use chr(92) when needed). SQL failures stop
 * execution; PASS requires a completion sentinel in the same psql session.
 * Fixtures must restore the connection's role before their final ownership check.
 * Requires the pinned cached image and already-running desktop-linux Docker.
 */
import { fileURLToPath } from "node:url";
import { parseStationPostgresArgs, runStationPostgresHarness } from "./lib/station-postgres-harness.mjs";

try {
  const options = parseStationPostgresArgs(process.argv.slice(2));
  const result = await runStationPostgresHarness({ root: fileURLToPath(new URL("../", import.meta.url)), ...options });
  console.log(JSON.stringify({ status: "passed", ...result, scope: "Disposable PostgreSQL SQL only; no API, signed JWT, PostgREST, Storage or full migration replay" }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
