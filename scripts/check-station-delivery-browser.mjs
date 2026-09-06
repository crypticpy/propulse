#!/usr/bin/env node
/** Disposable Chromium evidence for local delivery bookkeeping, not authenticated transport. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const url = new URL(process.argv[2] ?? "");
assert.equal(url.hostname, "127.0.0.1", "Use an owned loopback server");
assert.equal(url.protocol, "http:");
assert.equal(url.username + url.password, "");
const response = await fetch(new URL("/__propulse_dev_session", url));
assert.ok(response.ok, "Managed dev-session identity is required");
const identity = await response.json();
assert.equal(resolve(identity.root), resolve(root), "Server must serve this checkout");
assert.equal(identity.profile, "local", "Use local synthetic fixtures, not a connected account");
assert.ok(identity.owner && identity.id, "Server ownership must be recorded");

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const fixtureUrl = new URL("/__station_delivery_fixture", url).href;
  // Load only a same-origin fixture document and pure storage modules. No app
  // bootstrap, personal browser state, external feeds, legacy hydration or hardware.
  await context.route("**/*", async (route) => {
    const requested = new URL(route.request().url());
    if (requested.href === fixtureUrl) {
      await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Station delivery fixture</title><main>Synthetic storage fixture</main>" });
    } else if (requested.origin === url.origin && !requested.pathname.startsWith("/api/")) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(fixtureUrl, { waitUntil: "load" });
  const result = await page.evaluate(async () => {
    const { createHfFixture } = await import("/src/lib/station/workbench/fixtures.ts");
    const { openStationDatabase } = await import("/src/lib/station/workbench/storage/database.ts");
    const { openStationRepository } = await import("/src/lib/station/workbench/storage/repository.ts");
    const { prepareStationOperation } = await import("/src/lib/station/workbench/storage/operations.ts");
    const { canonicalWorkbenchJson, digestWorkbenchJson } = await import("/src/lib/station/workbench/storage/serialization.ts");
    const ensure = (condition, message) => { if (!condition) throw new Error(message); };
    const equal = (left, right, message) => ensure(canonicalWorkbenchJson(left) === canonicalWorkbenchJson(right), message);
    const summaries = [];

    async function withFixture(label, run) {
      const archive = createHfFixture();
      const ownerId = archive.ownerId;
      const generationId = `synthetic-delivery-${label}`;
      const dbName = `propulse-station-workbench-test-delivery-${crypto.randomUUID()}`;
      const options = { ownerId, dbName };
      const handles = [];
      try {
        const opened = await openStationDatabase(options);
        ensure(opened.status === "ready", "Database did not open");
        const database = opened.database;
        handles.push(database);
        const entries = [
          ["model", archive.models], ["equipment", archive.inventory], ["evidence", archive.evidence],
          ["location", archive.locations], ["setup", archive.setups], ["revision", archive.revisions],
          ["layout", archive.layouts], ["experiment", archive.experiments], ["publication-source", archive.publications],
          ["operating", archive.operating ? [archive.operating] : []],
        ];
        const records = await Promise.all(entries.flatMap(([kind, bodies]) => bodies.map(async (body) => {
          const id = kind === "operating" ? "operating" : body.id;
          return { ownerId, generationId, kind, id, versionId: kind === "revision" ? id : `${kind}:${id}:v1`, body, payloadDigest: await digestWorkbenchJson(body) };
        })));
        // Explicit test seeding only. This does not exercise or authorize product activation.
        const seed = database.transaction(["accountMeta", "generations", "heads", "recordVersions"], "readwrite");
        await seed.objectStore("accountMeta").put({ ownerId, key: "active-pointer", generationId, versionId: "synthetic-pointer-v1" });
        await seed.objectStore("accountMeta").put({ ownerId, key: "local-sequence", value: 0 });
        await seed.objectStore("generations").add({ ownerId, generationId, state: "active", schemaVersion: 1, createdAt: archive.revisions[0].createdAt, sourceGenerationId: null, sealDigest: null, manifest: { syntheticDeliveryFixture: true } });
        for (const record of records) {
          await seed.objectStore("recordVersions").add(record);
          await seed.objectStore("heads").add({ ownerId, generationId, kind: record.kind, id: record.id, versionId: record.versionId, tombstone: false });
        }
        await seed.done;
        const open = async (extra = {}) => {
          const result = await openStationRepository({ ...options, ...extra });
          ensure(result.status === "ready", "Repository did not open");
          handles.push(result.repository);
          return result.repository;
        };
        const snapshot = async (repo) => {
          const current = await repo.readSnapshot();
          ensure(current.status === "ready", "Snapshot unreadable");
          return current;
        };
        const audit = async () => {
          const names = ["accountMeta", "generations", "heads", "recordVersions", "operations", "outbox", "conflicts", "migrationRecords", "recoveryRecords", "mediaRefs", "deliveryResults"];
          const tx = database.transaction(names, "readonly");
          const values = await Promise.all(names.map(async (name) => [name, await tx.objectStore(name).getAll()]));
          await tx.done;
          return Object.fromEntries(values);
        };
        const change = async (repo, operationId, independent = false) => {
          const current = await snapshot(repo);
          const kind = independent ? "equipment" : "setup";
          const body = independent ? current.archive.inventory.find((item) => item.id === "feedline") : current.archive.setups[0];
          ensure(body, "Fixture target missing");
          const previous = current.heads.find((head) => head.kind === kind && head.id === body.id);
          const versionId = `version-${operationId}`;
          const operation = await prepareStationOperation({ schemaVersion: 1, ownerId, generationId, operationId, createdAt: archive.revisions[0].createdAt,
            records: [{ kind, id: body.id, versionId, body: independent ? { ...body, label: `Independent ${operationId}` } : { ...body, name: `Setup ${operationId}` } }],
            expectedHeads: [{ kind, id: body.id, versionId: previous.versionId }], nextHeads: [{ kind, id: body.id, versionId }], tombstones: [],
            setupDraftPreconditions: independent ? [] : [{ setupId: body.id, revisionId: body.draftRevisionId }],
          });
          const committed = await repo.commit(operation);
          ensure(committed.status === "committed", `${operationId} did not commit`);
          return { operation, receipt: committed.receipt };
        };
        const accepted = ({ receipt }) => ({ schemaVersion: 1, ownerId, generationId, operationId: receipt.operationId, payloadDigest: receipt.payloadDigest, outcome: "accepted", committedHeads: receipt.committedHeads });
        const rejected = ({ receipt }) => ({ schemaVersion: 1, ownerId, generationId, operationId: receipt.operationId, payloadDigest: receipt.payloadDigest, outcome: "rejected", reason: { code: "synthetic-head-conflict", message: "Synthetic remote rejection; no server was contacted" } });
        const readiness = async (repo) => Object.fromEntries((await repo.readDeliveryReadiness({ generationId })).map((row) => [row.operationId, row]));
        const chain = async (repo) => {
          const a = await change(repo, "A");
          await change(repo, "B");
          await change(repo, "C");
          await change(repo, "D", true);
          return a;
        };
        const summary = await run({ open, snapshot, audit, change, accepted, rejected, readiness, chain, generationId });
        summaries.push({ scenario: label, ...summary });
      } finally {
        handles.forEach((handle) => handle.close());
      }
    }

    await withFixture("transitive-rejection", async ({ open, snapshot, audit, change, rejected, readiness, chain, generationId }) => {
      const repo = await open();
      const a = await chain(repo);
      const initial = await readiness(repo);
      equal(Object.fromEntries(Object.entries(initial).map(([id, row]) => [id, row.status])), { A: "ready", B: "waiting", C: "waiting", D: "ready" }, "Initial dependency readiness is incorrect");
      const before = await snapshot(repo);
      const beforeAudit = await audit();
      const terminal = rejected(a);
      const outcome = await repo.recordDeliveryResult(terminal);
      ensure(outcome.status === "recorded", "Rejection was not recorded");
      equal(await snapshot(repo), before, "Rejection changed heads, sequence, pointer or archive");
      equal((await audit()).operations, beforeAudit.operations, "Rejection changed permanent local receipts");
      const blocked = await readiness(repo);
      equal(Object.fromEntries(Object.entries(blocked).map(([id, row]) => [id, row.status])), { A: "rejected", B: "blocked", C: "blocked", D: "ready" }, "Transitive rejection state is incorrect");
      for (const id of ["B", "C"]) equal(blocked[id].blockedByOperationIds, ["A"], `${id} lost the rejection root`);
      await change(repo, "E");
      const later = await readiness(repo);
      ensure(later.E.status === "blocked" && later.D.status === "ready", "Later E was not blocked or independent D changed");
      equal(later.E.blockedByOperationIds, ["A"], "Later E lost its transitive rejection root");
      const queue = await repo.listOutbox({ generationId, limit: 20 });
      for (const id of ["A", "B", "C", "E"]) ensure(queue.find((row) => row.operationId === id)?.state === "blocked", `${id} blocking was not durable`);
      ensure(queue.find((row) => row.operationId === "D")?.state === "pending", "Independent D is not pending");
      repo.close();
      const reopened = await open();
      equal(await readiness(reopened), later, "Blocking did not survive reopen");
      const replay = await reopened.recordDeliveryResult(terminal);
      ensure(replay.status === "replayed", "Rejected outcome did not replay");
      equal(replay.result, outcome.result, "Replay changed rejected outcome");
      return { checks: ["A→B→C transitive rejection", "independent D", "later E blocking", "durable audit queue", "reopen and terminal replay", "unchanged local receipts and heads"] };
    });

    await withFixture("late-acknowledgment", async ({ open, snapshot, audit, change, accepted, readiness, generationId }) => {
      const repo = await open();
      const a = await change(repo, "A");
      await change(repo, "B");
      const before = await snapshot(repo);
      const beforeAudit = await audit();
      const terminal = accepted(a);
      const outcome = await repo.recordDeliveryResult(terminal);
      ensure(outcome.status === "recorded", "Acceptance was not recorded");
      equal(await snapshot(repo), before, "Late acknowledgment rewound B or changed sequence/pointer");
      equal((await audit()).operations, beforeAudit.operations, "Late acknowledgment replaced local receipts");
      const ready = await readiness(repo);
      ensure(ready.A.status === "acknowledged" && ready.B.status === "ready", "Acknowledged prerequisite did not make B ready");
      const queue = await repo.listOutbox({ generationId, limit: 20 });
      equal(queue.map((row) => row.operationId), ["B"], "Audit outbox did not retain B and omit acknowledged A");
      repo.close();
      const reopened = await open();
      const replay = await reopened.recordDeliveryResult(terminal);
      ensure(replay.status === "replayed", "Accepted outcome did not replay after reopen");
      equal(replay.result, outcome.result, "Accepted replay changed the terminal result");
      const localReplay = await reopened.commit(a.operation);
      ensure(localReplay.status === "replayed", "Permanent local commit replay was lost");
      equal(localReplay.receipt, a.receipt, "Delivery changed the original local receipt");
      equal(await snapshot(reopened), before, "Reopen or replay changed canonical state");
      return { checks: ["late A acknowledgment preserves B", "unchanged sequence and receipts", "acknowledged dependency readiness", "audit queue semantics", "close/reopen exact replay"] };
    });

    for (const point of ["after-delivery-result", "after-delivery-descendant"]) {
      await withFixture(`rollback-${point}`, async ({ open, snapshot, audit, rejected, readiness, chain }) => {
        const repo = await open();
        const a = await chain(repo);
        const before = await audit();
        const beforeSnapshot = await snapshot(repo);
        let reached = 0;
        const failing = await open({ testHooks: { checkpoint: (at) => {
          if (at === point) {
            reached += 1;
            // The second state update ensures both the rejected root and an
            // actual descendant were written before aborting the transaction.
            if (point === "after-delivery-result" || reached === 2) throw new Error(`synthetic-${point}`);
          }
        } } });
        let aborted = false;
        try { await failing.recordDeliveryResult(rejected(a)); }
        catch (error) { aborted = error.message === `synthetic-${point}`; }
        ensure(aborted && reached === (point === "after-delivery-result" ? 1 : 2), "Failure injection did not reach its actual write checkpoint");
        failing.close(); repo.close();
        equal(await audit(), before, "Aborted delivery left terminal, descendant or other partial writes");
        const reopened = await open();
        equal(await snapshot(reopened), beforeSnapshot, "Canonical state changed after delivery abort/reopen");
        const pending = await readiness(reopened);
        ensure(pending.A.status === "ready" && pending.B.status === "waiting" && pending.C.status === "waiting" && pending.D.status === "ready", "Aborted delivery left partial blocking");
        ensure((await reopened.recordDeliveryResult(rejected(a))).status === "recorded", "Aborted delivery could not retry its original outcome");
        ensure((await readiness(reopened)).C.status === "blocked", "Successful retry failed to block the full chain");
        return { checks: ["actual IndexedDB transaction abort", "terminal and descendant rollback", "unchanged canonical data", "reopen and successful retry"], checkpoint: point, checkpointVisits: reached };
      });
    }
    return { checks: summaries, evidence: "Synthetic local bookkeeping in real IndexedDB; no transport authentication or product migration cutover" };
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ identity, browser: "disposable Chromium", result, pageErrors: errors }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
