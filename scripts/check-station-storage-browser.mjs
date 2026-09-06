#!/usr/bin/env node
/** Disposable Chromium evidence for the internal station repository, never owner data. */
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
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/design-system", url).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("main h1").waitFor({ state: "visible", timeout: 60_000 });
  assert.match(await page.locator("main h1").innerText(), /shack/i);
  const result = await page.evaluate(async () => {
    const { createHfFixture } = await import("/src/lib/station/workbench/fixtures.ts");
    const { openStationDatabase } = await import("/src/lib/station/workbench/storage/database.ts");
    const { openStationRepository } = await import("/src/lib/station/workbench/storage/repository.ts");
    const { prepareStationOperation } = await import("/src/lib/station/workbench/storage/operations.ts");
    const { digestWorkbenchJson } = await import("/src/lib/station/workbench/storage/serialization.ts");
    const ensure = (condition, message) => { if (!condition) throw new Error(message); };
    const archive = createHfFixture();
    const ownerId = archive.ownerId;
    const generationId = "synthetic-browser-generation";
    const dbName = `propulse-station-workbench-test-${crypto.randomUUID()}`;
    const options = { ownerId, dbName };
    const opened = await openStationDatabase(options);
    ensure(opened.status === "ready", "Database did not open");
    const database = opened.database;
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
    // Test fixture only: this is not the product's still-gated activation protocol.
    const seed = database.transaction(["accountMeta", "generations", "heads", "recordVersions"], "readwrite");
    await seed.objectStore("accountMeta").put({ ownerId, key: "active-pointer", generationId, versionId: "synthetic-pointer-v1" });
    await seed.objectStore("accountMeta").put({ ownerId, key: "local-sequence", value: 0 });
    await seed.objectStore("generations").put({ ownerId, generationId, state: "active", schemaVersion: 1, createdAt: archive.revisions[0].createdAt, sourceGenerationId: null, sealDigest: null, manifest: { syntheticBrowserFixture: true } });
    for (const record of records) {
      await seed.objectStore("recordVersions").add(record);
      await seed.objectStore("heads").add({ ownerId, generationId, kind: record.kind, id: record.id, versionId: record.versionId, tombstone: false });
    }
    await seed.done;
    database.close();
    const handles = [];
    const open = async (extra = {}) => {
      const result = await openStationRepository({ ...options, ...extra });
      ensure(result.status === "ready", "Repository did not open");
      handles.push(result.repository);
      return result.repository;
    };
    try {
      const a = await open();
      const b = await open();
      const before = await a.readSnapshot();
      ensure(before.status === "ready", "Seed snapshot unreadable");
      const makeRename = (snapshot, operationId, versionId, name) => {
        const setup = snapshot.archive.setups[0];
        const previous = snapshot.heads.find((head) => head.kind === "setup" && head.id === setup.id);
        return prepareStationOperation({ schemaVersion: 1, ownerId, generationId, operationId, createdAt: archive.revisions[0].createdAt,
          records: [{ kind: "setup", id: setup.id, versionId, body: { ...setup, name } }],
          expectedHeads: [{ kind: "setup", id: setup.id, versionId: previous.versionId }],
          nextHeads: [{ kind: "setup", id: setup.id, versionId }], tombstones: [],
          setupDraftPreconditions: [{ setupId: setup.id, revisionId: setup.draftRevisionId }],
        });
      };
      const operation = await makeRename(before, "browser-save", "browser-v2", "Saved in Chromium");
      const stale = await makeRename(before, "browser-stale", "browser-stale-v2", "Stale alternative");
      const committed = await a.commit(operation);
      ensure(committed.status === "committed", "Save did not commit");
      const conflict = await b.commit(stale);
      ensure(conflict.status === "conflict", "Stale edit overwrote current head");
      a.close(); b.close();
      const reopened = await open();
      const current = await reopened.readSnapshot();
      ensure(current.status === "ready" && current.archive.setups[0].name === "Saved in Chromium", "Save did not survive close/reopen");
      ensure(JSON.stringify(current.archive.operating) === JSON.stringify(before.archive.operating), "Operating pin changed");
      ensure(JSON.stringify(current.archive.publications) === JSON.stringify(before.archive.publications), "Publication pins changed");
      const replay = await reopened.commit(operation);
      ensure(replay.status === "replayed" && replay.receipt.localSequence === committed.receipt.localSequence, "Replay did not retain its original receipt");
      const failing = await open({ testHooks: { checkpoint: (point) => { if (point === "after-heads") throw new Error("synthetic-abort"); } } });
      let aborted = false;
      try { await failing.commit(await makeRename(current, "browser-abort", "browser-v3", "Must roll back")); }
      catch (error) { aborted = error.message === "synthetic-abort"; }
      ensure(aborted, "Actual write transaction was not aborted");
      const afterAbort = await reopened.readSnapshot();
      ensure(afterAbort.status === "ready" && afterAbort.archive.setups[0].name === "Saved in Chromium" && afterAbort.localSequence === current.localSequence, "Abort left a partial save");
      const queue = await reopened.listOutbox({ generationId, limit: 20 });
      ensure(queue.length === 2 && queue.some((row) => row.state === "pending") && queue.some((row) => row.state === "conflicted"), "Outbox lost saved or conflicting intent");
      const other = await open({ ownerId: "synthetic-other-owner" });
      ensure((await other.readSnapshot()).status === "legacy-active", "Other account saw this generation");
      let rejected = false;
      try { await other.commit(operation); } catch { rejected = true; }
      ensure(rejected, "Cross-account operation was accepted");
      return { checks: ["real IndexedDB commit", "close/reopen", "two-handle conflict", "exact replay", "transaction rollback", "durable outbox", "pin preservation", "owner isolation"], localSequence: afterAbort.localSequence, outboxStates: queue.map((row) => row.state) };
    } finally { handles.forEach((handle) => handle.close()); }
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ identity, browser: "disposable Chromium", result, pageErrors: errors }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
