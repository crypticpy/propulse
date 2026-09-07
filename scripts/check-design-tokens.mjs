#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * All of `src/` must express colour through the station tokens (`--su-*` /
 * the `su-` Tailwind utilities), not raw Tailwind greys or hard-coded white,
 * except the HamClock carve-out below (its own standalone palette).
 *
 * Escape hatch: put `// design-tokens: allow` (or `/* design-tokens: allow *\/`)
 * on the offending line.
 *
 * See docs/designs/design-system/README.md.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

/** Directories (repo-relative) that must be free of raw white/grey colours. */
const SCOPE = ["src"];

/**
 * Repo-relative path prefixes carved out of SCOPE. HamClock is a standalone
 * skin with its own palette (src/styles/hamclock-*.css) and is deliberately
 * not on the station tokens.
 */
const EXCLUDE = ["src/components/map/hamclock/", "src/styles/hamclock-"];

/** Matches both a file (`…/hamclock-classic.css`) and a directory (`…/hamclock`). */
const isExcluded = (path) =>
  EXCLUDE.some((prefix) => `${path}/`.startsWith(prefix));

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const STYLE_EXTENSIONS = new Set([".css"]);

/**
 * Every Tailwind utility prefix that paints a colour. Variants (`hover:`,
 * `dark:`, `group-hover:`) end in a non-word character, so the leading `\b`
 * still anchors on the prefix.
 *
 * `border` carries an optional directional infix (`border-t-white`,
 * `border-x-gray-700`, logical `border-s`/`border-e`) that the other prefixes
 * don't have, so it gets its own optional group instead of a flat list.
 */
const COLOR_PREFIX =
  "(?:bg|border(?:-[trblxyse])?|divide|ring|ring-offset|from|via|to|text|fill|stroke|outline|placeholder|decoration|shadow|caret|accent)";

/**
 * `class` rules run on every line of a scoped file: these tokens are Tailwind
 * class names and do not occur in ordinary code. `hex` rules only run on CSS
 * and on lines that carry a class attribute, so colour math in TypeScript
 * (contrast against #ffffff) stays legal.
 */
const RULES = [
  // Covers `text-white`, `bg-white/5`, `border-white/[0.08]`, `divide-white/5`.
  {
    kind: "class",
    name: "*-white",
    pattern: new RegExp(`\\b${COLOR_PREFIX}-white(?![a-z-])`),
  },
  // Covers every raw grey ramp on any colour prefix (`bg-gray-800`, …).
  {
    kind: "class",
    name: "*-gray|slate|neutral|zinc|stone-*",
    pattern: new RegExp(
      `\\b${COLOR_PREFIX}-(?:gray|slate|neutral|zinc|stone)-\\d`,
    ),
  },
  { kind: "hex", name: "#fff", pattern: /#fff\b/i },
  { kind: "hex", name: "#ffffff", pattern: /#ffffff\b/i },
  // Arbitrary-value utilities are unambiguous class tokens, so they are
  // checked on every line (multi-line className expressions included).
  { kind: "class", name: "*-[#fff]", pattern: /-\[#(?:fff|ffffff)\]/i },
];

const ALLOW = /(?:\/\/|\/\*)\s*design-tokens:\s*allow/;
const CLASS_ATTRIBUTE = /\bclassName\b|\bclass\s*=|\bclassList\b/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (isExcluded(full)) continue;
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
    files = statSync(scope).isDirectory()
      ? walk(scope)
      : isExcluded(scope)
        ? []
        : [scope];
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

const fileCount = SCOPE.reduce((count, scope) => {
  try {
    return count + (statSync(scope).isDirectory() ? walk(scope).length : 1);
  } catch {
    return count;
  }
}, 0);

console.log(
  `[design-tokens] OK — ${fileCount} file(s) free of raw white/grey colours.`,
);
