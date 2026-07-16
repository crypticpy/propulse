import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPushPaths,
  parseRefUpdates,
  selectFallbackBase,
} from "./pre-push-checks.mjs";

test("classifies Markdown anywhere in the repository as documentation", () => {
  const plan = classifyPushPaths([
    "README.md",
    "ml/PERSONALIZED-PROPAGATION-V4-PLAN.md",
  ]);
  assert.equal(plan.profile, "docs");
  assert.equal(plan.ml, false);
});

test("requires full verification for ML source or database migrations", () => {
  assert.equal(classifyPushPaths(["ml/service/app.py"]).profile, "full");
  assert.equal(
    classifyPushPaths(["supabase/migrations/20260716000000_example.sql"]).profile,
    "full",
  );
});

test("selects tooling checks for hooks, workflows, and scripts", () => {
  const plan = classifyPushPaths([
    ".githooks/pre-push",
    ".github/workflows/ci.yml",
    "scripts/pre-push-checks.mjs",
  ]);
  assert.equal(plan.profile, "tooling");
  assert.equal(plan.tooling, true);
});

test("selects application checks for root product source", () => {
  const plan = classifyPushPaths(["src/App.tsx", "README.md"]);
  assert.equal(plan.profile, "targeted");
  assert.equal(plan.app, true);
});

test("selects component-specific builds", () => {
  const plan = classifyPushPaths([
    "bridge/src/server.ts",
    "collector/src/index.ts",
    "daemon/propulse-daemon/src/main.rs",
  ]);
  assert.equal(plan.profile, "targeted");
  assert.equal(plan.app, false);
  assert.equal(plan.bridge, true);
  assert.equal(plan.collector, true);
  assert.equal(plan.daemon, true);
});

test("full ML verification dominates mixed application changes", () => {
  const plan = classifyPushPaths(["ml/service/app.py", "src/App.tsx"]);
  assert.equal(plan.profile, "full");
  assert.equal(plan.ml, true);
  assert.equal(plan.app, false);
});

test("parses Git pre-push ref update lines", () => {
  const updates = parseRefUpdates(
    "refs/heads/topic aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa " +
    "refs/heads/topic bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n",
  );
  assert.deepEqual(updates, [{
    localRef: "refs/heads/topic",
    localOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    remoteRef: "refs/heads/topic",
    remoteOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }]);
});

test("new branches compare against their upstream merge base first", () => {
  const calls = [];
  const base = selectFallbackBase(
    "local-head",
    ["tracked-upstream", "remote-default"],
    (head, candidate) => {
      calls.push([head, candidate]);
      return candidate === "tracked-upstream" ? "upstream-common" : "";
    },
  );
  assert.equal(base, "upstream-common");
  assert.deepEqual(calls, [["local-head", "tracked-upstream"]]);
});

test("new branch base selection skips unavailable candidates", () => {
  const base = selectFallbackBase(
    "local-head",
    ["", "remote-default"],
    (_head, candidate) => candidate === "remote-default" ? "remote-common" : "",
  );
  assert.equal(base, "remote-common");
});
