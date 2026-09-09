#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZERO_OID = /^0+$/;
const DOC_EXTENSION = /\.(?:md|mdx|rst|adoc|txt)$/i;
const DOC_BASENAME = /^(?:LICENSE|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT)(?:\..+)?$/i;

function git(args, options = {}) {
  // When an explicit cwd is given (only tests do this, to point git at a
  // scratch repo), drop any inherited GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE
  // from the environment first. This script itself runs inside a git hook,
  // which sets those vars for the repo being pushed; left in place, they
  // would override cwd and redirect git back to that repo.
  const env = options.cwd
    ? Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
      )
    : undefined;
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", options.quiet ? "ignore" : "inherit"],
      cwd: options.cwd,
      env,
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

export function selectFallbackBase(localOid, candidates, mergeBase) {
  for (const candidate of candidates.filter(Boolean)) {
    const common = mergeBase(localOid, candidate);
    if (common) return common;
  }
  return "";
}

function fallbackBase(localOid, remoteName) {
  const upstream = git(
    ["rev-parse", "@{u}"],
    { allowFailure: true, quiet: true },
  );
  const remoteHead = git(
    ["rev-parse", `refs/remotes/${remoteName}/HEAD`],
    { allowFailure: true, quiet: true },
  );
  const common = selectFallbackBase(
    localOid,
    [upstream, remoteHead],
    (head, candidate) => git(
      ["merge-base", head, candidate],
      { allowFailure: true, quiet: true },
    ),
  );
  if (common) return common;

  const parent = git(
    ["rev-parse", `${localOid}^`],
    { allowFailure: true, quiet: true },
  );
  if (parent) return parent;

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
      remoteRef: update.remoteRef,
    }))
    .filter((range) => range.base && range.head && range.base !== range.head);

  if (ranges.length > 0) return ranges;

  const currentRef = git(["symbolic-ref", "--quiet", "HEAD"], {
    allowFailure: true,
    quiet: true,
  });

  const upstream = git(
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    { allowFailure: true, quiet: true },
  );
  if (upstream) return [{ base: upstream, head: "HEAD", remoteRef: currentRef }];

  const parent = git(["rev-parse", "HEAD^"], {
    allowFailure: true,
    quiet: true,
  });
  return parent ? [{ base: parent, head: "HEAD", remoteRef: currentRef }] : [];
}

const MAIN_BRANCH = "main";

function isMainPush(remoteRef) {
  return remoteRef === `refs/heads/${MAIN_BRANCH}` || remoteRef === MAIN_BRANCH;
}

// Picks the diff range used to classify a single pushed range. A plain
// `base..head` two-dot diff is correct for an ordinary push, but is wrong
// when `head` is a merge of `main` into a feature branch: it then lists
// every file that differs between the branch's old remote tip and the
// merge commit, which includes content that arrived purely through
// ancestry from `main` and was never introduced by the branch itself.
//
// For non-main pushes we instead diff from where the branch actually
// diverges from `main` (`merge-base(head, origin/main)`) so only the
// branch's own contribution is classified. Pushes to `main` itself keep
// the original two-dot behaviour unconditionally — merge-base against
// origin/main can trivially equal `head` there (origin/main is often
// already the direct parent of what's being pushed), which would produce
// an empty diff and silently skip verification.
function diffRangeFor({ base, head, remoteRef }, remoteName, cwd) {
  if (!isMainPush(remoteRef)) {
    const mainMergeBase = git(
      ["merge-base", head, `refs/remotes/${remoteName}/${MAIN_BRANCH}`],
      { allowFailure: true, quiet: true, cwd },
    );
    if (mainMergeBase) return `${mainMergeBase}..${head}`;
    // origin/main isn't fetched or doesn't exist locally: fail closed to
    // the wider two-dot diff rather than silently under-classifying.
  }
  return `${base}..${head}`;
}

export function changedPaths(ranges, options = {}) {
  const { remoteName = "origin", cwd } = options;
  const paths = new Set();
  for (const range of ranges) {
    const output = git(
      [
        "diff",
        "--name-only",
        "--diff-filter=ACMRTUXB",
        diffRangeFor(range, remoteName, cwd),
      ],
      { cwd },
    );
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
  const plan = classifyPushPaths(changedPaths(ranges, { remoteName }));
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
