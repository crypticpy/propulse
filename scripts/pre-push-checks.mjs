#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZERO_OID = /^0+$/;
const DOC_EXTENSION = /\.(?:md|mdx|rst|adoc|txt)$/i;
const DOC_BASENAME = /^(?:LICENSE|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT)(?:\..+)?$/i;

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", options.quiet ? "ignore" : "inherit"],
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

function run(command, args, label) {
  console.log(`\n[pre-push] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isDocumentationPath(path) {
  const basename = path.split("/").at(-1) ?? path;
  return DOC_EXTENSION.test(path) || DOC_BASENAME.test(basename);
}

function isToolingPath(path) {
  return (
    path.startsWith(".githooks/") ||
    path.startsWith(".github/") ||
    path.startsWith("scripts/")
  );
}

export function classifyPushPaths(paths) {
  const normalized = [...new Set(paths.filter(Boolean))].sort();
  if (normalized.length === 0 || normalized.every(isDocumentationPath)) {
    return {
      profile: "docs",
      paths: normalized,
      app: false,
      bridge: false,
      collector: false,
      daemon: false,
      ml: false,
      tooling: false,
    };
  }

  const ml = normalized.some(
    (path) => path.startsWith("ml/") || path.startsWith("supabase/migrations/"),
  );
  const daemon = normalized.some((path) => path.startsWith("daemon/"));
  const collector = normalized.some((path) => path.startsWith("collector/"));
  const bridge = normalized.some((path) => path.startsWith("bridge/"));
  const toolingOnly = normalized.every(
    (path) => isDocumentationPath(path) || isToolingPath(path),
  );
  const specialized = (path) =>
    isDocumentationPath(path) ||
    isToolingPath(path) ||
    path.startsWith("ml/") ||
    path.startsWith("supabase/migrations/") ||
    path.startsWith("daemon/") ||
    path.startsWith("collector/") ||
    path.startsWith("bridge/");
  const app = !ml && normalized.some((path) => !specialized(path));

  return {
    profile: ml
      ? "full"
      : toolingOnly
        ? "tooling"
        : "targeted",
    paths: normalized,
    app,
    bridge,
    collector,
    daemon,
    ml,
    tooling: toolingOnly,
  };
}

export function parseRefUpdates(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localOid, remoteRef, remoteOid] = line.split(/\s+/);
      return { localRef, localOid, remoteRef, remoteOid };
    })
    .filter((update) =>
      update.localRef &&
      update.localOid &&
      update.remoteRef &&
      update.remoteOid,
    );
}

function fallbackBase(localOid, remoteName) {
  const remoteHead = git(
    ["rev-parse", `refs/remotes/${remoteName}/HEAD`],
    { allowFailure: true, quiet: true },
  );
  if (remoteHead) {
    const common = git(
      ["merge-base", localOid, remoteHead],
      { allowFailure: true, quiet: true },
    );
    if (common) return common;
  }
  return git(
    ["rev-list", "--max-parents=0", localOid],
    { allowFailure: true, quiet: true },
  ).split(/\r?\n/)[0] ?? "";
}

function pushRanges(remoteName) {
  const updates = parseRefUpdates(process.env.PROPULSE_PUSH_REF_UPDATES ?? "");
  const ranges = updates
    .filter((update) => !ZERO_OID.test(update.localOid))
    .map((update) => ({
      base: ZERO_OID.test(update.remoteOid)
        ? fallbackBase(update.localOid, remoteName)
        : update.remoteOid,
      head: update.localOid,
    }))
    .filter((range) => range.base && range.head && range.base !== range.head);

  if (ranges.length > 0) return ranges;

  const upstream = git(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { allowFailure: true, quiet: true },
  );
  if (upstream) return [{ base: upstream, head: "HEAD" }];

  const parent = git(["rev-parse", "HEAD^"], {
    allowFailure: true,
    quiet: true,
  });
  return parent ? [{ base: parent, head: "HEAD" }] : [];
}

function changedPaths(ranges) {
  const paths = new Set();
  for (const { base, head } of ranges) {
    const output = git([
      "diff",
      "--name-only",
      "--diff-filter=ACMRTUXB",
      `${base}..${head}`,
    ]);
    output.split(/\r?\n/).filter(Boolean).forEach((path) => paths.add(path));
  }
  return [...paths];
}

function checkDiffWhitespace(ranges) {
  for (const { base, head } of ranges) {
    run("git", ["diff", "--check", `${base}..${head}`], "Checking diff hygiene");
  }
}

function mlEnvironmentReady() {
  const python = "ml/.venv/bin/python";
  const result = spawnSync(
    python,
    ["-c", "import joblib, polars, psycopg, pyarrow, xgboost"],
    { stdio: "ignore" },
  );
  return !result.error && result.status === 0;
}

function printPlan(plan) {
  const checks = [];
  if (plan.profile === "docs") checks.push("documentation hygiene");
  if (plan.tooling) checks.push("hook tests", "lint");
  if (plan.app) checks.push("frontend test/build/bundles");
  if (plan.collector) checks.push("collector build");
  if (plan.bridge) checks.push("bridge build");
  if (plan.daemon) checks.push("Rust workspace tests");
  if (plan.ml) checks.push("complete repository verification");
  console.log(
    `[pre-push] Profile: ${plan.profile}; ${plan.paths.length} changed file(s); ` +
    `checks: ${checks.join(", ")}.`,
  );
}

function main() {
  const remoteName = process.argv[2] ?? "origin";
  const ranges = pushRanges(remoteName);
  const plan = classifyPushPaths(changedPaths(ranges));
  printPlan(plan);
  checkDiffWhitespace(ranges);
  run(
    "node",
    ["scripts/check-tracked-artifacts.mjs"],
    "Checking tracked-artifact policy",
  );

  if (plan.profile === "docs") {
    console.log("[pre-push] Documentation-only push; full compute verification skipped.");
    return;
  }

  if (plan.tooling) {
    run(
      "node",
      ["--test", "scripts/pre-push-checks.node.mjs"],
      "Testing pre-push path selection",
    );
    run("bash", ["-n", ".githooks/pre-push"], "Checking hook shell syntax");
    run("npm", ["run", "lint"], "Linting repository source");
    return;
  }

  if (plan.ml) {
    if (!mlEnvironmentReady()) {
      console.error(
        "\n[pre-push] ML/database changes require the provisioned M5 environment. " +
        "The local ml/.venv is missing one or more required modules " +
        "(joblib, polars, psycopg, pyarrow, xgboost). Push from the M5 after " +
        "running npm run verify; do not install ad hoc dependencies on the M3.",
      );
      process.exit(1);
    }
    run("npm", ["run", "verify"], "Running complete repository verification");
  } else if (plan.app) {
    run("npm", ["run", "lint"], "Linting application source");
    run("npm", ["run", "test"], "Running application tests");
    run("npm", ["run", "build"], "Building application");
    run("npm", ["run", "check:bundles"], "Checking bundle budgets");
  }

  if (plan.collector) {
    run("npm", ["--prefix", "collector", "run", "build"], "Building collector");
  }
  if (plan.bridge) {
    run("npm", ["run", "bridge:build"], "Building bridge");
  }
  if (plan.daemon) {
    run(
      "cargo",
      ["test", "--workspace", "--manifest-path", "daemon/Cargo.toml"],
      "Testing Rust daemon workspace",
    );
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
