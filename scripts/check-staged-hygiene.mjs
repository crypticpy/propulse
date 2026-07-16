#!/usr/bin/env node
import { execSync } from "node:child_process";

const MAX_STAGED_FILES = Number.parseInt(
  process.env.MAX_STAGED_FILES ?? "80",
  10,
);
const MAX_STAGED_LINE_CHANGES = Number.parseInt(
  process.env.MAX_STAGED_LINE_CHANGES ?? "6000",
  10,
);

const allowLargeDiff = process.env.ALLOW_LARGE_DIFF === "1";

const blockedPatterns = [
  /^node_modules\//,
  /^dist\//,
  /^dist-ssr\//,
  /^dev-dist\//,
  /^bridge\/dist\//,
  /^collector\/dist\//,
  /^\.next\//,
  /^coverage\//,
  /^\.cache\//,
  /^\.vite\//,
  /^\.turbo\//,
  /^\.vercel\//,
  /^tmp\//,
  /^temp\//,
  /\.tsbuildinfo$/,
  /\.log$/,
];

function git(args) {
  return execSync(`git -c core.fsmonitor=false ${args}`, { encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`\n[staged-hygiene] ${message}`);
  process.exit(1);
}

let staged = "";
try {
  staged = git("diff --cached --name-only");
} catch {
  // If no staged files or git unavailable, skip safely.
  process.exit(0);
}

if (!staged) {
  process.exit(0);
}

const stagedFiles = staged.split(/\r?\n/).filter(Boolean);

const blocked = stagedFiles.filter((file) =>
  blockedPatterns.some((pattern) => pattern.test(file)),
);
if (blocked.length > 0) {
  fail(
    `Blocked generated/build artifacts are staged:\n- ${blocked.join("\n- ")}\n\nRemove them from staging with: git reset HEAD -- <path>` +
      "\nIf any are already tracked historically, remove from tracking with: git rm -r --cached <path>",
  );
}

if (!allowLargeDiff) {
  const numstat = git("diff --cached --numstat");
  const lines = numstat.split(/\r?\n/).filter(Boolean);

  let changedLines = 0;
  for (const line of lines) {
    const [added, removed] = line.split("\t");
    const a = Number.parseInt(added, 10);
    const r = Number.parseInt(removed, 10);
    changedLines += Number.isFinite(a) ? a : 0;
    changedLines += Number.isFinite(r) ? r : 0;
  }

  if (stagedFiles.length > MAX_STAGED_FILES) {
    fail(
      `Too many staged files (${stagedFiles.length}) > ${MAX_STAGED_FILES}.\nSplit into smaller commits.\nOverride intentionally with: ALLOW_LARGE_DIFF=1 git commit ...`,
    );
  }

  if (changedLines > MAX_STAGED_LINE_CHANGES) {
    fail(
      `Staged diff is too large (${changedLines} changed lines) > ${MAX_STAGED_LINE_CHANGES}.\nSplit into smaller commits.\nOverride intentionally with: ALLOW_LARGE_DIFF=1 git commit ...`,
    );
  }
}

console.log(
  `[staged-hygiene] OK (${stagedFiles.length} files staged, size checks passed).`,
);
