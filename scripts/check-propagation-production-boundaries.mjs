import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dockerfiles = [
  "collector/Dockerfile",
  "ml/service/Dockerfile",
  "archive-worker/Dockerfile",
];
const deploymentFiles = [
  "railway.json",
  "archive-worker/railway.json",
  "archive-worker/railway.reconcile.json",
  "archive-worker/railway.restore.json",
  "archive-worker/railway.health.json",
  "archive-worker/railway.report.json",
  "collector/.env.example",
  "scripts/check-propagation-cloud-smoke.mjs",
  "scripts/load-test-propagation.mjs",
  ...dockerfiles,
];

const copiedFiles = new Set();
for (const dockerfile of dockerfiles) {
  const source = readFileSync(resolve(root, dockerfile), "utf8");
  if (/^COPY\s+\.\s+/m.test(source)) {
    throw new Error(`${dockerfile} copies the repository root into production`);
  }
  for (const line of source.split("\n")) {
    const match = line.match(/^COPY(?:\s+--\S+)*\s+(\S+)\s+\S+/);
    if (!match || match[1].includes("*")) continue;
    const candidate = match[1].replace(/\/$/, "");
    if (candidate.startsWith("ml/") && !candidate.endsWith("/")) {
      copiedFiles.add(candidate);
    }
  }
}

const forbidden = [
  { pattern: /\/Volumes\/Projects/i, label: "M5 Projects volume" },
  { pattern: /\bm5(?:[._-]host|\.local|\.lan)\b/i, label: "M5 host target" },
  { pattern: /PROPULSE_ML_ARTIFACT_ROOT/i, label: "M5 artifact root" },
  { pattern: /run_m5_/i, label: "M5-only job" },
];

for (const file of [...deploymentFiles, ...copiedFiles]) {
  const source = readFileSync(resolve(root, file), "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      throw new Error(`${file} contains a production ${rule.label}`);
    }
  }
}

console.log(JSON.stringify({
  status: "passed",
  deploymentFilesChecked: deploymentFiles.length,
  copiedMlFilesChecked: copiedFiles.size,
  m5ProductionDependency: false,
}));
