import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimSession,
  listSessions,
  parseOptions,
  portAvailable,
  releaseSession,
} from "./dev-session.mjs";

async function registry(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "propulse-session-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function listener(t, host = "127.0.0.1") {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  t.after(() => server.close());
  return server;
}

async function unusedPort(t) {
  const server = await listener(t);
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const base = {
  owner: "agent-one",
  task: "map-check",
  profile: "local",
  root: "/test/checkout",
};

test("simultaneous agents cannot claim the same port", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const claims = await Promise.allSettled([
    claimSession({ ...base, registry: dir, ports: [port] }),
    claimSession({ ...base, owner: "agent-two", registry: dir, ports: [port] }),
  ]);
  assert.equal(
    claims.filter((claim) => claim.status === "fulfilled").length,
    1,
  );
  assert.equal(claims.filter((claim) => claim.status === "rejected").length, 1);
  assert.equal((await listSessions(dir)).length, 1);
});

test("unmanaged IPv4 listeners survive refused claims", async (t) => {
  const dir = await registry(t);
  const server = await listener(t);
  const port = server.address().port;
  await assert.rejects(
    claimSession({ ...base, registry: dir, ports: [port] }),
    /No requested port/,
  );
  assert.equal(server.listening, true);
  assert.deepEqual(await listSessions(dir), []);
});

test("IPv6 localhost also makes a port unavailable", async (t) => {
  let server;
  try {
    server = await listener(t, "::1");
  } catch (error) {
    if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code))
      return t.skip("IPv6 unavailable");
    throw error;
  }
  assert.equal(await portAvailable(server.address().port), false);
  assert.equal(server.listening, true);
});

test("allocation skips an occupied port and release is identity guarded", async (t) => {
  const dir = await registry(t);
  const occupied = await listener(t);
  const free = await unusedPort(t);
  const claim = await claimSession({
    ...base,
    registry: dir,
    ports: [occupied.address().port, free],
  });
  assert.equal(claim.port, free);
  assert.equal(claim.root, base.root);
  await releaseSession({ ...claim, id: "another-agent" });
  assert.equal(JSON.parse(await readFile(claim.filename, "utf8")).id, claim.id);
  await releaseSession(claim);
  assert.deepEqual(await listSessions(dir), []);
});

test("stale and partial records are listed and never automatically taken over", async (t) => {
  const dir = await registry(t);
  const port = await unusedPort(t);
  const filename = path.join(dir, `${port}.json`);
  await writeFile(filename, JSON.stringify({ ...base, pid: 0, port }));
  assert.equal(
    (await listSessions(dir))[0].processState,
    "stale-check-before-removing",
  );
  await assert.rejects(
    claimSession({ ...base, registry: dir, ports: [port] }),
    /No requested port/,
  );
  await writeFile(filename, "{");
  assert.equal(
    (await listSessions(dir))[0].processState,
    "unreadable-or-being-created-do-not-reclaim",
  );
});

test("options validate ownership, profiles and strict numeric ports", () => {
  assert.equal(parseOptions([]).command, "status");
  assert.equal(
    parseOptions(["start", "--owner", "hamclock", "--task", "UI review"])
      .profile,
    "connected",
  );
  for (const port of ["5173;exit", "1", "65536", "5.5"]) {
    assert.throws(
      () =>
        parseOptions([
          "start",
          "--owner",
          "test",
          "--task",
          "test",
          "--port",
          port,
        ]),
      /Port/,
    );
  }
  assert.throws(() => parseOptions(["start"]), /requires/);
  assert.throws(
    () => parseOptions(["start", "--profile", "production"]),
    /Profile/,
  );
});
