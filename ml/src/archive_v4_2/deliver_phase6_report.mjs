#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";


function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`--${name} is required`);
  }
  return resolve(process.argv[index + 1]);
}

function optionalArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1]
    ? resolve(process.argv[index + 1])
    : null;
}

const inputPath = argument("input");
const outputPath = argument("output");
const pluginRoot = argument("plugin-root");
const desktopPreview = optionalArgument("desktop-preview");
const mobilePreview = optionalArgument("mobile-preview");
const receiptPath = optionalArgument("receipt");
const scripts = resolve(pluginRoot, "skills/build-report/scripts");
const deliveryModule = await import(pathToFileURL(
  resolve(scripts, "deliver_portable_artifact.mjs"),
));
const builderModule = await import(pathToFileURL(
  resolve(scripts, "build_portable_artifact.mjs"),
));
const browserHelpers = await import(pathToFileURL(
  resolve(scripts, "portable_browser_helpers.mjs"),
));
const browserCli = await import(pathToFileURL(
  resolve(scripts, "portable_browser_cli.mjs"),
));

const originalHeader = [
  "width:100vw",
  "height:48px",
  "min-height:48px",
  "margin-right:calc(50% - 50vw)",
  "margin-left:calc(50% - 50vw)",
].join(";");
const correctedHeader = [
  "width:100%",
  "height:48px",
  "min-height:48px",
  "margin-right:0",
  "margin-left:0",
].join(";");

function buildCorrected(input, options) {
  const html = builderModule.buildPortableArtifact(input, options);
  const occurrences = html.split(originalHeader).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `portable report header correction expected once, found ${occurrences}`,
    );
  }
  const fallbackCorrected = html.replace(originalHeader, correctedHeader);
  const enhancedReaderCorrection = [
    "<style data-propulse-portable-overflow-correction>",
    ".analytics-top-bar{width:100%!important;",
    "margin-right:0!important;margin-left:0!important}",
    "</style>",
  ].join("");
  if (!fallbackCorrected.includes("</head>")) {
    throw new Error("portable report has no head element for the correction");
  }
  return fallbackCorrected.replace(
    "</head>",
    `${enhancedReaderCorrection}</head>`,
  );
}

async function capturePreview(path, width, height) {
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "propulse-report-preview-"));
  try {
    await browserCli.spawnChromiumDump({
      arguments: browserCli.chromiumDumpArguments({
        height,
        profilePath: join(temporaryDirectory, "profile"),
        screenshotPath: path,
        url: pathToFileURL(outputPath).href,
        virtualTimeBudgetMs: 5_000,
        width,
      }),
      executablePath: browserHelpers.resolveChromiumExecutable(),
      timeoutMs: 10_000,
    });
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

try {
  const result = await deliveryModule.deliverPortableArtifact(
    { inputPath, outputPath },
    { build: buildCorrected },
  );
  await capturePreview(desktopPreview, 1_440, 1_000);
  await capturePreview(mobilePreview, 390, 844);
  const receipt = {
    ...result,
    files: {
      artifactSha256: sha256(inputPath),
      htmlSha256: sha256(outputPath),
      desktopPreviewSha256: desktopPreview ? sha256(desktopPreview) : null,
      mobilePreviewSha256: mobilePreview ? sha256(mobilePreview) : null,
    },
    renderer: {
      officialPluginBase: "data-analytics/0.2.8-13ceeea1f599",
      isolatedCorrection: (
        "Semantic and enhanced-reader sticky headers are constrained to their "
        + "content containers so desktop scrollbar width cannot create overflow."
      ),
      artifactSchemaChanged: false,
      networkAccessRequired: false,
    },
  };
  if (receiptPath) {
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
} catch (error) {
  const result = error?.deliveryResult ?? {
    ok: false,
    stage: "invocation",
    error: error instanceof Error ? error.message : String(error),
  };
  process.stderr.write(`${JSON.stringify(result)}\n`);
  process.exitCode = 1;
}
