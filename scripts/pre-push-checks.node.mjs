import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  changedPaths,
  classifyPushPaths,
  parseRefUpdates,
  selectFallbackBase,
} from "./pre-push-checks.mjs";

const COMMIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

// Git hooks (this test can itself run inside the pre-push hook) set
// GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE etc. in the process environment so
// the hook operates on the pushing repo. Child `git` calls that inherit
// process.env unchanged would then target that repo instead of the scratch
// directory below, so strip every GIT_* var before layering in our own.
function cleanGitEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_")) delete env[key];
  }
  return env;
}

function scratchGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...cleanGitEnv(), ...COMMIT_ENV },
  }).trim();
}

function writeScratchFile(dir, relPath, contents) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function commitScratch(dir, message) {
  scratchGit(dir, ["add", "."]);
  scratchGit(dir, ["commit", "-q", "-m", message]);
}

// Builds a scratch repo with a `main` branch holding a single base commit
// under src/. Callers branch off of it to construct merge scenarios.
function initScratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-push-checks-"));
  scratchGit(dir, ["init", "-q", "-b", "main"]);
  scratchGit(dir, ["config", "commit.gpgsign", "false"]);
  writeScratchFile(dir, "src/app.ts", "export const app = true;\n");
  commitScratch(dir, "chore: base app");
  return dir;
}

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

test("merging main into a feature branch does not resurrect main's ml/migration content as the branch's own diff", () => {
  const dir = initScratchRepo();
  try {
    // Feature branch forked from the base commit; its own commits touch only src/.
    scratchGit(dir, ["checkout", "-q", "-b", "feature"]);
    writeScratchFile(dir, "src/feature.ts", "export const feature = true;\n");
    commitScratch(dir, "feat: add feature file");
    const oldFeatureTip = scratchGit(dir, ["rev-parse", "HEAD"]);

    // main moves on with genuine ML/migration content the feature branch never touched.
    scratchGit(dir, ["checkout", "-q", "main"]);
    writeScratchFile(dir, "ml/model.py", "# model\n");
    writeScratchFile(
      dir,
      "supabase/migrations/20260101000000_add_table.sql",
      "-- migration\n",
    );
    commitScratch(dir, "feat: add ml model and migration");

    // Simulate the branch's already-fetched remote-tracking ref for main.
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", "main"]);

    // Merge main into the feature branch, producing a merge commit.
    scratchGit(dir, ["checkout", "-q", "feature"]);
    scratchGit(dir, ["merge", "-q", "--no-ff", "-m", "merge main into feature", "main"]);
    const mergeCommit = scratchGit(dir, ["rev-parse", "HEAD"]);

    const plan = classifyPushPaths(
      changedPaths(
        [{ base: oldFeatureTip, head: mergeCommit, remoteRef: "refs/heads/feature" }],
        { cwd: dir },
      ),
    );

    assert.notEqual(plan.profile, "full");
    assert.equal(plan.ml, false);
    assert.deepEqual(plan.paths, ["src/feature.ts"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a branch that touches ml/ itself still escalates to full after merging main in", () => {
  const dir = initScratchRepo();
  try {
    // The branch has never been pushed before, so `base` is the fork point —
    // both its own ml/ commit and the main merge are new in this one push.
    const forkPoint = scratchGit(dir, ["rev-parse", "HEAD"]);

    scratchGit(dir, ["checkout", "-q", "-b", "feature-ml"]);
    writeScratchFile(dir, "ml/feature_model.py", "# feature-owned model\n");
    commitScratch(dir, "feat: add feature-owned ml model");

    // main moves on with an unrelated change the branch never touched.
    scratchGit(dir, ["checkout", "-q", "main"]);
    writeScratchFile(dir, "src/unrelated.ts", "export const unrelated = true;\n");
    commitScratch(dir, "chore: unrelated main change");
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", "main"]);

    // Merge main into the feature branch, producing a merge commit.
    scratchGit(dir, ["checkout", "-q", "feature-ml"]);
    scratchGit(dir, ["merge", "-q", "--no-ff", "-m", "merge main into feature-ml", "main"]);
    const mergeCommit = scratchGit(dir, ["rev-parse", "HEAD"]);

    const plan = classifyPushPaths(
      changedPaths(
        [{ base: forkPoint, head: mergeCommit, remoteRef: "refs/heads/feature-ml" }],
        { cwd: dir },
      ),
    );

    assert.equal(plan.profile, "full");
    assert.equal(plan.ml, true);
    assert.deepEqual(plan.paths, ["ml/feature_model.py"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a direct push to main keeps two-dot classification even when origin/main already matches head", () => {
  const dir = initScratchRepo();
  try {
    const oldMainTip = scratchGit(dir, ["rev-parse", "HEAD"]);

    writeScratchFile(dir, "ml/model.py", "# model\n");
    commitScratch(dir, "feat: add ml model directly on main");
    const newMainTip = scratchGit(dir, ["rev-parse", "HEAD"]);

    // origin/main already coincides with the new tip here, which is exactly
    // the scenario that would make merge-base(head, origin/main) collapse to
    // `head` and yield an empty diff if main pushes weren't special-cased.
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", "main"]);

    const plan = classifyPushPaths(
      changedPaths(
        [{ base: oldMainTip, head: newMainTip, remoteRef: "refs/heads/main" }],
        { cwd: dir },
      ),
    );

    assert.equal(plan.profile, "full");
    assert.equal(plan.ml, true);
    assert.deepEqual(plan.paths, ["ml/model.py"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
