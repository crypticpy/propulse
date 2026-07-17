#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";


function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!key || !value) throw new Error("expected --plugin-root, --input, and --output");
    options[key] = value;
  }
  for (const key of ["plugin-root", "input", "output"]) {
    if (!options[key]) throw new Error(`missing --${key}`);
  }
  return options;
}


const options = parse(process.argv.slice(2));
const scripts = resolve(options["plugin-root"], "scripts");
const deliveryModule = await import(
  pathToFileURL(resolve(scripts, "deliver_portable_artifact.mjs")).href
);
const builderModule = await import(
  pathToFileURL(resolve(scripts, "build_portable_artifact.mjs")).href
);

// The shared reader's 100vw sticky top bar is 8px wider than the document
// when a vertical scrollbar is present. Keep the canonical renderer and
// verifier, but clip that reader-chrome-only overflow in the packaged shell.
function buildWithScrollbarFix(input, buildOptions) {
  return builderModule.buildPortableArtifact(input, buildOptions).replace(
    "</head>",
    '<style id="propulse-portable-overflow-fix">html,body{overflow-x:hidden!important}</style></head>',
  );
}

try {
  const result = await deliveryModule.deliverPortableArtifact(
    {
      inputPath: resolve(options.input),
      outputPath: resolve(options.output),
    },
    { build: buildWithScrollbarFix },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify(error.deliveryResult ?? {
    ok: false,
    code: error.code ?? "delivery_failed",
    error: error.message ?? String(error),
  })}\n`);
  process.exitCode = 1;
}
