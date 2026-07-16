#!/usr/bin/env node
import { execSync } from "node:child_process";

const forbiddenPatterns = [
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

function fail(message) {
  console.error(`\n[tracked-artifacts] ${message}`);
  process.exit(1);
}

let output = "";
try {
  output = execSync("git -c core.fsmonitor=false ls-files", {
    encoding: "utf8",
  }).trim();
} catch {
  fail("Unable to list tracked files.");
}

if (!output) {
  console.log("[tracked-artifacts] No tracked files found.");
  process.exit(0);
}

const tracked = output.split(/\r?\n/).filter(Boolean);
const violations = tracked.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);

if (violations.length > 0) {
  fail(
    `Generated/build artifacts are tracked in git:\n- ${violations.join("\n- ")}\n\nRemove with: git rm -r --cached <path>`,
  );
}

console.log("[tracked-artifacts] OK. No generated artifacts are tracked.");
