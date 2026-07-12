#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function reportToolScripts() {
  const configured = process.env.PROPULSE_REPORT_TOOL_SCRIPTS;
  if (configured) return resolve(configured);
  const root = join(
    homedir(),
    ".codex/plugins/cache/openai-curated-remote/data-analytics",
  );
  if (!existsSync(root)) {
    throw new Error(
      "Data Analytics report tools are unavailable; set PROPULSE_REPORT_TOOL_SCRIPTS",
    );
  }
  const versions = readdirSync(root).sort((left, right) =>
    right.localeCompare(left, undefined, { numeric: true }),
  );
  for (const version of versions) {
    const scripts = join(root, version, "skills/build-report/scripts");
    if (existsSync(join(scripts, "deliver_portable_artifact.mjs"))) return scripts;
  }
  throw new Error("No compatible Data Analytics report packager was found");
}

const inputPath = argument("input");
const outputPath = argument("output");
const screenshotPath = argument("screenshot");
if (!inputPath || !outputPath) {
  throw new Error(
    "Usage: node package_report.mjs --input REPORT.artifact.json --output REPORT.html [--screenshot failure.png]",
  );
}

const scripts = reportToolScripts();
const { buildPortableArtifact } = await import(
  pathToFileURL(join(scripts, "build_portable_artifact.mjs")).href
);
const { deliverPortableArtifact } = await import(
  pathToFileURL(join(scripts, "deliver_portable_artifact.mjs")).href
);

const buildContainedReport = (artifact, options) =>
  buildPortableArtifact(artifact, options).replace(
    "</head>",
    "<style>html,body{max-width:100%;overflow-x:clip}</style></head>",
  );

const result = await deliverPortableArtifact(
  {
    inputPath,
    outputPath,
    screenshotPath,
  },
  { build: buildContainedReport },
);
console.log(JSON.stringify(result));
