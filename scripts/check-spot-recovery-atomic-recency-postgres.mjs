#!/usr/bin/env node
/** Isolated SQL verification for atomic path-recency recompute. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runStationPostgresHarness } from "./lib/station-postgres-harness.mjs";

if (process.argv.slice(2).join(" ") !== "--confirm-disposable-spot-recovery-postgres") {
  throw new Error("Pass --confirm-disposable-spot-recovery-postgres; no running database is targeted");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const bootstrapPath = "supabase/tests/spot_recovery_atomic_recency_bootstrap.sql";
const deployedPath = "supabase/tests/spot_recovery_atomic_recency_deployed.sql";
const unknownPath = "supabase/tests/spot_recovery_atomic_recency_unknown.sql";
const migration = { kind: "migration", path: "supabase/migrations/20260908100000_spot_recovery_atomic_recency.sql" };
const assertion = { kind: "fixture", path: "supabase/tests/spot_recovery_atomic_recency_assertions.sql" };
const bootstrap = readFileSync(`${root}/${bootstrapPath}`, "utf8");
const legacy = readFileSync(`${root}/supabase/migrations/20260906210000_path_recency_v2.sql`, "utf8");
const gapSource = readFileSync(`${root}/supabase/migrations/20260907230000_spot_aggregation_recovery_baselines.sql`, "utf8");
const deployedFixture = readFileSync(`${root}/${deployedPath}`, "utf8");

for (const [name, source] of [["compute_path_recency_hourly", legacy], ["record_spot_aggregation_gap", gapSource]]) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const end = source.indexOf("\n$$;", start) + 4;
  if (start < 0 || end < 4 || !bootstrap.includes(source.slice(start, end))) {
    throw new Error(`bootstrap drift: ${name}`);
  }
}

function bodyHash(sql, functionName, tag) {
  const functionStart = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
  const marker = `AS $${tag}$`;
  const bodyStart = sql.indexOf(marker, functionStart) + marker.length;
  const bodyEnd = sql.indexOf(`$${tag}$`, bodyStart);
  if (functionStart < 0 || bodyStart < marker.length || bodyEnd < 0) throw new Error(`missing ${functionName} body`);
  return createHash("md5").update(sql.slice(bodyStart, bodyEnd)).digest("hex");
}

const implementationHashes = {
  checkedIn: bodyHash(legacy, "compute_path_recency_hourly", ""),
  captured: bodyHash(deployedFixture, "compute_path_recency_hourly", "function"),
};
if (implementationHashes.checkedIn !== "911af8084d008079ae493ec16c1141d2"
  || implementationHashes.captured !== "eae214dfb5eacdda241b1b576308220f") {
  throw new Error("accepted recency fixture body hash drifted");
}

const fixture = (path) => ({ kind: "fixture", path });
const run = (files) => runStationPostgresHarness({ root, namespace: "spots", files });
try {
  const checkedIn = await run([fixture(bootstrapPath), migration, assertion]);
  const captured = await run([fixture(bootstrapPath), fixture(deployedPath), migration, assertion]);
  let unknownRejected = false;
  try {
    await run([fixture(bootstrapPath), fixture(unknownPath), migration]);
  } catch (error) {
    unknownRejected = /unsupported compute_path_recency_hourly body hash/.test(error.message);
    if (!unknownRejected) throw error;
  }
  if (!unknownRejected) throw new Error("unknown compute body was accepted");
  console.log(JSON.stringify({ status: "passed", implementationHashes, checkedIn, captured, unknownRejected,
    scope: "Disposable synthetic atomic recency SQL only" }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
