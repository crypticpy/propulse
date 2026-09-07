#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * Migrated areas must express colour through the station tokens (`--su-*` /
 * the `su-` Tailwind utilities), not raw Tailwind greys or hard-coded white.
 * Once a directory is listed in SCOPE below it cannot regress.
 *
 * Each task that migrates an area appends its directory to SCOPE.
 * Escape hatch: put `// design-tokens: allow` (or `/* design-tokens: allow *\/`)
 * on the offending line.
 *
 * See docs/designs/design-system/README.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

/** Directories (repo-relative) that must be free of raw white/grey colours. */
const SCOPE = [
  "src/components/station-ui",
  "src/components/home",
  "src/pages/Home.tsx",
  "src/styles/home.css",
];

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const STYLE_EXTENSIONS = new Set([".css"]);

/**
 * `class` rules run on every line of a scoped file: these tokens are Tailwind
 * class names and do not occur in ordinary code. `hex` rules only run on CSS
 * and on lines that carry a class attribute, so colour math in TypeScript
 * (contrast against #ffffff) stays legal.
 */
const RULES = [
  { kind: "class", name: "text-white", pattern: /\btext-white\b/ },
  { kind: "class", name: "text-gray-*", pattern: /\btext-gray-\d/ },
  { kind: "class", name: "text-slate-*", pattern: /\btext-slate-\d/ },
  { kind: "class", name: "bg-slate-*", pattern: /\bbg-slate-\d/ },
  { kind: "class", name: "text-neutral-*", pattern: /\btext-neutral-\d/ },
  { kind: "hex", name: "#fff", pattern: /#fff\b/i },
  { kind: "hex", name: "#ffffff", pattern: /#ffffff\b/i },
];

const ALLOW = /(?:\/\/|\/\*)\s*design-tokens:\s*allow/;
const CLASS_ATTRIBUTE = /\bclassName\b|\bclass\s*=|\bclassList\b/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
      continue;
    }
    const ext = extname(entry);
    if (CODE_EXTENSIONS.has(ext) || STYLE_EXTENSIONS.has(ext)) files.push(full);
  }
  return files;
}

const violations = [];

for (const scope of SCOPE) {
  let files;
  try {
    files = statSync(scope).isDirectory() ? walk(scope) : [scope];
  } catch {
    console.error(`\n[design-tokens] SCOPE entry not found: ${scope}`);
    process.exit(1);
  }

  for (const file of files) {
    const isStyle = STYLE_EXTENSIONS.has(extname(file));
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (ALLOW.test(line)) return;
      const inClassString = isStyle || CLASS_ATTRIBUTE.test(line);
      for (const rule of RULES) {
        if (rule.kind === "hex" && !inClassString) continue;
        if (!rule.pattern.test(line)) continue;
        violations.push(
          `${relative(process.cwd(), file)}:${index + 1}  ${rule.name}  ${line.trim().slice(0, 120)}`,
        );
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `\n[design-tokens] ${violations.length} raw colour(s) in migrated areas:\n`,
  );
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    "\nUse the station tokens instead (text-su-text, text-su-muted, bg-su-panel, border-su-line, …).",
  );
  console.error(
    "Migration map: docs/designs/design-system/README.md. Deliberate exceptions carry `// design-tokens: allow` on the line.\n",
  );
  process.exit(1);
}

console.log(
  `[design-tokens] OK — ${SCOPE.length} scoped path(s) free of raw white/grey colours.`,
);
