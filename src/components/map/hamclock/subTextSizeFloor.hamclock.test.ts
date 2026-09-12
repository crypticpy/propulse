/**
 * HamClock sub-text-xs guard (#808 batch 2)
 *
 * Census on `origin/main` at `6b36ce97`: `src/components/map/hamclock/`
 * holds 19 sub-floor `text-[Npx]` sites (N<12) across 3 legacy panel files.
 * Canvas/SVG sizing needs a separate census: the wall reports used 11px
 * computed minima and reduced annotations. These now have explicit 12px
 * floors; JSX expressions are checked below as well as class/object syntax.
 *
 * This batch raises all 19 sites in:
 * - `HamClockBestBandHero.tsx` (4)
 * - `HamClockDxpeditionsPanel.tsx` (8)
 * - `HamClockContestsPanel.tsx` (7)
 *
 * User-read labels (loading states, entity names, countdowns, attribution
 * links, scope labels, obs/rx counts) → `text-xs`. Zero allowlist entries.
 *
 * Sibling to `../subTextSizeFloor.test.ts` — does not edit that file so
 * batch 1 (#1172) can land independently. Reuses the same matcher grammar.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");
const HAMCLOCK_ROOT = resolve(REPO_ROOT, "src/components/map/hamclock");

/** Files this batch read and fixed — append-only for follow-ups. */
const FILES = [
  "src/components/map/hamclock/HamClockBestBandHero.tsx",
  "src/components/map/hamclock/HamClockDxpeditionsPanel.tsx",
  "src/components/map/hamclock/HamClockContestsPanel.tsx",
];

const SIZE_RE = /text-\[(?:length:)?(\d*\.?\d+)px\]/g;
const INLINE_SIZE_RE = /fontSize:\s*["']?(\d*\.?\d+)(?:px)?["']?(?![\w%.])/g;

interface SubFloorSite {
  file: string;
  line: number;
  text: string;
}

function findSubFloorSites(file: string): SubFloorSite[] {
  const absPath = resolve(REPO_ROOT, file);
  const lines = readFileSync(absPath, "utf8").split("\n");
  const sites: SubFloorSite[] = [];
  lines.forEach((line, index) => {
    for (const re of [SIZE_RE, INLINE_SIZE_RE]) {
      for (const match of line.matchAll(re)) {
        if (Number(match[1]) < 12) {
          sites.push({ file, line: index + 1, text: line });
        }
      }
    }
  });
  return sites;
}

function walkHamclockSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...walkHamclockSourceFiles(abs));
    } else if (
      /\.(tsx|ts)$/.test(entry) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      results.push(abs);
    }
  }
  return results;
}

describe("sub-text-xs sizing stays at the floor in HamClock (#808 batch 2)", () => {
  it("has no sub-floor text-[Npx] or inline fontSize in the fixed panel files", () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const site of findSubFloorSites(file)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing in batch-2 files:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("has no sub-floor text-[Npx] anywhere under src/components/map/hamclock", () => {
    const violations: string[] = [];
    for (const abs of walkHamclockSourceFiles(HAMCLOCK_ROOT)) {
      const rel = abs.slice(REPO_ROOT.length + 1);
      for (const site of findSubFloorSites(rel)) {
        violations.push(`${site.file}:${site.line}: ${site.text.trim()}`);
      }
    }
    expect(
      violations,
      `sub-floor sizing under hamclock/:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});

// JSX attributes are expressions, not object properties. Follow local numeric
// bounds rather than treating an identifier such as `fs` as automatically safe.
function svgFloorViolations(source: string): string[] {
  const file = ts.createSourceFile(
    "fixture.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const bindings = new Map<string, ts.Expression[]>();
  const attributes: ts.JsxAttribute[] = [];
  const walk = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      bindings.set(node.name.text, [
        ...(bindings.get(node.name.text) ?? []),
        node.initializer,
      ]);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(file) === "fontSize")
      attributes.push(node);
    ts.forEachChild(node, walk);
  };
  walk(file);
  const bounded = (node: ts.Expression, seen = new Set<string>()): boolean => {
    if (ts.isNumericLiteral(node) || ts.isStringLiteral(node))
      return Number(node.text.replace(/px$/, "")) >= 12;
    if (ts.isParenthesizedExpression(node))
      return bounded(node.expression, seen);
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "Math.max"
    )
      return node.arguments.some((arg) => bounded(arg, seen));
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const values = bindings.get(node.text);
      return (
        Boolean(values?.length) &&
        values!.every((value) => bounded(value, new Set([...seen, node.text])))
      );
    }
    return false;
  };
  return attributes
    .filter((node) => {
      const init = node.initializer;
      return (
        !init ||
        (ts.isJsxExpression(init)
          ? !init.expression || !bounded(init.expression)
          : !ts.isStringLiteral(init) || !bounded(init))
      );
    })
    .map(
      (node) =>
        `${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${node.getText(file)}`,
    );
}

it("requires a proven 12px lower bound for every HamClock SVG fontSize", () => {
  const violations = walkHamclockSourceFiles(HAMCLOCK_ROOT).flatMap((file) =>
    svgFloorViolations(readFileSync(file, "utf8")).map(
      (site) => `${file}: ${site}`,
    ),
  );
  expect(violations).toEqual([]);
});
it("rejects sub-floor JSX constants, computed minima, and reduced annotations", () => {
  for (const source of [
    "<text fontSize={11}/>",
    "const fs = Math.max(11, height); <text fontSize={fs}/>",
    "const fs = Math.max(12, height); <text fontSize={fs * 0.85}/>",
  ])
    expect(svgFloorViolations(source)).toHaveLength(1);
  expect(
    svgFloorViolations(
      "const fs = Math.max(12, height); <text fontSize={fs}/><text fontSize={Math.max(12, fs * 0.85)}/>",
    ),
  ).toEqual([]);
});
