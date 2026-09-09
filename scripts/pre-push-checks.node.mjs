import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  changedPaths,
  classifyPushPaths,
  parseRefUpdates,
  pushRanges,
  selectDiffBase,
  selectFallbackBase,
  whitespaceDiffRanges,
} from "./pre-push-checks.mjs";

// Git hooks (this test can itself run inside the pre-push hook) set
// GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE etc. in the process environment so
// the hook operates on the pushing repo. Child `git` calls that inherit
// process.env unchanged would then target that repo instead of the scratch
// directories below — `git add` fails with "this operation must be run in a
// work tree", and `changedPaths` would silently interrogate the real
// repository instead of the fixture. Strip them once, for this process
// only, rather than filtering on every call (`git()` in the production
// module carries no such conditional behaviour on purpose — this is the
// delete-path gate).
for (const name of [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
  "GIT_REFLOG_ACTION",
]) {
  delete process.env[name];
}

const COMMIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function scratchGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...COMMIT_ENV },
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

// --- selectDiffBase: pure logic, no git involved ---

test("selectDiffBase falls back to range.base when mainRef is unresolved (origin/main not fetched or missing)", () => {
  const base = selectDiffBase(
    { base: "own-tip", head: "own-head" },
    "",
    () => {
      throw new Error("mergeBase should not be called without a resolved mainRef");
    },
    () => {
      throw new Error("isAncestor should not be called without a resolved mainRef");
    },
  );
  assert.equal(base, "own-tip");
});

test("selectDiffBase falls back to range.base when the merge-base itself cannot be computed", () => {
  const base = selectDiffBase(
    { base: "own-tip", head: "own-head" },
    "origin-main",
    () => "",
    () => {
      throw new Error("isAncestor should not be called when merge-base computation failed");
    },
  );
  assert.equal(base, "own-tip");
});

test("selectDiffBase keeps range.base for an ordinary push that already covers the upstream merge-base", () => {
  const base = selectDiffBase(
    { base: "own-tip", head: "own-head" },
    "origin-main",
    () => "origin-main",
    (ancestor, descendant) => ancestor === "origin-main" && descendant === "own-tip",
  );
  assert.equal(base, "own-tip");
});

test("selectDiffBase switches to the upstream merge-base for a merge-from-main commit", () => {
  const base = selectDiffBase(
    { base: "pre-merge-tip", head: "merge-commit" },
    "origin-main",
    () => "origin-main",
    () => false,
  );
  assert.equal(base, "origin-main");
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

// Regression test for the #738 review finding: `diffRangeFor` must not
// widen the classification base for an *ordinary* push just because the
// branch touched ml/ on some earlier push. The old (unguarded) version
// unconditionally replaced `base` with `merge-base(head, origin/main)` for
// every non-main push, which for a branch that has never merged main is the
// fork point — older than the stale remote tip in `base` — so a second,
// docs-only push would re-diff the branch's entire history and resurrect
// the earlier ml/ commit, forcing the full ML profile on a markdown fix.
test("a second, docs-only push to a branch that previously touched ml/ does not re-escalate to full", () => {
  const dir = initScratchRepo();
  try {
    const root = scratchGit(dir, ["rev-parse", "HEAD"]);
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", root]);

    scratchGit(dir, ["checkout", "-q", "-b", "feature"]);
    writeScratchFile(dir, "ml/x.py", "# x\n");
    commitScratch(dir, "feat: add ml/x.py");
    // This is the OID that was the branch's head on its first push, so it
    // becomes `base` (the stale remote tip) for the second push below.
    const firstPushHead = scratchGit(dir, ["rev-parse", "HEAD"]);

    writeScratchFile(dir, "NOTES.md", "notes\n");
    commitScratch(dir, "docs: add notes");
    const secondPushHead = scratchGit(dir, ["rev-parse", "HEAD"]);

    const plan = classifyPushPaths(
      changedPaths(
        [{ base: firstPushHead, head: secondPushHead, remoteRef: "refs/heads/feature" }],
        { cwd: dir },
      ),
    );

    assert.notEqual(plan.profile, "full");
    assert.deepEqual(plan.paths, ["NOTES.md"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- whitespaceDiffRanges: #740 — checkDiffWhitespace must scan the same
// narrowed range `changedPaths` classifies, not a re-derived two-dot diff. ---

// Case 1 from #740: a direct push to `main` keeps the two-dot range
// unconditionally. This is inherited entirely from `diffRangeFor`'s existing
// `isMainPush` short-circuit (added by #738, unchanged here) — reverting
// *only* this PR's change (switching `checkDiffWhitespace` from a re-derived
// `base..head` back to `whitespaceDiffRanges`) cannot turn this test red,
// because both the narrowed and un-narrowed forms already collapse to the
// same `base..head` string for a main push. It is kept anyway as a guard
// against a *future* over-narrowing (e.g. someone dropping `isMainPush`'s
// special case), which would collapse the range to empty here and silently
// skip whitespace checking on direct main pushes — strictly worse than the
// bug #740 fixes.
test("whitespaceDiffRanges: a direct push to main keeps the two-dot range and still catches its own whitespace error", () => {
  const dir = initScratchRepo();
  try {
    const oldMainTip = scratchGit(dir, ["rev-parse", "HEAD"]);
    writeScratchFile(dir, "src/trailing.ts", "export const x = 1; \n");
    commitScratch(dir, "chore: add file with trailing whitespace directly on main");
    const newMainTip = scratchGit(dir, ["rev-parse", "HEAD"]);
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", "main"]);

    const [range] = whitespaceDiffRanges(
      [{ base: oldMainTip, head: newMainTip, remoteRef: "refs/heads/main" }],
      { remoteName: "origin", cwd: dir },
    );
    assert.equal(range, `${oldMainTip}..${newMainTip}`);

    const result = spawnSync("git", ["diff", "--check", range], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /src\/trailing\.ts/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Case 2 from #740: a branch that introduces its own whitespace error must
// still fail after merging in a `main` that independently has an unrelated
// one — and the failure must name only the branch's own file, not main's.
// This is the genuine red-on-revert case: reverting *only* this PR's change
// (making `checkDiffWhitespace` re-derive `base..head` instead of calling
// `whitespaceDiffRanges`) widens the diffed range back to include main's
// merged-in commit, so `git diff --check` would additionally report
// `src/mainonly.ts` — a file the pusher never touched.
test("whitespaceDiffRanges: a branch's own whitespace error still fails after merging a main with an unrelated one, without naming main's file", () => {
  const dir = initScratchRepo();
  try {
    // The branch has never been pushed before, so `base` is the fork point —
    // both its own whitespace-introducing commit and the main merge are new
    // in this one push (same shape as "a branch that touches ml/ itself
    // still escalates to full after merging main in").
    const forkPoint = scratchGit(dir, ["rev-parse", "HEAD"]);

    scratchGit(dir, ["checkout", "-q", "-b", "feature"]);
    writeScratchFile(dir, "src/feature.ts", "export const feature = 1; \n");
    commitScratch(dir, "feat: add feature file with trailing whitespace");

    // main moves on with its own, unrelated whitespace error the branch
    // never touched.
    scratchGit(dir, ["checkout", "-q", "main"]);
    writeScratchFile(dir, "src/mainonly.ts", "export const mainOnly = 1; \n");
    commitScratch(dir, "chore: add main-only file with trailing whitespace");
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", "main"]);

    scratchGit(dir, ["checkout", "-q", "feature"]);
    scratchGit(dir, ["merge", "-q", "--no-ff", "-m", "merge main into feature", "main"]);
    const mergeCommit = scratchGit(dir, ["rev-parse", "HEAD"]);

    const [range] = whitespaceDiffRanges(
      [{ base: forkPoint, head: mergeCommit, remoteRef: "refs/heads/feature" }],
      { remoteName: "origin", cwd: dir },
    );

    const result = spawnSync("git", ["diff", "--check", range], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /src\/feature\.ts/);
    assert.doesNotMatch(result.stdout, /src\/mainonly\.ts/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Case 3 from #740: fail closed (fall back to the plain two-dot range) when
// `origin/main` does not resolve, rather than skipping the check. Like case
// 1, this is inherited from `diffRangeFor`/`selectDiffBase`'s existing
// fail-closed guard (#738, unchanged here): reverting only this PR's
// `checkDiffWhitespace` wiring cannot turn this test red, because both forms
// already collapse to the same `base..head` when `mainRef` is unresolved. It
// guards the whitespace check's consumption of that guarantee against a
// future regression in the shared fail-closed logic (e.g. `resolveMainRef`
// or `selectDiffBase` starting to treat an unresolved `mainRef` as "diff
// nothing" instead of "diff everything since base") — never skipping is the
// property #740 explicitly calls out as non-negotiable.
test("whitespaceDiffRanges: falls back to the two-dot range and still catches the error when origin/main does not resolve", () => {
  const dir = initScratchRepo();
  try {
    // No `refs/remotes/origin/main` is ever created in this repo, so
    // `resolveMainRef` (inside diffRangeFor) fails to resolve it.
    scratchGit(dir, ["checkout", "-q", "-b", "feature"]);
    const oldFeatureTip = scratchGit(dir, ["rev-parse", "HEAD"]);
    writeScratchFile(dir, "src/feature.ts", "export const feature = 1; \n");
    commitScratch(dir, "feat: add feature file with trailing whitespace");
    const newFeatureTip = scratchGit(dir, ["rev-parse", "HEAD"]);

    const [range] = whitespaceDiffRanges(
      [{ base: oldFeatureTip, head: newFeatureTip, remoteRef: "refs/heads/feature" }],
      { remoteName: "origin", cwd: dir },
    );
    assert.equal(range, `${oldFeatureTip}..${newFeatureTip}`);

    const result = spawnSync("git", ["diff", "--check", range], {
      cwd: dir,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /src\/feature\.ts/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function withCwd(dir, fn) {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(original);
  }
}

test("first push of a new branch does not crash and excludes main-only history", () => {
  const dir = initScratchRepo();
  try {
    const mainTip = scratchGit(dir, ["rev-parse", "HEAD"]);
    scratchGit(dir, ["update-ref", "refs/remotes/origin/main", mainTip]);
    scratchGit(dir, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);

    scratchGit(dir, ["checkout", "-q", "-b", "newfeature"]);
    writeScratchFile(dir, "collector/newfeature.ts", "new feature\n");
    commitScratch(dir, "newfeature: initial work");
    const localOid = scratchGit(dir, ["rev-parse", "HEAD"]);

    withCwd(dir, () => {
      const zeroOid = "0".repeat(40);
      process.env.PROPULSE_PUSH_REF_UPDATES =
        `refs/heads/newfeature ${localOid} refs/heads/newfeature ${zeroOid}\n`;
      try {
        const ranges = pushRanges("origin");
        assert.equal(ranges.length, 1);
        assert.equal(ranges[0].head, localOid);

        const paths = changedPaths(ranges, { remoteName: "origin", cwd: dir });
        assert.deepEqual(paths, ["collector/newfeature.ts"]);
        assert.equal(classifyPushPaths(paths).ml, false);
      } finally {
        delete process.env.PROPULSE_PUSH_REF_UPDATES;
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
