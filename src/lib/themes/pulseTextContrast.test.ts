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
 * SCOPE (read this before trusting a green run): `AUDITED_SITES` and
 * `KNOWN_REMAINING_SITES` together are, as of this commit, the enumerated
 * set of every text-bearing `animate-pulse` site under `src/` -- not just
 * the 14 files #847 originally fixed. Two earlier passes of this file each
 * claimed a scope narrower than the real one: the first said "fixed below,
 * 14 files" as if that were the whole story; the second added
 * `KNOWN_REMAINING_SITES` but described it only as "the sites #878 already
 * knows about," which stayed silently true even after Codex found two more
 * unlisted ones in review round 4 (`RegionPresetManager.tsx`,
 * `FateBandActivity.tsx`) that a file-level "does this file still contain
 * animate-pulse" check could never catch. Rather than add those two by
 * hand and repeat the pattern a fifth time, this pass ran the census below
 * once over the whole tree and closed the family:
 *
 *   find src -type f \( -name '*.ts' -o -name '*.tsx' \) \
 *     -not -name '*.test.ts' -not -name '*.test.tsx' \
 *     -not -name '*.spec.ts' -not -name '*.spec.tsx' -not -name '*.d.ts' \
 *     -print0 | xargs -0 grep -l 'animate-pulse'
 *
 * followed by running the same structural scanner used everywhere else in
 * this file (`scanSourceForViolations`) against every match. `listSourceFiles`
 * and the "no unlisted text-bearing animate-pulse site" test below do this
 * in-process on every run, so the claim stays checked, not just asserted in
 * a comment. Fixed sites are tracked in `AUDITED_SITES`; unfixed ones (past
 * #847's original budget, tracked in #878) are tracked in
 * `KNOWN_REMAINING_SITES`. A new unlisted site -- whether a fresh regression
 * or a genuinely new component -- now fails the census test by name instead
 * of staying invisible until the next manual sweep. When #878 fixes one of
 * the `KNOWN_REMAINING_SITES` entries, its entry must be deleted here (the
 * "still pulses" test below fails loudly otherwise, which is the point -- a
 * stale allowlist entry is a bug, not a pass).
 *
 * One documented gap the census cannot see: `SpotRow.tsx`'s pulse class is
 * assembled through a `useMemo`-built `rowClasses` value with ternary
 * branches inside a plain `return` template, not a `className=` attribute
 * or a same-file `const x = \`...\`` the element scan can resolve. Its
 * `KNOWN_REMAINING_SITES` entry stays covered only by the anchor/window
 * freshness check further down, not by the structural census -- a
 * deliberate, honestly-documented limitation rather than a scanner rewrite
 * to handle arbitrary indirection.
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
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
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
 * Every other rendered site under `src/` (outside the 14 `AUDITED_SITES`
 * files) that the repo-wide census described in the header comment found
 * still pulsing tinted/measured text, as of this commit. Left for #878.
 * Many of these files (`OperatorProfile.tsx`, `SolarSnapshot.tsx`,
 * `SpotRow.tsx`, `FlexBottomBar.tsx`, `TurnTimer.tsx`, and others below)
 * also carry unrelated, out-of-scope decorative `animate-pulse` sites -- a
 * plain "does this file still contain the pulse class" check can't tell
 * those apart from the tracked one, so it stays green forever even after
 * #878 fixes the tracked site (Codex, PR #874 round 3; two more sites this
 * exact way slipped past round 3 into round 4 before the census below
 * closed the family). Each entry instead carries an `anchor`: a short
 * snippet unique within its file, taken from right next to (but not
 * containing) the tracked element's `animate-pulse`. `anchoredSiteStillPulses`
 * below finds the anchor and checks only the text immediately around it, so
 * fixing the tracked element turns that entry red even when a decorative
 * pulse elsewhere in the same file is untouched -- when #878 fixes one,
 * delete its entry here, or this file fails and names exactly which one
 * went stale. The same anchors double as the completeness census's
 * coverage list further down: a violation the census finds that isn't near
 * any anchor for its file is, by definition, not named in either table.
 */
interface KnownRemainingSite {
  file: string;
  why: string;
  /** Short snippet, unique within `file`, adjacent to the tracked element's
   * `animate-pulse` but not containing it -- identifies *which* pulse this
   * entry is about in a file with more than one. */
  anchor: string;
}

const KNOWN_REMAINING_SITES: KnownRemainingSite[] = [
  {
    file: "src/components/contest/MultiplierTracker.tsx",
    why: "multiplier badge pulses its own tinted label text",
    anchor: "isNew ?",
  },
  {
    file: "src/components/contest/ContestOneLineEntry.tsx",
    why: "same TX/multiplier-badge pattern as RigStatusBar/DupeIndicator",
    anchor: "bg-alert-red/20 text-alert-red border-2 border-alert-red/50",
  },
  {
    file: "src/components/sdr/skins/flexible/FlexBottomBar.tsx",
    why: "TX indicator pulses its tinted label text",
    anchor:
      "rounded bg-alert-red px-1.5 py-0.5 text-[10px] font-bold text-su-canvas leading-none",
  },
  {
    file: "src/components/sdr/skins/fate/FateBottomBar.tsx",
    why: "TX indicator pulses its tinted label text",
    anchor: "shadow-[0_0_8px_rgba(255,68,68,0.5)]",
  },
  {
    file: "src/components/dx/DXSpotList/SpotRow.tsx",
    why: "the whole alert-matched row pulses, including its tinted text",
    anchor: "${base} bg-alert-red/10",
  },
  {
    file: "src/components/kiosk/KioskChrome.tsx",
    why: "CRITICAL takeover banner pulses its tinted label",
    anchor: "border-alert-red bg-alert-red/10",
  },
  {
    file: "src/components/map/GlobeView.tsx",
    why: "the \"Logged\" chip pulses its tinted text",
    anchor: "data-logged-chip",
  },
  {
    file: "src/components/map/OperatorProfile.tsx",
    why: "the \"Start here\" CTA pulses its tinted label",
    anchor:
      "bg-plasma-orange/10 border border-plasma-orange/30 px-3 py-2.5 mb-2 text-left",
  },
  {
    file: "src/components/map/SolarSnapshot.tsx",
    why: "tint is applied via inline style backgroundColor, not a class, but the element (and its text) still pulses",
    anchor: "greylineStatus.isActive ?",
  },
  {
    file: "src/components/map/SolarSnapshot.tsx",
    why: "the loading placeholder pulses its own text",
    anchor: "Loading...",
  },
  {
    file: "src/components/map/SolarSnapshot.tsx",
    why: "the storm-risk warning pulses its own tinted text",
    anchor: "Storm risk - HF may be degraded",
  },
  {
    file: "src/components/alerts/AlertToastContainer.tsx",
    why: "the queued-critical-alerts counter pulses its own tinted text",
    anchor: "+{queuedCount} more alert",
  },
  {
    file: "src/components/dx/BandVerdictPanel.tsx",
    why: "the band ladder chip pulses its own tinted label when a surprise opening is detected",
    anchor: "LADDER_LABEL[entry.stable]",
  },
  {
    file: "src/components/dx/LogStatsCard.tsx",
    why: "the stats-loading label pulses its own text",
    anchor: "Loading...",
  },
  {
    file: "src/components/layout/Header.tsx",
    why: "the critical-alert bell button pulses with its own tinted text-color class (its icon inherits currentColor)",
    anchor: "text-caution-amber hover:bg-caution-amber/10",
  },
  {
    file: "src/components/layout/MobileHeader.tsx",
    why: "the critical-alert bell button pulses with its own tinted text-color class (its icon inherits currentColor)",
    anchor: "text-caution-amber hover:bg-caution-amber/10",
  },
  {
    file: "src/components/map/PropagationForecast.tsx",
    why: "the loading-forecast message pulses its own text",
    anchor: "Loading forecast data...",
  },
  {
    file: "src/components/map/PropagationForecastMini.tsx",
    why: "the loading-forecast message pulses its own text",
    anchor: "Loading forecast...",
  },
  {
    file: "src/components/map/PropagationForecastMini.tsx",
    why: "the pending-nowcast ellipsis pulses its own tinted text",
    anchor: "modelNowCast.pending",
  },
  {
    file: "src/components/map/RecommendationsPanel.tsx",
    why: "the analyzing-propagation message pulses its own text",
    anchor: "Analyzing propagation...",
  },
  {
    file: "src/components/map/RegionPresetManager.tsx",
    why: "the export-feedback toast pulses its own tinted text (Codex, PR #874 round 4)",
    anchor: "Export feedback toast",
  },
  {
    file: "src/components/nets/TurnTimer.tsx",
    why: "the expired-timer countdown text pulses its own tinted color",
    anchor: "{timeText}",
  },
  {
    file: "src/components/profile/ActivityFeed.tsx",
    why: "the loading indicator pulses its own tinted text",
    anchor: "Loading...",
  },
  {
    file: "src/components/profile/FriendList.tsx",
    why: "the loading indicator pulses its own tinted text",
    anchor: "Loading...",
  },
  {
    file: "src/components/profile/QRCodeModal.tsx",
    why: "the share-status toast pulses its own tinted text",
    anchor: "Share status toast",
  },
  {
    file: "src/components/profile/ShareCard.tsx",
    why: "the share-status toast pulses its own tinted text",
    anchor: "Share status toast",
  },
  {
    file: "src/components/sdr/skins/fate/FateBandActivity.tsx",
    why: "the empty-state \"waiting for decodes\" label pulses its own tinted text (Codex, PR #874 round 4)",
    anchor: "Waiting for decodes",
  },
  {
    file: "src/components/shack/builder/BuilderCanvas.tsx",
    why: "the whole empty-canvas drop zone pulses while dragging, including its \"Drop here to add\" child text",
    anchor: "shadow-[inset_0_0_40px_rgba(255,107,53,0.08)]",
  },
  {
    file: "src/components/ui/LoadingSpinner.tsx",
    why: "the optional loading-spinner label pulses its own tinted text",
    anchor: "Optional loading text",
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

/** How many normalized characters on each side of an anchor match are
 * searched for the pulse class. Wide enough to reach the farthest
 * anchor-to-its-own-pulse gap among KNOWN_REMAINING_SITES today (142 chars,
 * GlobeView's `data-logged-chip` attribute, which sits after the className
 * it identifies); narrow enough to stay well clear of the closest gap
 * between two *different* pulses in one of those files (194 chars, between
 * FlexBottomBar's decorative LIVE dot and its TX badge). See the fixture
 * proof below for the general case this constant has to hold for. */
const ANCHOR_WINDOW_RADIUS = 160;

/** Finds `anchor` in already-normalized `content` and reports whether an
 * `animate-pulse` occurrence sits within `ANCHOR_WINDOW_RADIUS` characters
 * of it. Operating on a window around a specific anchor -- instead of
 * scanning the whole file for the pulse class -- is what lets a file with
 * several `animate-pulse` sites go red when only the anchored one is fixed,
 * while a decorative pulse elsewhere in the same file (outside the window)
 * is left alone and can't hide the regression. */
function findAnchoredPulseState(
  content: string,
  anchor: string,
): { anchorFound: boolean; stillPulses: boolean } {
  const anchorNorm = normalize(anchor);
  const idx = content.indexOf(anchorNorm);
  if (idx === -1) return { anchorFound: false, stillPulses: false };
  const windowStart = Math.max(0, idx - ANCHOR_WINDOW_RADIUS);
  const windowEnd = Math.min(
    content.length,
    idx + anchorNorm.length + ANCHOR_WINDOW_RADIUS,
  );
  return {
    anchorFound: true,
    stillPulses: PULSE_CLASS_RE.test(content.slice(windowStart, windowEnd)),
  };
}

function anchoredSiteStillPulses(
  file: string,
  anchor: string,
): { anchorFound: boolean; stillPulses: boolean } {
  return findAnchoredPulseState(readNormalized(file), anchor);
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
  /** Character offset of the start of this site's class content (right
   * after the opening `{`/`"`/`'`), *not* the `className=` keyword --
   * carried through to `Violation.index` (offset further still, to the
   * pulse token itself) so the completeness census below can tell whether a
   * specific violation sits near a registered anchor, without re-scanning
   * the file. Stays pinned to the original attribute location even when
   * `raw` below gets swapped for a resolved `const` template (RadioBadge),
   * since that substitution changes what `raw` says but not where the
   * attribute the guard cares about actually is. */
  index: number;
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
    const contentStart = attrRe.lastIndex;
    let raw: string;
    let afterIndex: number;

    if (delim === "{") {
      const openIndex = contentStart - 1;
      const { text, endIndex } = extractBalanced(source, openIndex, "{", "}");
      raw = text.slice(1, -1);
      afterIndex = endIndex + 1;
      const bareId = raw.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(bareId) && constMap.has(bareId)) {
        raw = constMap.get(bareId)!;
      }
    } else {
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

    sites.push({ raw, tag, childrenText, index: contentStart });
  }
  return sites;
}

/** Strips every top-level `{...}` expression out of `text`, tracking nested
 * braces properly (via `extractBalanced`) so a `.map()` callback's own
 * internal `{...}` can't be mistaken for the end of the expression it's
 * nested in. Returns the leftover literal text plus the list of stripped
 * expression blocks (braces included), so a caller can tell "there was an
 * expression here" apart from "here's what was inside it". A naive
 * `/\{[^{}]*\}/g` strip (the pre-#878-round-4 version of this function)
 * cannot see past the first inner `}` in a nested expression and leaves JS
 * syntax noise behind that reads as false text content -- this is what
 * produced a false positive on `QSOLogStats.tsx`'s `.map()`-rendered
 * skeleton loader. */
function stripBalancedExpressions(text: string): {
  withoutExpr: string;
  blocks: string[];
} {
  let withoutExpr = "";
  const blocks: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      const { text: block, endIndex } = extractBalanced(text, i, "{", "}");
      blocks.push(block);
      i = endIndex + 1;
      continue;
    }
    withoutExpr += text[i];
    i++;
  }
  return { withoutExpr, blocks };
}

/** True when `children` (the raw JSX between an opening and closing tag)
 * carries non-whitespace text, or a `{...}` expression child that renders a
 * simple value rather than delegating to a `.map()`/arrow-callback
 * sub-render (which produces further elements, not text on *this*
 * element). */
function isTextBearingChildren(children: string | null): boolean {
  if (!children) return false;
  const withoutTags = children.replace(/<[^>]*>/g, "");
  const { withoutExpr, blocks } = stripBalancedExpressions(withoutTags);
  if (/\S/.test(withoutExpr)) return true;
  return blocks.some((block) => !/\.map\(|=>/.test(block));
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

/** One instance of the pulse-on-text defect found by the structural
 * scanners below. */
interface Violation {
  description: string;
  /** Character offset into the *normalized* source (see `normalize`) where
   * this violation's className/field starts. Lets the completeness census
   * further down check whether an `AUDITED_SITES`/`KNOWN_REMAINING_SITES`
   * anchor registered for the same file sits within `ANCHOR_WINDOW_RADIUS`
   * of it -- i.e. that this is the specific site an entry already names,
   * not some other unlisted one -- without re-parsing the file. */
  index: number;
}

/** Element scan: flags a `span`/`p`/`div`/`button` whose className carries
 * the pulse class together with a text-color class or text-bearing
 * children. `normalizedSource` must already be whitespace-normalized (see
 * `normalize`) -- `scanSourceForViolations` does this once for both scans
 * so every `Violation.index` shares one coordinate space with the anchors
 * they're compared against. */
function findElementViolations(normalizedSource: string): Violation[] {
  const constMap = collectConstTemplateMap(normalizedSource);
  const violations: Violation[] = [];
  for (const site of findClassNameSites(normalizedSource, constMap)) {
    if (!site.tag || !TEXT_BEARING_TAGS.has(site.tag)) continue;
    const pulseMatch = PULSE_CLASS_RE.exec(site.raw);
    if (!pulseMatch) continue;
    const tinted = TEXT_COLOR_CLASS_RE.test(site.raw);
    const textBearing = isTextBearingChildren(site.childrenText);
    if (tinted || textBearing) {
      violations.push({
        description: `<${site.tag}> pulses with ${tinted ? "a text-color class" : "text-bearing children"} on the same element (className: ${JSON.stringify(normalize(site.raw).slice(0, 100))})`,
        // Offset past the pulse token itself, not the attribute's start --
        // a long template-literal className can put the two hundreds of
        // characters apart, which would otherwise put an anchor picked
        // (per convention) right next to the pulse token outside the
        // window of a violation indexed at the attribute's start.
        index: site.index + pulseMatch.index,
      });
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
 * string never has "animate-pulse" as an entire property value on its own.
 * `normalizedSource` must already be whitespace-normalized, same reason as
 * `findElementViolations`. */
function findConfigMapViolations(normalizedSource: string): Violation[] {
  const fieldRe = new RegExp(`[\\w$]+\\s*:\\s*(["'])${PULSE_CLASS}\\1`, "g");
  const violations: Violation[] = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(normalizedSource))) {
    const block = findEnclosingBraceBlock(normalizedSource, m.index);
    if (block && TEXT_COLOR_CLASS_RE.test(block)) {
      violations.push({
        description: `object-literal block pairs a dedicated "${PULSE_CLASS}" field with a text-color class: ${normalize(block).slice(0, 120)}`,
        index: m.index,
      });
    }
  }
  return violations;
}

function scanSourceForViolations(source: string): Violation[] {
  const normalized = normalize(source);
  return [
    ...findElementViolations(normalized),
    ...findConfigMapViolations(normalized),
  ];
}

// ─── Repo-wide completeness census (#878 round 4) ──────────────────────────
//
// Reproduces, in-process, the census this pass ran by hand:
//
//   find src -type f \( -name '*.ts' -o -name '*.tsx' \) \
//     -not -name '*.test.ts' -not -name '*.test.tsx' \
//     -not -name '*.spec.ts' -not -name '*.spec.tsx' -not -name '*.d.ts' \
//     -print0 | xargs -0 grep -l 'animate-pulse'
//
// then structurally scanning every match, so the next unlisted text-bearing
// pulse site fails a test by name instead of waiting for the next manual
// sweep. Deliberately not an AST walk -- `scanSourceForViolations` is
// already proven against the fixture and audited-site tests above, so this
// reuses it rather than adding a second scanning strategy to keep in sync.

const SRC_ROOT = resolve(REPO_ROOT, "src");

/** Recursively lists every `.ts`/`.tsx` file under `dir`, returned as
 * `src/...` paths (forward-slash, relative to `REPO_ROOT`) matching the
 * `file` field used throughout this module. Excludes `*.test.ts(x)` and
 * `*.spec.ts(x)` -- this file and others legitimately contain the literal
 * string "animate-pulse" inside fixtures, which would otherwise flag
 * themselves -- and `.d.ts` declaration files, which never render
 * anything. */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(abs));
      continue;
    }
    if (entry.name.endsWith(".d.ts")) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    out.push(relative(REPO_ROOT, abs).split(sep).join("/"));
  }
  return out;
}

/** Every anchor registered for `file` across both tables -- the set of
 * pulse sites this module already claims to know about. */
function registeredAnchorsFor(file: string): string[] {
  const anchors: string[] = [];
  for (const site of AUDITED_SITES) if (site.file === file) anchors.push(site.anchor);
  for (const site of KNOWN_REMAINING_SITES)
    if (site.file === file) anchors.push(site.anchor);
  return anchors;
}

/** True when some anchor registered for `file` sits within
 * `ANCHOR_WINDOW_RADIUS` of `violationIndex` in `normalizedContent` -- the
 * same window `findAnchoredPulseState` uses, so "this violation is the one
 * an entry names" and "this anchor's pulse is still present" agree on what
 * "near" means. A violation with no such anchor nearby is, by definition,
 * unlisted. */
function violationIsCovered(
  file: string,
  normalizedContent: string,
  violationIndex: number,
): boolean {
  for (const anchor of registeredAnchorsFor(file)) {
    const anchorNorm = normalize(anchor);
    const anchorIndex = normalizedContent.indexOf(anchorNorm);
    if (anchorIndex === -1) continue;
    const windowStart = Math.max(0, anchorIndex - ANCHOR_WINDOW_RADIUS);
    const windowEnd = anchorIndex + anchorNorm.length + ANCHOR_WINDOW_RADIUS;
    if (violationIndex >= windowStart && violationIndex <= windowEnd) return true;
  }
  return false;
}

/** Runs the census: every text-bearing `animate-pulse` violation under
 * `src/` that isn't named by an anchor in `AUDITED_SITES` or
 * `KNOWN_REMAINING_SITES` for its file. A fast `includes` pre-filter skips
 * the structural scan entirely for the large majority of files that don't
 * mention the pulse class at all, keeping this a single pass over `src/`
 * rather than a slow one.
 *
 * Known gap: `SpotRow.tsx` builds its pulse class through a `useMemo`
 * ternary the element scan can't resolve to a `className=` site (see the
 * header comment), so its tracked violation never appears here -- it stays
 * covered only by the anchor/window freshness test below. */
function findUncoveredPulseSites(): string[] {
  const uncovered: string[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const raw = readRaw(file);
    if (!raw.includes(PULSE_CLASS)) continue;
    const normalized = normalize(raw);
    for (const violation of scanSourceForViolations(raw)) {
      if (!violationIsCovered(file, normalized, violation.index)) {
        uncovered.push(`${file}: ${violation.description}`);
      }
    }
  }
  return uncovered;
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
      return found.map((v) => `${file}: ${v.description}`);
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

describe("findAnchoredPulseState pins a specific pulse in a multi-pulse file (#878)", () => {
  it("stays true while the anchored pulse remains, regardless of a distant decorative one", () => {
    const filler = "x".repeat(300);
    const before = `<span aria-hidden className="decorative dot animate-pulse" />${filler}<span data-tracked className="tracked-anchor text-alert-red animate-pulse">CQ</span>`;
    expect(findAnchoredPulseState(before, "tracked-anchor")).toEqual({
      anchorFound: true,
      stillPulses: true,
    });
  });

  it("goes false when only the anchored pulse is removed, even though the decorative one is untouched", () => {
    const filler = "x".repeat(300);
    const after = `<span aria-hidden className="decorative dot animate-pulse" />${filler}<span data-tracked className="tracked-anchor text-alert-red">CQ</span>`;
    expect(findAnchoredPulseState(after, "tracked-anchor")).toEqual({
      anchorFound: true,
      stillPulses: false,
    });
  });

  it("reports the anchor as missing rather than a false pulse when it can't be found", () => {
    expect(findAnchoredPulseState("no anchor here", "tracked-anchor")).toEqual(
      { anchorFound: false, stillPulses: false },
    );
  });
});

describe("known-remaining pulse-on-text sites still need #878", () => {
  it("every KNOWN_REMAINING_SITES anchor is unique within its file", () => {
    for (const site of KNOWN_REMAINING_SITES) {
      const content = readNormalized(site.file);
      const anchorNorm = normalize(site.anchor);
      const first = content.indexOf(anchorNorm);
      const last = content.lastIndexOf(anchorNorm);
      expect(
        first,
        `${site.file}: anchor "${site.anchor}" not found -- fix this KNOWN_REMAINING_SITES entry`,
      ).not.toBe(-1);
      expect(
        first === last,
        `${site.file}: anchor "${site.anchor}" is not unique in the file -- pick a more specific snippet for this KNOWN_REMAINING_SITES entry`,
      ).toBe(true);
    }
  });

  it("every KNOWN_REMAINING_SITES anchored element still pulses", () => {
    // This is an allowlist-freshness check, not a passing grade: it asserts
    // that KNOWN_REMAINING_SITES is still an accurate, complete list of
    // known-outstanding text-bearing pulse sites, not that any of them are
    // fine to leave. Unlike a whole-file "does this still contain
    // animate-pulse" check, this looks only at the text around each entry's
    // own anchor -- so it fails (and names the file) the moment #878 fixes
    // the SPECIFIC tracked element, even when the same file still has an
    // unrelated decorative pulse left untouched. When that happens, delete
    // the entry.
    for (const site of KNOWN_REMAINING_SITES) {
      const { anchorFound, stillPulses } = anchoredSiteStillPulses(
        site.file,
        site.anchor,
      );
      expect(
        anchorFound,
        `${site.file}: anchor "${site.anchor}" not found -- ${site.why} -- delete this stale KNOWN_REMAINING_SITES entry (#878)`,
      ).toBe(true);
      expect(
        stillPulses,
        `${site.file}: the anchored element ("${site.why}") no longer pulses -- delete this stale KNOWN_REMAINING_SITES entry (#878)`,
      ).toBe(true);
    }
  });
});

describe("no unlisted text-bearing animate-pulse site exists in src/ (#878 round 4 census)", () => {
  it("every violation the census finds is named in AUDITED_SITES or KNOWN_REMAINING_SITES", () => {
    // AUDITED_SITES + KNOWN_REMAINING_SITES claim, as of this commit, to be
    // the enumerated set of every text-bearing animate-pulse site under
    // src/ -- not just the sites someone happened to notice. This test is
    // what makes that claim checked instead of asserted: it re-derives the
    // set from scratch (the same census command in the header comment) and
    // fails, naming the exact file and violation, the moment a site exists
    // in neither table -- a fresh regression, a genuinely new component, or
    // (per #878 round 4) a site that was always there but never listed.
    const uncovered = findUncoveredPulseSites();
    expect(
      uncovered,
      `${uncovered.length} unlisted text-bearing animate-pulse site(s) -- ` +
        `add each to KNOWN_REMAINING_SITES with an anchor (or fix it and add ` +
        `it to AUDITED_SITES):\n${uncovered.join("\n")}`,
    ).toEqual([]);
  });
});
