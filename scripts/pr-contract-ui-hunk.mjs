#!/usr/bin/env node
/**
 * Design-review hunk classifier for pr-contract.yml.
 *
 * A visual helper can live in an excluded library (#896 round 18), so any
 * src/ file whose patch touches a colour, class name or other visual token
 * is UI. Hex matching requires a colour context (quotes, CSS `:`, or a
 * Tailwind `[#…]` arbitrary value) so issue refs like `(#326)` and
 * `Refs #994` are not treated as colours (#1086).
 *
 * A file GitHub returns no hunk for (binary or oversized) fails closed.
 *
 * Run from the default-branch checkout in pr-contract.yml so a PR cannot
 * weaken its own gate. stdin is NDJSON `{filename, patch}` objects (or a
 * JSON array of the same). Matching src/ filenames are printed one per line.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Quoted / CSS / Tailwind-arbitrary hex; not `(#123)` or a bare `#994`. */
export const HEX_COLOUR = /(?:["'`]|:[\t ]*|\[)#[0-9a-fA-F]{3,8}\b/;

export const VISUAL_TOKEN =
  /rgba?\(|hsla?\(|colou?r|className|\b(?:font|text|bg|border|shadow|opacity|animate)-/i;

export function hunkLooksLikeUi(patch) {
  if (patch == null) return true;
  return HEX_COLOUR.test(patch) || VISUAL_TOKEN.test(patch);
}

export function parsePullFiles(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return trimmed.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function uiSrcFilenamesFromPullFiles(files) {
  const names = [];
  for (const file of files) {
    const filename = file?.filename;
    if (typeof filename !== "string" || !filename.startsWith("src/")) continue;
    const patch = Object.prototype.hasOwnProperty.call(file, "patch")
      ? file.patch
      : null;
    if (hunkLooksLikeUi(patch)) names.push(filename);
  }
  return names;
}

function main() {
  const files = parsePullFiles(fs.readFileSync(0, "utf8"));
  for (const filename of uiSrcFilenamesFromPullFiles(files)) {
    console.log(filename);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
