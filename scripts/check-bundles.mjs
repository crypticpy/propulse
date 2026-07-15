#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const budgetsPath = path.join(repoRoot, "bundle-budgets.json");

function fail(message) {
  console.error(`\n[bundle-check] ${message}`);
  process.exit(1);
}

function toKb(bytes) {
  return bytes / 1024;
}

function formatKb(bytes) {
  return `${toKb(bytes).toFixed(2)} kB`;
}

function globToRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

if (!fs.existsSync(budgetsPath)) {
  fail(`Missing ${path.relative(repoRoot, budgetsPath)}.`);
}

const config = JSON.parse(fs.readFileSync(budgetsPath, "utf8"));
const distDir = path.resolve(repoRoot, config.distDir ?? "dist/assets");

if (!fs.existsSync(distDir)) {
  fail(
    `Build output not found at ${path.relative(repoRoot, distDir)}. Run npm run build first.`,
  );
}

const files = fs
  .readdirSync(distDir)
  .filter((name) => fs.statSync(path.join(distDir, name)).isFile());

const rows = [];
const failures = [];

for (const budget of config.budgets ?? []) {
  const regex = globToRegex(budget.pattern);
  const matches = files.filter((name) => regex.test(name));

  if (budget.required !== false && matches.length === 0) {
    failures.push({
      name: budget.name,
      issue: `No file matched pattern ${budget.pattern}`,
    });
    continue;
  }

  if (matches.length === 0) {
    continue;
  }

  // Evaluate the worst-case (largest gzip) file for the pattern.
  let worst = null;
  for (const match of matches) {
    const absPath = path.join(distDir, match);
    const raw = fs.readFileSync(absPath);
    const rawBytes = raw.length;
    const gzipBytes = zlib.gzipSync(raw).length;
    if (!worst || gzipBytes > worst.gzipBytes) {
      worst = { match, rawBytes, gzipBytes };
    }
  }

  rows.push({
    name: budget.name,
    file: worst.match,
    rawBytes: worst.rawBytes,
    gzipBytes: worst.gzipBytes,
    maxRawKb: budget.maxRawKb,
    maxGzipKb: budget.maxGzipKb,
  });

  if (
    typeof budget.maxRawKb === "number" &&
    toKb(worst.rawBytes) > budget.maxRawKb
  ) {
    failures.push({
      name: budget.name,
      issue: `${worst.match} raw ${formatKb(worst.rawBytes)} exceeds limit ${budget.maxRawKb.toFixed(2)} kB`,
    });
  }

  if (
    typeof budget.maxGzipKb === "number" &&
    toKb(worst.gzipBytes) > budget.maxGzipKb
  ) {
    failures.push({
      name: budget.name,
      issue: `${worst.match} gzip ${formatKb(worst.gzipBytes)} exceeds limit ${budget.maxGzipKb.toFixed(2)} kB`,
    });
  }
}

let precacheRow = null;
if (config.precache) {
  const serviceWorkerPath = path.resolve(
    repoRoot,
    config.precache.serviceWorker ?? "dist/sw.js",
  );
  if (!fs.existsSync(serviceWorkerPath)) {
    fail(
      `Service worker not found at ${path.relative(repoRoot, serviceWorkerPath)}. Run npm run build first.`,
    );
  }
  const serviceWorker = fs.readFileSync(serviceWorkerPath, "utf8");
  const urls = [
    ...serviceWorker.matchAll(/\{url:"([^"]+)"/g),
  ].map((match) => match[1]);
  if (urls.length === 0) {
    fail(
      `No Workbox precache entries found in ${path.relative(repoRoot, serviceWorkerPath)}.`,
    );
  }
  const serviceWorkerDir = path.dirname(serviceWorkerPath);
  const precacheFiles = urls.map((url) => {
    const pathname = decodeURIComponent(url.split("?", 1)[0]).replace(/^\//, "");
    const absolute = path.resolve(serviceWorkerDir, pathname);
    if (!absolute.startsWith(`${serviceWorkerDir}${path.sep}`)) {
      fail(`Precache URL escapes the build directory: ${url}`);
    }
    if (!fs.existsSync(absolute)) {
      fail(`Precache URL has no build artifact: ${url}`);
    }
    return absolute;
  });
  const totalBytes = precacheFiles.reduce(
    (total, absolute) => total + fs.statSync(absolute).size,
    0,
  );
  precacheRow = { count: urls.length, totalBytes };
  if (urls.length > config.precache.maxEntries) {
    failures.push({
      name: "PWA precache",
      issue: `${urls.length} entries exceeds limit ${config.precache.maxEntries}`,
    });
  }
  if (totalBytes / 1024 > config.precache.maxTotalKiB) {
    failures.push({
      name: "PWA precache",
      issue: `${(totalBytes / 1024).toFixed(2)} KiB exceeds limit ${config.precache.maxTotalKiB.toFixed(2)} KiB`,
    });
  }
}

console.log("\n[bundle-check] Evaluated bundle budgets:\n");
for (const row of rows) {
  const rawLimit =
    typeof row.maxRawKb === "number" ? `${row.maxRawKb.toFixed(2)} kB` : "n/a";
  const gzipLimit =
    typeof row.maxGzipKb === "number"
      ? `${row.maxGzipKb.toFixed(2)} kB`
      : "n/a";
  console.log(
    `- ${row.name}: ${row.file} | raw ${formatKb(row.rawBytes)} / ${rawLimit} | gzip ${formatKb(row.gzipBytes)} / ${gzipLimit}`,
  );
}
if (precacheRow) {
  console.log(
    `- PWA precache: ${precacheRow.count} entries / ${config.precache.maxEntries} | ${(precacheRow.totalBytes / 1024).toFixed(2)} KiB / ${config.precache.maxTotalKiB.toFixed(2)} KiB`,
  );
}

if (failures.length > 0) {
  console.error("\n[bundle-check] Budget violations found:\n");
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.issue}`);
  }
  process.exit(1);
}

console.log("\n[bundle-check] All bundle budgets passed.");
