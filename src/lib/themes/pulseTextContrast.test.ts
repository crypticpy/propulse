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
 * `KNOWN_REMAINING_SITES` entries (one per pulsing branch: alert match and
 * scroll-to-selected highlight) stay covered only by the anchor/window
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
 *      intrinsic text-bearing element (any lowercase tag except graphics,
 *      media and void elements). Flags it when the class set contains the
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

/** Intrinsic elements that never carry rendered text of their own (graphics,
 * media, void and embedded content). Every other lowercase HTML tag is
 * treated as text-bearing -- `a`, headings, `label`, `li`, `td`, `input`,
 * `textarea` and the rest -- so a pulsing tinted link or heading is caught
 * the same way a `span` is (Codex, PR #874 round 6: a four-tag whitelist let
 * those through unscanned). Capitalised component tags stay skipped: what
 * they render is not knowable from the call site. */
const NON_TEXT_TAGS = new Set([
  "svg", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "g", "defs", "use", "mask", "clipPath", "linearGradient", "radialGradient",
  "stop", "pattern", "filter", "img", "picture", "source", "canvas", "video",
  "audio", "track", "iframe", "object", "embed", "hr", "br", "wbr", "area",
  "map", "progress", "meter",
]);
function isTextBearingTag(tag: string): boolean {
  return /^[a-z]/.test(tag) && !NON_TEXT_TAGS.has(tag);
}

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
    what: "countdown text (compact display)",
    anchor: "font-mono text-sm font-bold tabular-nums ${",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "countdown text (full display)",
    anchor: "font-mono text-2xl font-black tabular-nums tracking-wider ${",
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
    file: "src/components/dx/DXSpotList/SpotRow.tsx",
    why: "the scroll-to-selected highlight pulses the whole selected/needed row, including its tinted text; a second indirect site in the same rowClasses memo, outside the alert-match anchor's window (Codex, PR #874 round 5)",
    anchor: "ring-2 ring-su-accent-edge ring-inset",
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

/** Index just past the end of the `const NAME = <this>` initializer that
 * starts at `valueStart`, found by scanning forward and tracking
 * paren/bracket/brace depth (so a `;`, `,` or keyword inside a nested call,
 * ternary or object literal is never mistaken for the statement boundary),
 * skipping over quoted strings and template literals whole (a `${...}`
 * section's own braces never affect depth here since `extractTemplateLiteral`
 * consumes the whole literal in one step). Stops at a `;` found at zero
 * depth (not consumed); a missing semicolon falls back to the first `}` that
 * would close an outer block, or the start of the next top-level
 * `const`/`function`/`export`, whichever comes first -- a defensive
 * fallback a real parser wouldn't need (Codex, PR #874 round 15). */
function findInitializerEnd(source: string, valueStart: number): number {
  let depth = 0;
  let i = valueStart;
  while (i < source.length) {
    const c = source[i];
    if (c === "`") {
      i += extractTemplateLiteral(source, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1) return source.length;
      i = close + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]") {
      if (depth > 0) depth--;
      i++;
      continue;
    }
    if (c === "}") {
      if (depth === 0) return i;
      depth--;
      i++;
      continue;
    }
    if (depth === 0) {
      if (c === ";") return i;
      if (
        (c === "c" || c === "f" || c === "e") &&
        !/[\w$]/.test(source[i - 1] ?? "") &&
        /^(const|function|export)\b/.test(source.slice(i, i + 9))
      ) {
        return i;
      }
    }
    i++;
  }
  return source.length;
}

/** Every string-literal or template-literal *body* found anywhere inside
 * `text`, delimiters stripped, in source order -- a template's `${...}`
 * section is kept as raw text (so an identifier there is left in place for
 * `resolveConstRefs` to substitute), and text outside any literal (call
 * names, operators, ternary punctuation, bare identifiers) is dropped. Used
 * to compose the resolved class text for a `const` initializer more complex
 * than a single literal -- `"text-alert-red " + (live ? "animate-pulse" :
 * "")`, `cn("text-alert-red", live && "animate-pulse")` -- by keeping only
 * the meaningful string content (Codex, PR #874 round 15). */
function extractLiteralBodies(text: string): string[] {
  const bodies: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      const full = extractTemplateLiteral(text, i);
      bodies.push(full.slice(1, -1));
      i += full.length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close === -1) break;
      bodies.push(text.slice(i + 1, close));
      i = close + 1;
      continue;
    }
    i++;
  }
  return bodies;
}

/** One key's resolved value inside an object-literal const: `literal` is
 * every string/template literal body found anywhere inside that key's value
 * (the fail-closed fallback once a further access on this entry can't be
 * narrowed precisely); `entries` is present only when the value is itself an
 * object literal, mapping *its* top-level keys the same way -- recursively,
 * so a `NAME.key1.key2` or `NAME[k1][k2]` chain can be walked precisely
 * however deep the object nests (round 17 follow-up: round 16 flattened one
 * level into the parent key, which merged unrelated nested fields -- e.g. a
 * `dot` field's `animate-pulse` leaking into a sibling `badge` field's
 * resolution -- into false positives). An array value's entries aren't
 * indexed; its literals are just flattened, same as round 16. */
interface ConstEntry {
  literal: string;
  entries?: Map<string, ConstEntry>;
}

/** Top-level `key: <value>` / `"key": <value>` / `'key': <value>` entries of
 * an object-literal initializer `text` (its own braces included -- `text[0]`
 * must be `{` and `text` must end with its matching `}`). A value that is
 * itself an object literal is recursed into via this same function, so its
 * own keys are reachable precisely by `resolveMemberAccess`'s chain walk
 * (round 17 follow-up); any other value (string, template, array, ternary,
 * `cn()` call, ...) is resolved to the space-joined body of every
 * string/template literal found anywhere inside it, same as round 16. A key
 * this simple parser can't make sense of (a computed key, a spread) stops
 * entry collection at that point rather than guessing; whatever entries were
 * already found are still returned (Codex, PR #874 round 16). */
function extractObjectEntries(text: string): Map<string, ConstEntry> {
  const entries = new Map<string, ConstEntry>();
  // The object's own matching close, not just `text`'s last character --
  // `text` is a `const` initializer slice and may carry trailing
  // whitespace after the object literal (`{ ... } ;`).
  const end = extractBalanced(text, 0, "{", "}").endIndex;
  let i = 1; // past the object's own opening '{'
  while (i < end) {
    while (i < end && /[\s,]/.test(text[i])) i++;
    if (i >= end) break;
    let key: string;
    const c = text[i];
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close === -1) break;
      key = text.slice(i + 1, close);
      i = close + 1;
    } else {
      const idMatch = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 200));
      if (!idMatch) break;
      key = idMatch[0];
      i += idMatch[0].length;
    }
    while (i < end && /\s/.test(text[i])) i++;
    if (text[i] !== ":") break;
    i++;
    while (i < end && /\s/.test(text[i])) i++;
    const valueStart = i;
    let depth = 0;
    while (i < end) {
      const vc = text[i];
      if (vc === "`") {
        i += extractTemplateLiteral(text, i).length;
        continue;
      }
      if (vc === '"' || vc === "'") {
        const close = text.indexOf(vc, i + 1);
        if (close === -1) {
          i = end;
          break;
        }
        i = close + 1;
        continue;
      }
      if (vc === "(" || vc === "[" || vc === "{") {
        depth++;
        i++;
        continue;
      }
      if (vc === ")" || vc === "]" || vc === "}") {
        if (depth === 0) break;
        depth--;
        i++;
        continue;
      }
      if (depth === 0 && vc === ",") break;
      i++;
    }
    const valueText = text.slice(valueStart, i);
    const trimmed = valueText.trimStart();
    const bodies = extractLiteralBodies(valueText);
    if (trimmed.startsWith("{")) {
      const nestedStart = valueStart + (valueText.length - trimmed.length);
      const nested = extractObjectEntries(text.slice(nestedStart));
      entries.set(key, { literal: bodies.join(" "), entries: nested.size > 0 ? nested : undefined });
    } else if (bodies.length > 0) {
      entries.set(key, { literal: bodies.join(" ") });
    }
  }
  return entries;
}

/** Index just past a `const NAME: <this>` type annotation that starts at
 * `colonIndex` (the annotation's own colon), i.e. the position right after
 * the terminating `=` and any following whitespace -- or `null` if no such
 * `=` is ever found. Scans forward tracking depth over `<>`/`()`/`[]`/`{}`
 * (so a generic `Record<State, string>`, `Readonly<Record<"a" | "b",
 * string>>`, `Array<string>`, `string[]`, and an object-type literal `{ foo:
 * string }` are all skipped whole) and over quoted/template text (a union
 * member `"a" | "b"` never confuses depth tracking). A depth-0 `=` ends the
 * annotation, except `=>` (a function type's arrow, e.g. `(live: boolean) =>
 * string`, is part of the type, not the terminator) and `==`/`===` (skipped
 * as a run), both of which are stepped over whole before the check for a
 * bare `=` can fire (a bare `>=`/`<=` can't occur at depth 0 inside a type,
 * so only the arrow needs an explicit guard). Without this, the collector's
 * old regex only tolerated a literal `: string` annotation, so any other
 * annotation made the whole `const` declaration invisible to it (Codex, PR
 * #874 round 17). */
function skipTypeAnnotation(source: string, colonIndex: number): number | null {
  let i = colonIndex + 1;
  let depth = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "`") {
      i += extractTemplateLiteral(source, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1) return null;
      i = close + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{" || c === "<") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth > 0) depth--;
      i++;
      continue;
    }
    if (c === ">") {
      if (depth > 0) depth--;
      i++;
      continue;
    }
    if (c === "=") {
      if (source[i + 1] === ">") {
        i += 2; // a function type's arrow, part of the annotation
        continue;
      }
      if (source[i + 1] === "=") {
        i += source[i + 2] === "=" ? 3 : 2; // `==`/`===`, not the terminator
        continue;
      }
      if (depth === 0) {
        i++;
        while (i < source.length && /\s/.test(source[i])) i++;
        return i;
      }
      i++;
      continue;
    }
    i++;
  }
  return null;
}

/** Map of `const NAME = <initializer>` declarations in `source`, so a
 * `className={NAME}` (or a NAME used inside a `cn()`/template expression)
 * can be resolved to the classes it actually renders (RadioBadge's `base`),
 * instead of just the identifier text. The initializer can be a single
 * `"string"`/`'string'`/`` `template` `` (PR #874 round 12), a more composed
 * expression -- a concatenation, a ternary, a `cn()`/`clsx()`/`twMerge()`
 * call -- resolved by extracting every literal body inside it (round 15), or
 * a top-level object/array literal (round 16: `SpotBadge`'s old
 * `badgeConfig` variant-map shape, `{ critical: "text-alert-red
 * animate-pulse" }` accessed as `badgeClasses.critical`). An object's
 * `literal` is every literal body anywhere inside it (the fail-closed
 * fallback for a computed/unrecognised key access) and `entries` maps each
 * top-level key to just that key's own literals, for `resolveConstRefs` to
 * substitute precisely on a `NAME.key`/`NAME["key"]` reference. An
 * initializer with no string/template literal anywhere in it (numbers, bare
 * references) is skipped as not class-shaped. A type annotation between
 * the name and the initializer -- `Record<State, string>`, a function
 * type, a union, `typeof X` -- is skipped whole by `skipTypeAnnotation`
 * regardless of its shape, not just the literal `: string` case (round
 * 17). */
interface ConstDecl {
  name: string;
  /** Offset of the declaration, used as the tie-break when two visible
   * declarations sit in the same-size scope: the nearest preceding one,
   * else the first following one for a hoisted module-level const
   * (Codex, PR #874 round 13). */
  index: number;
  literal: string;
  /** Present only for an object-literal initializer: top-level key to that
   * key's own resolved entry (a nested `ConstEntry`, round 17 follow-up; a
   * flat literal for round 16). */
  entries?: Map<string, ConstEntry>;
  /** Index range of the innermost enclosing `{...}` block the declaration
   * sits in (module scope = `0..source.length`), so `visibleDecl` can tell
   * a same-named const declared in an unrelated sibling function from the
   * one actually in scope at a given reference -- `const` is block-scoped
   * in real JS, and "nearest preceding declaration in the file" ignores
   * that, resolving to whichever same-named const happens to sit closest by
   * character offset even when it belongs to a different function entirely
   * (Codex, PR #874 round 14). */
  scopeStart: number;
  scopeEnd: number;
}

function collectConstTemplateMap(source: string): ConstDecl[] {
  const decls: ConstDecl[] = [];
  const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source))) {
    const afterName = declRe.lastIndex;
    let valueStart: number;
    if (source[afterName] === ":") {
      const afterType = skipTypeAnnotation(source, afterName);
      if (afterType === null) {
        declRe.lastIndex = afterName + 1;
        continue;
      }
      valueStart = afterType;
    } else if (source[afterName] === "=") {
      let i = afterName + 1;
      while (i < source.length && /\s/.test(source[i])) i++;
      valueStart = i;
    } else {
      declRe.lastIndex = afterName;
      continue;
    }
    const firstChar = source[valueStart];
    const end = findInitializerEnd(source, valueStart);
    const initializerText = source.slice(valueStart, end);
    const bodies = extractLiteralBodies(initializerText);
    if (bodies.length === 0) continue;
    const entries = firstChar === "{" ? extractObjectEntries(initializerText) : undefined;
    const scope = findEnclosingBraceRange(source, m.index);
    decls.push({
      name: m[1],
      index: m.index,
      literal: bodies.join(" "),
      entries,
      scopeStart: scope ? scope.start : 0,
      scopeEnd: scope ? scope.end : source.length,
    });
    declRe.lastIndex = end;
  }
  return decls;
}

/** Among the declarations of `name` whose scope contains `atIndex`, the one
 * actually visible there: the innermost scope (smallest range) wins over an
 * outer one of the same name, since an inner block's own declaration shadows
 * it; a tie (same scope, i.e. two declarations in the same block) falls back
 * to the previous nearest-preceding/first-following rule. */
function visibleDecl(decls: ConstDecl[], name: string, atIndex: number): ConstDecl | undefined {
  let best: ConstDecl | undefined;
  for (const d of decls) {
    if (d.name !== name) continue;
    if (atIndex < d.scopeStart || atIndex > d.scopeEnd) continue;
    if (!best) {
      best = d;
      continue;
    }
    const dSize = d.scopeEnd - d.scopeStart;
    const bestSize = best.scopeEnd - best.scopeStart;
    if (dSize !== bestSize) {
      if (dSize < bestSize) best = d;
      continue;
    }
    if (d.index < atIndex && (best.index >= atIndex || d.index > best.index)) {
      best = d;
    } else if (d.index >= atIndex && best.index >= atIndex && d.index < best.index) {
      best = d;
    }
  }
  return best;
}

/** Matches a bare identifier that could name a resolved const, the same
 * hyphen-adjacency exclusion `resolveConstRefs`'s generic pass uses so a
 * hyphenated Tailwind token (`text-red`) is never mistaken for one. */
const BASE_IDENT_RE = /(?<![\w$-])[A-Za-z_$][\w$]*/g;

/** Index just past the `]` matching a `[` at `source[openIndex]`, tracking
 * nested `[...]` depth and skipping quoted/template text (so a `]` inside a
 * string, `["a]b"]`, is never mistaken for the close) -- `extractBalanced`
 * only knows `{}`/`()`, not `[]` (Codex, PR #874 round 17 follow-up). Returns
 * `-1` if there's no matching close. */
function findBracketClose(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i];
    if (c === "`") {
      i += extractTemplateLiteral(source, i).length - 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1) return -1;
      i = close;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Resolves every access chain in `raw` that starts at a resolved const's
 * name -- a run of `.key`, `["key"]`/`['key']`, and `[computed]` segments,
 * however deep, e.g. `AMSAT_STATUS_STYLES[amsatStatus.status].badge` -- so
 * `resolveConstRefs`'s generic bare-identifier pass (which doesn't know
 * about accessors) only ever sees a truly bare `NAME` left over from this.
 * The walk keeps a *set* of candidate entries, starting from just the decl
 * itself: a precise key (`.key` or a quoted bracket) narrows every candidate
 * to its own child entry of that key, and a candidate missing that key drops
 * out of the set entirely; a computed key can't be resolved precisely, so it
 * instead *expands* every candidate to all of its own child entries (a
 * candidate with no `entries` -- a plain string/array leaf -- stays as
 * itself). If a precise key narrows the set down to nothing, the walk stops
 * right there and falls back to the union of the candidates as they stood
 * just before that failed step, rather than guessing -- this is what keeps
 * `AMSAT_STATUS_STYLES[status].badge` from ever seeing `active.dot`'s
 * `animate-pulse`: narrowing by `.badge` only keeps candidates that actually
 * have a `badge` key (round 16 flattened `dot`/`badge`/`label` together into
 * one literal per status, which is exactly the false positive this chain
 * walk exists to avoid -- Codex, PR #874 round 17 follow-up). A trailing
 * call (`f(live)`) is never part of the chain -- `(` matches nothing here,
 * so the walk simply stops and leaves the call for the generic bare-`f`
 * pass, same as an identifier with no accessor at all. */
function resolveMemberAccess(
  raw: string,
  decls: ConstDecl[],
  atIndex: number,
  seen: ReadonlySet<string>,
): string {
  let result = "";
  let cursor = 0;
  BASE_IDENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BASE_IDENT_RE.exec(raw))) {
    const name = m[0];
    const start = m.index;
    if (seen.has(name)) continue;
    const decl = visibleDecl(decls, name, atIndex);
    if (!decl) continue;

    let candidates: ConstEntry[] = [{ literal: decl.literal, entries: decl.entries }];
    let chainEnd = start + name.length;
    let matchedChain = false;
    while (true) {
      if (raw[chainEnd] === ".") {
        const keyMatch = /^[A-Za-z_$][\w$]*/.exec(raw.slice(chainEnd + 1));
        if (!keyMatch) break;
        const key = keyMatch[0];
        const narrowed = candidates
          .map((cand) => cand.entries?.get(key))
          .filter((c): c is ConstEntry => c !== undefined);
        if (narrowed.length === 0) break;
        candidates = narrowed;
        chainEnd += 1 + key.length;
        matchedChain = true;
        continue;
      }
      if (raw[chainEnd] === "[") {
        const closeIdx = findBracketClose(raw, chainEnd);
        if (closeIdx === -1) break;
        const inner = raw.slice(chainEnd + 1, closeIdx);
        const quoted = /^\s*(["'])((?:(?!\1)[\s\S])*)\1\s*$/.exec(inner);
        if (quoted) {
          const key = quoted[2];
          const narrowed = candidates
            .map((cand) => cand.entries?.get(key))
            .filter((c): c is ConstEntry => c !== undefined);
          if (narrowed.length === 0) break;
          candidates = narrowed;
        } else {
          candidates = candidates.flatMap((cand) =>
            cand.entries && cand.entries.size > 0 ? [...cand.entries.values()] : [cand],
          );
        }
        chainEnd = closeIdx + 1;
        matchedChain = true;
        continue;
      }
      break;
    }

    if (!matchedChain) continue;

    result += raw.slice(cursor, start);
    const nextSeen = new Set([...seen, name]);
    result += candidates
      .map((cand) => resolveConstRefs(cand.literal, decls, decl.index, nextSeen))
      .join(" ");
    cursor = chainEnd;
    BASE_IDENT_RE.lastIndex = cursor;
  }
  result += raw.slice(cursor);
  return result;
}

/** Replaces every bare identifier in a class expression that names a
 * resolved const with that const's literal, so `cn(statusClasses, x)` and
 * `\`${statusClasses} mt-1\`` are scanned for the classes they render.
 * Resolution recurses through chained consts (`const classes =
 * \`text-alert-red ${pulse}\``) with a cycle guard. Hyphen-adjacent words
 * (`text-xs`) are class tokens, not identifiers. A `NAME.key`/`NAME["key"]`
 * member access is resolved first, by `resolveMemberAccess`, against an
 * object/array const's `entries` (round 16); this pass only ever sees a bare
 * `NAME` left over from that -- unchanged behaviour for a plain
 * string-initialised const. */
function resolveConstRefs(
  raw: string,
  decls: ConstDecl[],
  atIndex: number,
  seen: ReadonlySet<string> = new Set(),
): string {
  if (decls.length === 0 || seen.size > 8) return raw;
  const withMembers = resolveMemberAccess(raw, decls, atIndex, seen);
  return withMembers.replace(/(?<![\w$-])[A-Za-z_$][\w$]*(?![\w$-])/g, (id) => {
    if (seen.has(id)) return id;
    const decl = visibleDecl(decls, id, atIndex);
    if (!decl) return id;
    return resolveConstRefs(decl.literal, decls, decl.index, new Set([...seen, id]));
  });
}

/** The opening tag an attribute at `before` belongs to, found by walking
 * backwards structurally: `{…}` attribute expressions are skipped as
 * blocks, a quoted attribute value is skipped whole (so a `>` inside it,
 * e.g. `title="1 > 0"`, is never mistaken for a tag boundary -- Codex, PR
 * #874 round 14), a `>` outside them (other than an arrow's `=>`) means the
 * attribute is not inside a tag, and the first `<Tag` reached is the
 * element. No fixed-width window, so verbose prop lists cannot push the
 * tag out of reach (Codex, PR #874 round 13). */
function findOpeningTag(source: string, before: number): { tag: string; index: number } | null {
  let i = before - 1;
  while (i >= 0) {
    const c = source[i];
    if (c === "}") {
      let depth = 0;
      let j = i;
      for (; j >= 0; j--) {
        if (source[j] === "}") depth++;
        else if (source[j] === "{" && --depth === 0) break;
      }
      if (j < 0) return null;
      i = j - 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const openQuote = source.lastIndexOf(c, i - 1);
      if (openQuote === -1) return null;
      i = openQuote - 1;
      continue;
    }
    if (c === ">" && source[i - 1] !== "=") return null;
    if (c === "<") {
      const m = source.slice(i).match(/^<([A-Za-z][\w.]*)(?=[\s/>])/);
      if (m) return { tag: m[1], index: i };
      return null;
    }
    i--;
  }
  return null;
}

interface ClassNameSite {
  /** The class-bearing text for this site: a string literal, a template
   * literal, a `cn()`/`clsx()`/`twMerge()` call's raw text, or a resolved
   * `const` template when the attribute was a bare identifier. */
  raw: string;
  tag: string | null;
  /** The opening tag's text (`<input … value={x}`), so a void form control
   * can be recognised as text-bearing by its value/placeholder attributes. */
  openingTag: string | null;
  /** Raw JSX between this element's opening and its matching closing tag
   * (same-tag nesting tracked), when both were found; null for self-closing
   * elements or when the closing tag wasn't locatable. */
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
  constMap: ConstDecl[],
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
      raw = resolveConstRefs(text.slice(1, -1), constMap, m.index);
      afterIndex = endIndex + 1;
    } else {
      const closeIndex = source.indexOf(delim, contentStart);
      raw = closeIndex === -1 ? "" : source.slice(contentStart, closeIndex);
      afterIndex = closeIndex === -1 ? contentStart : closeIndex + 1;
    }

    const opening = findOpeningTag(source, m.index);
    const tag = opening ? opening.tag : null;

    let childrenText: string | null = null;
    let openingTag: string | null = null;
    if (tag && opening) {
      const gt = findTagEnd(source, afterIndex);
      const tagStart = opening.index;
      openingTag = gt === -1 ? null : source.slice(tagStart, gt);
      if (gt !== -1 && source[gt - 1] !== "/") {
        const closeAt = findMatchingCloseTag(source, tag, gt + 1);
        if (closeAt !== -1) {
          childrenText = source.slice(gt + 1, closeAt);
        }
      }
    }

    sites.push({ raw, tag, openingTag, childrenText, index: contentStart });
  }
  return sites;
}

/** Index of the `>` that ends the tag whose attributes begin at `from`,
 * skipping `{...}` attribute expressions (an `onClick={() => …}` arrow
 * carries a `>` of its own) and quoted strings. -1 when not found. */
function findTagEnd(source: string, from: number): number {
  let i = from;
  while (i < source.length) {
    const c = source[i];
    if (c === "{") {
      i = extractBalanced(source, i, "{", "}").endIndex + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1) return -1;
      i = close + 1;
      continue;
    }
    if (c === ">") return i;
    i++;
  }
  return -1;
}

/** Index of the `</tag>` that closes the element whose children start at
 * `from`, counting nested same-tag opens (self-closing ones excluded) so a
 * `<div className="animate-pulse"><div /></div>Loading</div>` yields the
 * whole child range rather than stopping at the inner close (Codex,
 * PR #874 round 11). -1 when unbalanced. */
function findMatchingCloseTag(source: string, tag: string, from: number): number {
  const escaped = tag.replace(/[.$]/g, "\\$&");
  const re = new RegExp(`<(/?)${escaped}(?=[\\s/>])`, "g");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[1] === "/") {
      depth--;
      if (depth === 0) return m.index;
      continue;
    }
    const gt = findTagEnd(source, m.index + 1);
    if (gt === -1) return -1;
    if (source[gt - 1] !== "/") depth++;
    re.lastIndex = gt + 1;
  }
  return -1;
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
  // A value-bearing form control anywhere under this element renders its
  // value or placeholder as text that this element's pulse fades, whether
  // it sits directly in the children or inside a mapping's emitted JSX; the
  // control itself carries no pulse class for the scan to find (Codex,
  // PR #874 round 10).
  if (VALUE_BEARING_CONTROL.test(children)) return true;
  const withoutTags = children.replace(/<[^>]*>/g, "");
  if (/\S/.test(stripBalancedExpressions(withoutTags).withoutExpr)) return true;
  // Classify the `{…}` blocks on the raw children (tags intact) so a mapping
  // that emits JSX can be told from one that yields strings.
  return stripBalancedExpressions(children).blocks.some((block) => {
    if (!/\.map\(|=>/.test(block)) return true;
    // A mapping or arrow that yields strings (`items.map((i) =>
    // i.label).join(", ")`) renders text right here, so it counts (Codex,
    // PR #874 round 7). One that emits JSX counts only when an emitted
    // element has content of its own (`<span>{i.label}</span>`): the
    // parent's pulse fades that text and the child carries no pulse class
    // for the scan to find (round 8). A mapping of self-closing elements
    // (`<Chip … />`, a skeleton `<div … />`) renders nothing of its own.
    if (!/<[A-Za-z]/.test(block)) return true;
    return /[^/=]>\s*[^<\s]/.test(block);
  });
}

/** Void form controls render their value or placeholder as text, so a pulse
 * on the control fades it even though the element has no children
 * (Codex, PR #874 round 8). */
const FORM_VALUE_TAGS = new Set(["input", "textarea"]);
const VALUE_BEARING_CONTROL = new RegExp(
  `<(${[...FORM_VALUE_TAGS].join("|")})\\b[^>]*\\b(value|defaultValue|placeholder)=`,
);
function isValueBearingControl(site: ClassNameSite): boolean {
  return (
    site.tag !== null &&
    FORM_VALUE_TAGS.has(site.tag) &&
    /\b(value|defaultValue|placeholder)=/.test(site.openingTag ?? "")
  );
}

/** Index range of the innermost enclosing `{...}` block containing `index`
 * in `source` (found by scanning backward for a `{` unmatched by an
 * interceding `}`), or `null` when `index` sits at module scope with no
 * enclosing block at all. Shared by `findEnclosingBraceBlock` (the
 * config-map scan) and `collectConstTemplateMap` (a declaration's lexical
 * scope, PR #874 round 14) so both agree on what "innermost block" means. */
function findEnclosingBraceRange(
  source: string,
  index: number,
): { start: number; end: number } | null {
  let depth = 0;
  for (let i = index; i >= 0; i--) {
    const c = source[i];
    if (c === "}") {
      depth++;
    } else if (c === "{") {
      if (depth === 0) {
        return { start: i, end: extractBalanced(source, i, "{", "}").endIndex };
      }
      depth--;
    }
  }
  return null;
}

/** Finds the nearest enclosing `{...}` block around `index`, used only by
 * the config-map scan below, where the caller has already confirmed `index`
 * sits inside a `key: "animate-pulse"` field (not arbitrary JSX/prose), so
 * the block found is the object literal that field belongs to. */
function findEnclosingBraceBlock(source: string, index: number): string | null {
  const range = findEnclosingBraceRange(source, index);
  return range ? source.slice(range.start, range.end + 1) : null;
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

/** Element scan: flags any intrinsic text-bearing element whose className carries
 * the pulse class together with a text-color class or text-bearing
 * children. `normalizedSource` must already be whitespace-normalized (see
 * `normalize`) -- `scanSourceForViolations` does this once for both scans
 * so every `Violation.index` shares one coordinate space with the anchors
 * they're compared against. */
function findElementViolations(normalizedSource: string): Violation[] {
  const constMap = collectConstTemplateMap(normalizedSource);
  const violations: Violation[] = [];
  for (const site of findClassNameSites(normalizedSource, constMap)) {
    if (!site.tag || !isTextBearingTag(site.tag)) continue;
    const pulseMatch = PULSE_CLASS_RE.exec(site.raw);
    if (!pulseMatch) continue;
    const tinted = TEXT_COLOR_CLASS_RE.test(site.raw);
    const textBearing =
      isTextBearingChildren(site.childrenText) || isValueBearingControl(site);
    if (tinted || textBearing) {
      violations.push({
        description: `<${site.tag}> pulses with ${tinted ? "a text-color class" : "text-bearing children or value"} on the same element (className: ${JSON.stringify(normalize(site.raw).slice(0, 100))})`,
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

  it("resolves quoted const class strings, bare or inside cn()/templates", () => {
    for (const fixture of [
      'const statusClasses = "text-alert-red animate-pulse";\nexport function A() { return <span className={statusClasses}>Critical</span>; }',
      "const statusClasses = 'text-alert-red animate-pulse';\nexport function A() { return <span className={statusClasses}>Critical</span>; }",
      'const pulse: string = "animate-pulse";\nexport function A() { return <span className={cn("text-amber-400", live && pulse)}>GL</span>; }',
      'const pulse = "animate-pulse text-amber-400";\nexport function A() { return <span className={`${pulse} mt-1`}>GL</span>; }',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
    expect(
      scanSourceForViolations(
        'const pulse = "animate-pulse";\nexport function A() { return <span className={cn("text-amber-400", live && pulsed)}>GL</span>; }',
      ),
    ).toEqual([]);
  });

  it("resolves chained consts recursively, with a cycle guard", () => {
    expect(
      scanSourceForViolations(
        'const pulse = "animate-pulse";\nconst classes = `text-alert-red ${pulse}`;\nexport function A() { return <span className={classes}>Loading</span>; }',
      ),
    ).not.toEqual([]);
    expect(
      scanSourceForViolations(
        'const a = `${b} text-alert-red`;\nconst b = `${a} animate-pulse`;\nexport function A() { return <span className={a}>Loading</span>; }',
      ),
    ).not.toEqual([]);
  });

  it("resolves the declaration visible at each attribute, not the last same-named const in the file", () => {
    const first =
      'function A() { const classes = "text-alert-red animate-pulse"; return <span className={classes}>Loading</span>; }\n' +
      'function B() { const classes = ""; return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(first)).toHaveLength(1);
    const second =
      'function B() { const classes = ""; return <span className={classes}>Idle</span>; }\n' +
      'function A() { const classes = "text-alert-red animate-pulse"; return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(second)).toHaveLength(1);
  });

  it("resolves a module-level const, not a same-named local const declared in an unrelated function that happens to sit nearer the usage", () => {
    const fixture =
      'const classes = "text-alert-red animate-pulse";\n' +
      'function unrelated() { const classes = ""; return classes; }\n' +
      'export function A() { return <span className={classes}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).toHaveLength(1);
  });

  it("resolves a function-local const used inside that function, even though a module-level const of the same name pulses", () => {
    const fixture =
      'const classes = "text-alert-red animate-pulse";\n' +
      'export function A() { const classes = ""; return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("finds the opening tag past any length of props, and not across a closed tag", () => {
    const props = Array.from({ length: 12 }, (_, i) => `data-prop-${i}="${"x".repeat(40)}"`).join(" ");
    expect(
      scanSourceForViolations(`<span ${props} onClick={() => go()} className="text-alert-red animate-pulse">Critical</span>`),
    ).not.toEqual([]);
    expect(
      scanSourceForViolations(`<span ${props} className="text-alert-red animate-pulse">Critical</span>`),
    ).not.toEqual([]);
    // A className-shaped token after the tag closed is not an attribute of it.
    expect(
      scanSourceForViolations('<span>text</span>{/* className="text-alert-red animate-pulse" */}'),
    ).toEqual([]);
  });

  it("finds the opening tag past a quoted attribute value containing '>' ", () => {
    const fixture = '<span title="1 > 0" className="text-alert-red animate-pulse">Critical</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("<span>");
  });

  it("resolves a const built from a string concatenation with a ternary, not just its first literal", () => {
    const fixture =
      'const classes = "text-alert-red " + (live ? "animate-pulse" : "");\n' +
      'export function A() { return <span className={classes}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a const built from a cn() call, not just an identifier the collector can't see through", () => {
    const fixture =
      'const classes = cn("text-alert-red", live && "animate-pulse");\n' +
      'export function A() { return <span className={classes}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a const template literal with a nested ternary expression, not just its literal text", () => {
    const fixture =
      'const classes = `text-alert-red ${live ? "animate-pulse" : ""}`;\n' +
      'export function A() { return <span className={classes}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a composed const whose branches never include the pulse class", () => {
    const fixture =
      'const classes = "text-su-muted " + (live ? "font-bold" : "");\n' +
      'export function A() { return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves a dotted member access into an object-valued const's specific key", () => {
    const fixture =
      'const badgeClasses = { critical: "text-alert-red animate-pulse" };\n' +
      'export function A() { return <span className={badgeClasses.critical}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag an object-valued const access through a key that never pulses", () => {
    const fixture =
      'const m = { live: "text-alert-red animate-pulse", idle: "text-su-muted" };\n' +
      'export function A() { return <span className={m.idle}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches a computed member access into an object-valued const (fails closed over every key)", () => {
    const fixture =
      'const m = { live: "text-alert-red animate-pulse", idle: "text-su-muted" };\n' +
      'export function A() { return <span className={m[state]}>Status</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches a computed index access into an array-valued const (fails closed over every entry)", () => {
    const fixture =
      'const tones = ["text-su-muted", "text-alert-red animate-pulse"];\n' +
      'export function A() { return <span className={tones[i]}>x</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves an object-valued const behind a generic type annotation, not just a literal ': string'", () => {
    const fixture =
      'const badgeClasses: Record<State, string> = { critical: "text-alert-red animate-pulse" };\n' +
      'export function A() { return <span className={badgeClasses[state]}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a precise key access through a Readonly<Record<union, string>> annotation", () => {
    const fixture =
      'const t: Readonly<Record<"a" | "b", string>> = { a: "text-alert-red animate-pulse", b: "text-su-muted" };\n' +
      'export function A() { return <span className={t.b}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves a const behind a function-type annotation, since a call still references the identifier", () => {
    const fixture =
      'const f: (live: boolean) => string = (live) => live ? "text-alert-red animate-pulse" : "";\n' +
      'export function A() { return <span className={f(live)}>x</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a chained computed-then-precise-key access without merging an unrelated sibling field's pulse", () => {
    const fixture =
      'const S: Record<K, { badge: string; dot: string; label: string }> = {\n' +
      '  active: { badge: "bg-signal-green/15 text-signal-green", dot: "bg-signal-green animate-pulse", label: "Active" },\n' +
      '  off: { badge: "text-su-muted", dot: "bg-su-line", label: "Off" },\n' +
      "};\n" +
      "export function A() {\n" +
      "  return (\n" +
      '    <span className={`px-2 text-xs ${S[k].badge}`}>\n' +
      '      <span className={`w-1.5 h-1.5 rounded-full ${S[k].dot}`} />\n' +
      "      {S[k].label}\n" +
      "    </span>\n" +
      "  );\n" +
      "}";
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches a chained computed-then-precise-key access when the union of its pulsing field is itself text-bearing", () => {
    const fixture =
      'const S: Record<K, { badge: string; dot: string; label: string }> = {\n' +
      '  active: { badge: "bg-signal-green/15 text-signal-green", dot: "bg-signal-green animate-pulse", label: "Active" },\n' +
      '  off: { badge: "text-su-muted", dot: "bg-su-line", label: "Off" },\n' +
      "};\n" +
      'export function A() { return <span className={`text-xs ${S[k].dot}`}>Live</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a two-level dotted chain to the specific status's field, not every status merged together", () => {
    const fixture =
      'const S: Record<K, { badge: string; dot: string; label: string }> = {\n' +
      '  active: { badge: "bg-signal-green/15 text-signal-green", dot: "bg-signal-green animate-pulse", label: "Active" },\n' +
      '  off: { badge: "text-su-muted", dot: "bg-su-line", label: "Off" },\n' +
      "};\n" +
      "export function A() {\n" +
      "  return (\n" +
      "    <div>\n" +
      '      <span className={`text-signal-green ${S.active.dot}`}>Active</span>\n' +
      '      <span className={`text-su-muted ${S.off.dot}`}>Off</span>\n' +
      "    </div>\n" +
      "  );\n" +
      "}";
    const violations = scanSourceForViolations(fixture);
    expect(violations.length).toBe(1);
    expect(violations[0].description).toContain("text-signal-green");
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

  it("catches a pulsing tinted link, heading and input, not only span/p/div/button", () => {
    for (const fixture of [
      '<a href="#" className="text-alert-red animate-pulse">retry</a>',
      '<h2 className="animate-pulse text-caution-amber">Alert</h2>',
      '<input className="text-alert-red animate-pulse" value="x" />',
      '<label className="animate-pulse text-signal-green">TX</label>',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
  });

  it("catches text rendered through a mapping that yields strings, not elements", () => {
    const fixture =
      '<span className="rounded bg-su-line/10 animate-pulse">{items.map((item) => item.label).join(", ")}</span>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still dismisses a mapping that emits self-closing elements (nothing rendered in place)", () => {
    for (const fixture of [
      '<div className="flex gap-1 animate-pulse">{items.map((item) => <Chip key={item.id} label={item.label} />)}</div>',
      '<div className="space-y-2 animate-pulse">{rows.map((row) => <div key={row} className="h-3 rounded bg-su-line/20" />)}</div>',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
  });

  it("catches text inside the elements a mapping emits (the parent's pulse fades it)", () => {
    for (const fixture of [
      '<div className="flex gap-1 animate-pulse">{items.map((item) => <span key={item.id}>{item.label}</span>)}</div>',
      '<ul className="animate-pulse">{items.map((item) => <li key={item.id}>Pending</li>)}</ul>',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
  });

  it("treats a form control's value or placeholder as rendered text", () => {
    for (const fixture of [
      '<input className="rounded bg-su-line/10 animate-pulse" value={status} readOnly />',
      '<textarea className="animate-pulse" placeholder="Waiting for the rig…" />',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
    expect(
      scanSourceForViolations('<input type="checkbox" className="animate-pulse" checked={armed} />'),
    ).toEqual([]);
  });

  it("reads the whole child range past a nested same-tag element", () => {
    for (const fixture of [
      '<div className="animate-pulse"><div></div>Loading</div>',
      '<div className="animate-pulse"><div className="h-2" /><div><span /></div>{label}</div>',
      '<span className="animate-pulse"><span onClick={() => go()}></span>{count} new</span>',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
    for (const fixture of [
      '<div className="animate-pulse"><div className="h-2" /></div><p>Loading</p>',
      '<div className="animate-pulse"><div><div /></div></div>Loading',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
  });

  it("catches a value-bearing control under a pulsing parent, direct or mapped", () => {
    for (const fixture of [
      '<div className="animate-pulse">{items.map((item) => <input key={item.id} value={item.label} readOnly />)}</div>',
      '<div className="animate-pulse">{fields.map((f) => <textarea key={f.id} placeholder={f.hint} />)}</div>',
      '<label className="flex gap-2 animate-pulse"><input value={status} readOnly /></label>',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
    expect(
      scanSourceForViolations(
        '<div className="animate-pulse">{items.map((item) => <input key={item.id} type="checkbox" checked={item.on} />)}</div>',
      ),
    ).toEqual([]);
  });

  it("does not flag graphics or void elements that carry a text-color class for currentColor", () => {
    for (const fixture of [
      '<svg className="animate-pulse text-alert-red" viewBox="0 0 8 8"><circle r="4" /></svg>',
      '<img className="animate-pulse text-alert-red" alt="" />',
      '<hr className="animate-pulse text-alert-red" />',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
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

  it("every audited site anchor is unique within its file", () => {
    // An anchor that occurs more than once (ContestTimer's bare
    // `text-alert-red` matched four sites) keeps the entry green after the
    // audited element is deleted or rewritten (Codex, PR #874 round 9).
    for (const site of AUDITED_SITES) {
      const content = readNormalized(site.file);
      const anchorNorm = normalize(site.anchor);
      expect(
        content.indexOf(anchorNorm) === content.lastIndexOf(anchorNorm),
        `${site.file}: "${site.what}" anchor "${site.anchor}" is not unique in the file -- pick a snippet specific to that element`,
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
