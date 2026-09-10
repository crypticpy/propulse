/**
 * animate-pulse on measured/tinted text (#847, follow-up to #827)
 *
 * Tailwind's `animate-pulse` fades the WHOLE element it is applied to down
 * to 50% opacity at the trough. On a decorative dot that is harmless; on an
 * element that also carries the text a user reads, it halves that text's
 * contrast against its background for half of every animation cycle -- the
 * exact defect #827 found on `Badge`'s `storm` variant (2.3-3.4:1 measured,
 * see `statusTintContrast.test.ts`).
 *
 * SCOPE (read this before trusting a green run): this file certifies only
 * the `AUDITED_SITES` table below -- the 14 files #847 fixed. It is not a
 * census of every `animate-pulse` site under `src/`, and does not claim to
 * be. A first pass of this file said the defect was "fixed below, 14 files"
 * in a way that read as if those 14 were the whole story; they aren't --
 * `KNOWN_REMAINING_SITES` enumerates rendered sites that still pulse tinted
 * text and are tracked in #878, specifically so this file can't quietly
 * imply more coverage than it has. When #878 fixes one of those files, its
 * entry must be deleted here (the "still pulses" test below fails loudly
 * otherwise, which is the point -- a stale allowlist entry is a bug, not a
 * pass).
 *
 * Two independent guards, both scanning the real file text (not a fixed
 * before/after substring), because a substring match is trivially defeated
 * by reordering the classes or moving the pulse behind a `cn(...)`
 * conditional:
 *
 *   1. Element scan -- every `className` attribute (string, template
 *      literal, `cn()`/`clsx()`/`twMerge()` call, or a same-file `const x =
 *      \`...\`` template resolved through a bare `className={x}`) on a
 *      `span`/`p`/`div`/`button`. Flags it when the class set contains the
 *      pulse class together with either a `text-<color>` class or actual
 *      text-bearing content (non-whitespace text or a `{...}` child) on that
 *      same element.
 *   2. Config-map scan -- an object-literal field whose value is *exactly*
 *      the pulse class (SpotBadge's old `animate: "animate-pulse"` variant
 *      map shape) paired with a `text-<color>` field in the same
 *      object-literal block.
 *
 * `RadioBadge.tsx` is the one site where the class is assembled in a
 * `const base = \`...\`` a few lines above the JSX, not inline in the
 * attribute -- the element scan resolves that indirection so the guard keys
 * on the actual rendered className expression. Its audited-site anchor below
 * does the same: it pins the `base` template declaration, not the `pulse`
 * prop's destructuring, so deleting that dead prop later does not fail this
 * test for an unrelated reason.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

/** The class this file guards against pairing with tinted/measured text. */
const PULSE_CLASS = "animate-pulse";

/** Tailwind text-color utilities, excluding size/align/opacity utilities
 * that also start with `text-` but never touch color. */
const TEXT_COLOR_CLASS_RE = new RegExp(
  "\\btext-(?!left\\b|center\\b|right\\b|justify\\b|nowrap\\b|ellipsis\\b|" +
    "clip\\b|opacity-|xs\\b|sm\\b|base\\b|lg\\b|xl\\b|2xl\\b|3xl\\b|4xl\\b|" +
    "5xl\\b|6xl\\b|7xl\\b|8xl\\b|9xl\\b)[A-Za-z0-9-]+",
);

/** `animate-pulse-glow` is a different, shallower custom keyframe (out of
 * scope per the module doc above) -- never match it as the Tailwind pulse. */
const PULSE_CLASS_RE = new RegExp(`${PULSE_CLASS}(?!-glow)`);

const TEXT_BEARING_TAGS = new Set(["span", "p", "div", "button"]);

/** Substring (whitespace-insensitive) that must still be present -- proves
 * an audited site wasn't just deleted, so the guard can't pass on a stale
 * entry. For everything but `RadioBadge.tsx` this is the fixed class list;
 * for `RadioBadge.tsx` it is the rendered className expression itself. */
interface AuditedSite {
  file: string;
  what: string;
  anchor: string;
}

const AUDITED_SITES: AuditedSite[] = [
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "greyline GL badge",
    anchor: "bg-amber-500/20 text-amber-400",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "sporadic-E Es badge",
    anchor: "bg-purple-500/20 text-purple-400",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "band-opening OPEN badge",
    anchor: "bg-signal-green/20 text-signal-green",
  },
  {
    file: "src/components/atmos/WeatherAlertToast.tsx",
    what: "CRITICAL badge",
    anchor: "text-alert-red bg-alert-red/20 flex-shrink-0",
  },
  {
    file: "src/components/alerts/SpotAlertToast.tsx",
    what: "NEW DXCC badge",
    anchor: "bg-alert-red/20 text-alert-red",
  },
  {
    file: "src/components/alerts/AlertToast.tsx",
    what: "CRITICAL badge",
    anchor: "${colors.bg} ${colors.text}",
  },
  {
    file: "src/components/dx/DXSpotList/DXSpotList.tsx",
    what: "alert-match-count badge",
    anchor: "bg-alert-red/20 text-alert-red border border-alert-red/30",
  },
  {
    file: "src/components/contest/ContestCalendar.tsx",
    what: "LIVE badge (pulse lives on the existing dot, not the text)",
    anchor: "w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse",
  },
  {
    file: "src/components/qso/DxccStatusBadge.tsx",
    what: "status pill (pulse lives on the existing status dot, not the label)",
    anchor: '${status === "dupe" ? "bg-su-line" : ""}',
  },
  {
    file: "src/components/dx/SpotBadge.tsx",
    what: "ATNO/ALERT badge variants (no `animate` field in badgeConfig)",
    anchor: 'borderColor: "border-amber-400/60",',
  },
  {
    file: "src/components/sdr/primitives/RadioBadge.tsx",
    what: "TX/RX/etc label -- rendered className expression, not the pulse prop",
    anchor:
      "const base = `${SIZE_CLASSES[size]} rounded font-bold font-mono border ${VARIANT_CLASSES[variant]} ${className}`;",
  },
  {
    file: "src/components/qso/ConflictBadge.tsx",
    what: "sync-conflict count badge",
    anchor: "text-caution-amber transition-colors",
  },
  {
    file: "src/components/qso/LotwSyncButton.tsx",
    what: "processing button label",
    anchor: "border-plasma-orange/30",
  },
  {
    file: "src/components/contest/DupeIndicator.tsx",
    what: "DUPE badge",
    anchor:
      "text-alert-red font-bold text-sm uppercase tracking-wider high-contrast:border-alert-red high-contrast:bg-alert-red/30",
  },
  {
    file: "src/components/contest/RigStatusBar.tsx",
    what: "TX badge",
    anchor: "bg-alert-red/20 border border-alert-red/50 text-alert-red",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "countdown text (compact and full displays)",
    anchor: "text-alert-red",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "off-time warning badge",
    anchor: "bg-alert-red/20 border border-alert-red/50 text-alert-red",
  },
];

/**
 * Rendered sites (outside the 14 above) that still pulse tinted/measured
 * text. Left for #878, past #847's 15-file budget. Each entry is checked
 * below to still contain the pulse class -- when #878 fixes one, delete its
 * entry here, or this file fails and names exactly which one went stale.
 */
interface KnownRemainingSite {
  file: string;
  why: string;
}

const KNOWN_REMAINING_SITES: KnownRemainingSite[] = [
  {
    file: "src/components/contest/MultiplierTracker.tsx",
    why: "multiplier badge pulses its own tinted label text",
  },
  {
    file: "src/components/contest/ContestOneLineEntry.tsx",
    why: "same TX/multiplier-badge pattern as RigStatusBar/DupeIndicator",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexBottomBar.tsx",
    why: "TX indicator pulses its tinted label text",
  },
  {
    file: "src/components/sdr/skins/fate/FateBottomBar.tsx",
    why: "TX indicator pulses its tinted label text",
  },
  {
    file: "src/components/dx/DXSpotList/SpotRow.tsx",
    why: "the whole alert-matched row pulses, including its tinted text",
  },
  {
    file: "src/components/kiosk/KioskChrome.tsx",
    why: "CRITICAL takeover banner pulses its tinted label",
  },
  {
    file: "src/components/map/GlobeView.tsx",
    why: "the \"Logged\" chip pulses its tinted text",
  },
  {
    file: "src/components/map/OperatorProfile.tsx",
    why: "the \"Start here\" CTA pulses its tinted label",
  },
  {
    file: "src/components/map/SolarSnapshot.tsx",
    why: "tint is applied via inline style backgroundColor, not a class, but the element (and its text) still pulses",
  },
];

/** Collapse all whitespace runs to a single space so a multi-line
 * template-literal class string matches regardless of indentation. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const rawFileCache = new Map<string, string>();

function readRaw(file: string): string {
  const cached = rawFileCache.get(file);
  if (cached !== undefined) return cached;
  const raw = readFileSync(resolve(REPO_ROOT, file), "utf8");
  rawFileCache.set(file, raw);
  return raw;
}

function readNormalized(file: string): string {
  return normalize(readRaw(file));
}

// ─── Structural class-set scanner ───────────────────────────────────────────
//
// Deliberately a per-element regex/balanced-bracket scan over raw source
// text, not a real parser -- simple and readable is the goal, not full JSX
// fidelity. It is proven against the three regression shapes in the fixture
// tests below, then run for real against every AUDITED_SITES file.

/** Scan `source` starting at `openIndex` (which must point at `openChar`)
 * for the matching `closeChar`, skipping over string/template literals so a
 * `}` or `{` inside a quoted value never miscounts the depth. */
function extractBalanced(
  source: string,
  openIndex: number,
  openChar: "{" | "(",
  closeChar: "}" | ")",
): { text: string; endIndex: number } {
  let depth = 0;
  let inStr: string | null = null;
  let i = openIndex;
  for (; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === openChar) {
      depth++;
    } else if (c === closeChar) {
      depth--;
      if (depth === 0) {
        return { text: source.slice(openIndex, i + 1), endIndex: i };
      }
    }
  }
  return { text: source.slice(openIndex), endIndex: source.length - 1 };
}

/** `source[start]` must be a backtick. Returns the full template literal
 * (backticks included), treating everything inside `${...}` as opaque so a
 * stray brace in an interpolated expression can't end the template early. */
function extractTemplateLiteral(source: string, start: number): string {
  let i = start + 1;
  let exprDepth = 0;
  for (; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (exprDepth > 0) {
      if (c === "{") exprDepth++;
      else if (c === "}") exprDepth--;
      continue;
    }
    if (c === "$" && source[i + 1] === "{") {
      exprDepth = 1;
      i++;
      continue;
    }
    if (c === "`") {
      return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/** Map of `const NAME = \`template\`` declarations in `source`, so a bare
 * `className={NAME}` can be resolved to the expression it actually renders
 * (RadioBadge's `base`), instead of just the identifier text. */
function collectConstTemplateMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?=`)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source))) {
    const templateStart = declRe.lastIndex;
    const template = extractTemplateLiteral(source, templateStart);
    map.set(m[1], template);
    declRe.lastIndex = templateStart + template.length;
  }
  return map;
}

interface ClassNameSite {
  /** The class-bearing text for this site: a string literal, a template
   * literal, a `cn()`/`clsx()`/`twMerge()` call's raw text, or a resolved
   * `const` template when the attribute was a bare identifier. */
  raw: string;
  tag: string | null;
  /** Raw JSX between this element's opening and closing tag, when both were
   * found; null for self-closing elements or when the closing tag wasn't
   * locatable (nested same-name children aren't handled -- not needed for
   * the audited sites). */
  childrenText: string | null;
}

function findClassNameSites(
  source: string,
  constMap: Map<string, string>,
): ClassNameSite[] {
  const sites: ClassNameSite[] = [];
  const attrRe = /className\s*=\s*(\{|"|')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(source))) {
    const delim = m[1];
    let raw: string;
    let afterIndex: number;

    if (delim === "{") {
      const openIndex = attrRe.lastIndex - 1;
      const { text, endIndex } = extractBalanced(source, openIndex, "{", "}");
      raw = text.slice(1, -1);
      afterIndex = endIndex + 1;
      const bareId = raw.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(bareId) && constMap.has(bareId)) {
        raw = constMap.get(bareId)!;
      }
    } else {
      const contentStart = attrRe.lastIndex;
      const closeIndex = source.indexOf(delim, contentStart);
      raw = closeIndex === -1 ? "" : source.slice(contentStart, closeIndex);
      afterIndex = closeIndex === -1 ? contentStart : closeIndex + 1;
    }

    const precedingWindow = source.slice(Math.max(0, m.index - 300), m.index);
    const tagMatch = precedingWindow.match(/<([A-Za-z][\w.]*)\s[^<]*$/);
    const tag = tagMatch ? tagMatch[1] : null;

    let childrenText: string | null = null;
    if (tag) {
      const gt = source.indexOf(">", afterIndex);
      if (gt !== -1 && source[gt - 1] !== "/") {
        const closeTag = `</${tag}>`;
        const closeAt = source.indexOf(closeTag, gt);
        if (closeAt !== -1) {
          childrenText = source.slice(gt + 1, closeAt);
        }
      }
    }

    sites.push({ raw, tag, childrenText });
  }
  return sites;
}

/** True when `children` (the raw JSX between an opening and closing tag)
 * carries non-whitespace text or a `{...}` expression child -- either one
 * means a user reads something rendered by this element. */
function isTextBearingChildren(children: string | null): boolean {
  if (!children) return false;
  const withoutTags = children.replace(/<[^>]*>/g, "");
  const withoutExprChildren = withoutTags.replace(/\{[^{}]*\}/g, "");
  if (/\S/.test(withoutExprChildren)) return true;
  return /\{[^{}]*\}/.test(withoutTags);
}

/** Finds the nearest enclosing `{...}` block around `index`, used only by
 * the config-map scan below, where the caller has already confirmed `index`
 * sits inside a `key: "animate-pulse"` field (not arbitrary JSX/prose), so
 * the block found is the object literal that field belongs to. */
function findEnclosingBraceBlock(source: string, index: number): string | null {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const c = source[i];
    if (c === "}") {
      depth++;
    } else if (c === "{") {
      if (depth === 0) {
        return extractBalanced(source, i, "{", "}").text;
      }
      depth--;
    }
  }
  return null;
}

/** Element scan: flags a `span`/`p`/`div`/`button` whose className carries
 * the pulse class together with a text-color class or text-bearing
 * children. */
function findElementViolations(source: string): string[] {
  const constMap = collectConstTemplateMap(source);
  const violations: string[] = [];
  for (const site of findClassNameSites(source, constMap)) {
    if (!site.tag || !TEXT_BEARING_TAGS.has(site.tag)) continue;
    if (!PULSE_CLASS_RE.test(site.raw)) continue;
    const tinted = TEXT_COLOR_CLASS_RE.test(site.raw);
    const textBearing = isTextBearingChildren(site.childrenText);
    if (tinted || textBearing) {
      violations.push(
        `<${site.tag}> pulses with ${tinted ? "a text-color class" : "text-bearing children"} on the same element (className: ${JSON.stringify(normalize(site.raw).slice(0, 100))})`,
      );
    }
  }
  return violations;
}

/** Config-map scan: flags an object-literal field whose value is *exactly*
 * the pulse class, paired with a text-color class field in the same
 * enclosing object literal (SpotBadge's old `badgeConfig` shape). Matching
 * only a dedicated `key: "animate-pulse"` field (not any occurrence of the
 * class) keeps this from ever walking out through a JSX return statement
 * into an unrelated sibling element's className -- a plain Tailwind class
 * string never has "animate-pulse" as an entire property value on its own. */
function findConfigMapViolations(source: string): string[] {
  const fieldRe = new RegExp(`[\\w$]+\\s*:\\s*(["'])${PULSE_CLASS}\\1`, "g");
  const violations: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(source))) {
    const block = findEnclosingBraceBlock(source, m.index);
    if (block && TEXT_COLOR_CLASS_RE.test(block)) {
      violations.push(
        `object-literal block pairs a dedicated "${PULSE_CLASS}" field with a text-color class: ${normalize(block).slice(0, 120)}`,
      );
    }
  }
  return violations;
}

function scanSourceForViolations(source: string): string[] {
  return [...findElementViolations(source), ...findConfigMapViolations(source)];
}

describe("scanSourceForViolations catches every spelling (fixture proofs, #878)", () => {
  it("catches the pulse class written before the tint classes", () => {
    const fixture =
      '<span className="animate-pulse bg-amber-500/20 text-amber-400">GL</span>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches the pulse class added via a cn() conditional", () => {
    const fixture =
      '<span className={cn("bg-amber-500/20 text-amber-400", isLive && "animate-pulse")}>GL</span>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches the pulse class paired with a text color in a config-map object literal", () => {
    const fixture = `
      const badgeConfig = {
        alert: {
          textColor: "text-alert-red",
          animate: "animate-pulse",
        },
      };
    `;
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a decorative sibling with no text-bearing signal", () => {
    const fixture =
      '<span className="h-2 w-2 rounded-full bg-alert-red animate-pulse" aria-hidden />';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });
});

describe("animate-pulse does not ship on tinted/measured text at the audited sites (#847)", () => {
  it("has no reintroduced pulse-on-text in any of the 14 audited files", () => {
    const files = Array.from(new Set(AUDITED_SITES.map((s) => s.file)));
    const violations = files.flatMap((file) => {
      const found = scanSourceForViolations(readRaw(file));
      return found.map((v) => `${file}: ${v}`);
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("every audited site still exists in its file", () => {
    // Proves the table isn't stale: if a site was deleted (or its markup
    // changed enough that the anchor no longer matches) without updating
    // this entry, that's a silent gap in coverage, not a pass.
    for (const site of AUDITED_SITES) {
      const content = readNormalized(site.file);
      expect(
        content.includes(normalize(site.anchor)),
        `${site.file}: "${site.what}" anchor not found -- update or remove this entry`,
      ).toBe(true);
    }
  });
});

describe("known-remaining pulse-on-text sites still need #878", () => {
  it("every KNOWN_REMAINING_SITES file still contains the pulse class", () => {
    // This is an allowlist-freshness check, not a passing grade: it fails
    // (and names the file) the moment #878 fixes one of these, so the entry
    // has to be deleted rather than silently going stale.
    for (const site of KNOWN_REMAINING_SITES) {
      const content = readNormalized(site.file);
      expect(
        content.includes(PULSE_CLASS),
        `${site.file}: no longer contains "${PULSE_CLASS}" -- ${site.why} -- delete this KNOWN_REMAINING_SITES entry (#878)`,
      ).toBe(true);
    }
  });
});
