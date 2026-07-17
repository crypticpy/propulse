#!/usr/bin/env node
import { execSync } from "node:child_process";

const MAX_PUSH_FILES = Number.parseInt(process.env.MAX_PUSH_FILES ?? "200", 10);
const MAX_PUSH_LINE_CHANGES = Number.parseInt(
  process.env.MAX_PUSH_LINE_CHANGES ?? "12000",
  10,
);
const allowLargePush = process.env.ALLOW_LARGE_PUSH === "1";

function git(args) {
  return execSync(`git -c core.fsmonitor=false ${args}`, { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`\n[push-size] ${message}`);
  process.exit(1);
}

let upstream = "";
try {
  upstream = git("rev-parse --abbrev-ref --symbolic-full-name @{u}");
} catch {
  console.log("[push-size] No upstream configured for this branch. Skipping size check.");
  process.exit(0);
}

const aheadCount = Number.parseInt(git(`rev-list --count ${upstream}..HEAD`), 10);
if (!Number.isFinite(aheadCount) || aheadCount === 0) {
  console.log("[push-size] No commits ahead of upstream. Skipping size check.");
  process.exit(0);
}

const numstat = git(`diff --numstat ${upstream}...HEAD`);
if (!numstat) {
  console.log("[push-size] No diff detected against upstream.");
  process.exit(0);
}

const lines = numstat.split(/\r?\n/).filter(Boolean);
let changedLines = 0;
for (const line of lines) {
  const [added, removed] = line.split("\t");
  const a = Number.parseInt(added, 10);
  const r = Number.parseInt(removed, 10);
  changedLines += Number.isFinite(a) ? a : 0;
  changedLines += Number.isFinite(r) ? r : 0;
}

const changedFiles = lines.length;

if (!allowLargePush) {
  if (changedFiles > MAX_PUSH_FILES) {
    fail(
      `Push too large: ${changedFiles} files changed > ${MAX_PUSH_FILES}.\nSplit into smaller PRs/branches.\nOverride intentionally with: ALLOW_LARGE_PUSH=1 git push ...`,
    );
  }

  if (changedLines > MAX_PUSH_LINE_CHANGES) {
    fail(
      `Push too large: ${changedLines} changed lines > ${MAX_PUSH_LINE_CHANGES}.\nSplit into smaller PRs/branches.\nOverride intentionally with: ALLOW_LARGE_PUSH=1 git push ...`,
    );
  }
}

console.log(
  `[push-size] OK (${aheadCount} commits ahead, ${changedFiles} files, ${changedLines} changed lines).`,
);
