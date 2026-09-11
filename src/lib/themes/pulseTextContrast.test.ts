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

/** Class-token boundary on both sides, not just the one `-glow` special
 * case this used to carry -- a real Tailwind class token is never glued
 * directly to a neighboring identifier character or hyphenated segment,
 * whatever punctuation (quote, whitespace, a variant prefix's `:`, or plain
 * JS syntax like `)`/`&&`/`${…}`) actually surrounds it in a given raw
 * scanned string. A tried-first, tighter alternative -- requiring a quote,
 * whitespace, `:`, or string-start/end specifically -- broke three existing
 * fixtures whose resolved text embeds the class inside unstripped JS syntax
 * this scanner's own const/template resolution leaves behind (`cn("x", live
 * && animate-pulse)`, and `` `text-alert-red ${animate-pulse}` `` -- a
 * resolved reference substituted inside its own `${…}` wrapper, wrapper left
 * intact). `\w`/`-` are the only characters that can ever extend a Tailwind
 * class token itself, so excluding just those two on both sides is both
 * necessary and sufficient: `animate-pulse-glow` (a different, shallower
 * custom keyframe, out of scope per the module doc above), `animate-pulse-
 * slow`, and `animate-pulsed` are all excluded (a trailing `-`/word char),
 * and `not-animate-pulse` is excluded too (a leading `-`, whereas the
 * previous version had no leading-boundary check at all) (Codex, PR #874
 * round 38). */
const PULSE_CLASS_RE = new RegExp(`(?<![\\w-])${PULSE_CLASS}(?![\\w-])`);

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
 * consumes the whole literal in one step). Stops at a `;` or a depth-0 `,`
 * (not consumed) -- the comma stop is what lets a single declarator's
 * initializer end at the separator in a comma-separated declaration list
 * (`const pulse = "animate-pulse", classes = pulse;`, Codex, PR #874
 * round 33); a missing semicolon falls back to the first `}` that would
 * close an outer block, or the start of the next top-level
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
      if (c === ";" || c === ",") return i;
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
  /** Present only when this entry's own value is an object literal that
   * itself contains at least one unresolved spread (`{ a: { safe:
   * "text-green", ...base } }`) -- the same raw `order` `extractObjectEntries`
   * would return for a top-level declaration, carried through so a caller
   * with scope awareness (`extractObjectEntries` itself has none) can replay
   * it the same way `collectConstTemplateMap`'s `spreadQueue` replays a
   * top-level declaration's own `order`: source-order overwrite (round 34)
   * and import-aware `visibleDecl` resolution (round 36), just at this
   * nesting depth instead of only the top. Cleared (set back to `undefined`)
   * once `resolveNestedEntrySpreads` has replayed it into `entries` (Codex,
   * PR #874 round 36b). */
  spreadOrder?: ObjectEntryOp[];
}

/** One named-entry or spread event inside an object literal, in source
 * order -- `extractObjectEntries` records these as it scans left to right so
 * `collectConstTemplateMap` can replay the same order once every declaration
 * is known and a spread's source can actually be resolved (Codex, PR #874
 * round 34). */
type ObjectEntryOp = { kind: "entry"; key: string; entry: ConstEntry } | { kind: "spread"; name: string };

/** Index of the first depth-0 `,` in `text` between `start` and `end`
 * (tracking `(`/`[`/`{` depth as one combined counter and skipping quoted/
 * template spans, same rules `extractObjectEntries`'s own value scan always
 * used), or `end` if none is found first -- also returned when a depth-0
 * closing bracket/paren/brace is reached before any comma, i.e. the
 * enclosing construct ends right there. Shared by every "I don't know what
 * this is, skip to the next entry" branch in `extractObjectEntries` (Codex,
 * PR #874 round 32). */
function scanToDepthZeroComma(text: string, start: number, end: number): number {
  let i = start;
  let depth = 0;
  while (i < end) {
    const c = text[i];
    if (c === "`") {
      i += extractTemplateLiteral(text, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close === -1) return end;
      i = close + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return i;
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c === ",") return i;
    i++;
  }
  return end;
}

/** Top-level `key: <value>` / `"key": <value>` / `'key': <value>` entries of
 * an object-literal initializer `text` (its own braces included -- `text[0]`
 * must be `{` and `text` must end with its matching `}`), plus every bare-
 * identifier spread (`...base`) found alongside them. A value that is itself
 * an object literal is recursed into via this same function, so its own keys
 * are reachable precisely by `resolveMemberAccess`'s chain walk (round 17
 * follow-up); any other value (string, template, array, ternary, `cn()`
 * call, ...) is resolved to the space-joined body of every string/template
 * literal found anywhere inside it, same as round 16.
 *
 * A spread (`...base`), a method (`greet() {}`), or a computed key (`[k]:
 * "…"`) is skipped -- scanned past to the next depth-0 comma via
 * `scanToDepthZeroComma` -- rather than aborting entry collection outright
 * for every key after it, since a
 * `const styles = { ...base, safe: "text-green", alert: "text-red
 * animate-pulse" }` used to lose `safe` and `alert` entirely just because
 * `...base` came first, leaving `styles.safe` to fall back to the whole
 * object's flattened literal (which also carries `alert`'s `animate-pulse`)
 * instead of its own precise, non-pulsing value. A computed key's value
 * still contributes to that flattened literal (via the caller's own
 * `extractLiteralBodies` scan over the whole initializer, independent of
 * this function) but is never added to `entries` -- a computed key can't be
 * resolved precisely, so `resolveMemberAccess`'s own computed-access branch
 * already expands to every known entry instead. Each bare-identifier
 * spread's name is returned in `spreads`, in source order, for
 * `collectConstTemplateMap` to merge (a spread of an unresolvable
 * expression -- a call, a ternary, a member access -- contributes nothing to
 * `entries`, fail closed, same as an unrecognized key shape) (Codex, PR #874
 * round 16; round 32 continues past a spread/shorthand/method/computed key
 * instead of stopping there).
 *
 * `order` records the same named-entry/spread events `entries`/`spreads`
 * already do, but in source order and interleaved -- round 32's merge
 * applied every spread AFTER every named entry was already set, so `{ safe:
 * "text-green", ...base }` (where `base.safe` is `"animate-pulse"`) kept the
 * earlier plain entry instead of the spread's later, overwriting one; `{
 * safe: "text-green", ...unknown }` (an unresolvable spread) also had no way
 * to mark `safe` as needing its precise entry replaced by the whole object's
 * flattened literal, since an unresolvable spread could have overwritten it
 * with anything. `collectConstTemplateMap` replays `order` once every
 * declaration is known, so overwrite order matches the object literal's own
 * source order exactly, later wins (Codex, PR #874 round 34).
 *
 * A shorthand property (`{ pulse }`, shorthand for `{ pulse: pulse }`) is no
 * longer skipped (round 18 chose to skip it, alongside a method and a
 * computed key with no colon, since none of the three share one shape) --
 * only a bare identifier key immediately followed by a depth-0 `,` or the
 * object's own closing `}` is a shorthand property; a quoted or computed key
 * can never be shorthand in real JS (`{ "a" }`/`{ [k] }` are syntax errors),
 * and anything else immediately after a bare identifier key (most commonly
 * `(` for a method) still isn't a `key: value` OR a shorthand shape, so it's
 * still skipped the same way it always was. A shorthand key is registered
 * through the exact same identifier-ref path as its `{ pulse: pulse }`
 * long-hand equivalent (round 33's colon-form identifier-only value
 * handling below) -- its own resolution, including an unresolvable
 * identifier simply not matching anything (same as that colon form always
 * has), is entirely local to this one key and never touches a sibling's own
 * entry (Codex, PR #874 round 37). */
function extractObjectEntries(
  text: string,
): { entries: Map<string, ConstEntry>; spreads: string[]; order: ObjectEntryOp[] } {
  const entries = new Map<string, ConstEntry>();
  const spreads: string[] = [];
  const order: ObjectEntryOp[] = [];
  // The object's own matching close, not just `text`'s last character --
  // `text` is a `const` initializer slice and may carry trailing
  // whitespace after the object literal (`{ ... } ;`).
  const end = extractBalanced(text, 0, "{", "}").endIndex;
  let i = 1; // past the object's own opening '{'
  while (i < end) {
    while (i < end && /[\s,]/.test(text[i])) i++;
    if (i >= end) break;

    if (text.slice(i, i + 3) === "...") {
      const specStart = i + 3;
      const specEnd = scanToDepthZeroComma(text, specStart, end);
      const spec = text.slice(specStart, specEnd).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(spec)) {
        spreads.push(spec);
        order.push({ kind: "spread", name: spec });
      }
      i = specEnd;
      continue;
    }

    let key: string | null = null;
    let keyEnd = i;
    let isIdentifierKey = false;
    const c = text[i];
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      if (close !== -1) {
        key = text.slice(i + 1, close);
        keyEnd = close + 1;
      }
    } else if (c === "[") {
      // Computed key: consumed so parsing can continue past it, but never
      // recorded precisely -- its value still reaches the flattened literal
      // through the caller's own whole-initializer `extractLiteralBodies`
      // scan.
      const close = findBracketClose(text, i);
      if (close !== -1) keyEnd = close + 1;
    } else {
      const idMatch = /^[A-Za-z_$][\w$]*/.exec(text.slice(i, i + 200));
      if (idMatch) {
        key = idMatch[0];
        keyEnd = i + idMatch[0].length;
        isIdentifierKey = true;
      }
    }

    if (keyEnd === i) {
      // No recognized key shape at all -- skip past it instead of aborting.
      const skipTo = scanToDepthZeroComma(text, i, end);
      i = skipTo > i ? skipTo : i + 1;
      continue;
    }

    let j = keyEnd;
    while (j < end && /\s/.test(text[j])) j++;
    if (text[j] !== ":") {
      // A bare identifier key immediately followed by a depth-0 `,` or the
      // object's own closing `}` is a shorthand property (`{ pulse }`,
      // shorthand for `{ pulse: pulse }`) -- registered through the exact
      // same identifier-ref path as that long-hand colon form uses below,
      // so `pulse` resolves through `resolveMemberAccess`/`resolveConstRefs`
      // exactly like any other reference, unresolvable or not (Codex, PR
      // #874 round 37). A quoted or computed key can never be shorthand in
      // real JS, and anything else after a bare identifier key -- most
      // commonly `(` for a method (`greet() {}`) -- is still neither a `key:
      // value` nor a shorthand shape, so it's skipped exactly as it always
      // was.
      if (isIdentifierKey && key !== null && (j >= end || text[j] === "," || text[j] === "}")) {
        const refs = extractIdentifierRefs(key);
        if (refs.length > 0) {
          const entry: ConstEntry = { literal: refs.join(" ") };
          entries.set(key, entry);
          order.push({ kind: "entry", key, entry });
        }
        i = j;
        continue;
      }
      // A method (`greet() {}`) or a computed key that isn't followed by
      // `:` -- not a `key: value` shape. Skipped rather than aborting every
      // entry after it.
      const skipTo = scanToDepthZeroComma(text, i, end);
      i = skipTo > i ? skipTo : i + 1;
      continue;
    }
    j++;
    while (j < end && /\s/.test(text[j])) j++;
    const valueStart = j;
    const valueEnd = scanToDepthZeroComma(text, valueStart, end);
    const valueText = text.slice(valueStart, valueEnd);
    const trimmed = valueText.trimStart();
    const bodies = extractLiteralBodies(valueText);
    if (key !== null) {
      if (trimmed.startsWith("{")) {
        const nestedStart = valueStart + (valueText.length - trimmed.length);
        const nested = extractObjectEntries(text.slice(nestedStart));
        const entry: ConstEntry = {
          literal: bodies.join(" "),
          entries: nested.entries.size > 0 ? nested.entries : undefined,
          // Round 36b: previously discarded, leaving `{ a: { ...base } }`
          // unresolved regardless of whether `base` was a local or imported
          // declaration -- `extractObjectEntries` has no `decls`/scope access
          // to resolve it here itself, so the raw order is carried up for
          // `resolveNestedEntrySpreads` to replay once scope is known.
          spreadOrder: nested.spreads.length > 0 ? nested.order : undefined,
        };
        entries.set(key, entry);
        order.push({ kind: "entry", key, entry });
      } else {
        // An identifier-only (or identifier-plus-literal) entry value --
        // `alert: pulse`, `alert: cn(pulse, "text-xs")` -- has no literal
        // body of its own, which used to drop the entry entirely, the same
        // "not class-shaped" gap round 29 fixed for a top-level `const`
        // initializer. Never dropped now: the identifiers/member-access
        // chains the value references are folded into the entry's own
        // `literal` via `extractIdentifierRefs`, so `resolveMemberAccess`'s
        // existing recursive `resolveConstRefs` call on a resolved entry's
        // `literal` resolves them exactly like any other reference (Codex,
        // PR #874 round 33).
        //
        // The entry is registered even when BOTH `bodies` and `refs` come
        // back empty -- a value made up entirely of an excluded keyword
        // (`true`/`false`/`null`/`undefined`, per `IDENTIFIER_REF_KEYWORDS`)
        // or a bare numeric/other literal with no string and no identifier
        // at all (`pulse: 42`). Before round 43, dropping the entry here
        // conflated two different things a caller needs told apart: the key
        // being ABSENT from the object literal at all, vs. the key being
        // PRESENT with a value this scanner can't read a class out of --
        // `{ className: undefined }` genuinely clears `className` at
        // runtime (the key is present, its resolved value is just empty),
        // which is a real override, but a dropped entry made it
        // indistinguishable from `{ title: "status" }` (no `className` key
        // at all, nothing to override with) to any caller checking
        // `entries.has(key)` (`resolveInlineObjectClassName`,
        // `classifySpreadExpression`'s chain-narrowing branch -- Codex, PR
        // #874 round 43 thread 1, correcting round 42 thread 1's own
        // `{ className: undefined }` handling, which Codex flagged as
        // backwards). An empty `literal` here is also the correct fail-
        // closed value for a value this walk genuinely can't read any class
        // text out of at all (no quoted body, no identifier) -- it resolves
        // to "no known class contribution," never fabricating a violation
        // out of a shape this scanner has no model for, same direction as
        // every other fail-closed convention in this file.
        const refs = extractIdentifierRefs(valueText);
        const entry: ConstEntry = { literal: [bodies.join(" "), refs.join(" ")].filter(Boolean).join(" ") };
        entries.set(key, entry);
        order.push({ kind: "entry", key, entry });
      }
    }
    i = valueEnd;
  }
  return { entries, spreads, order };
}

/** One binding introduced by an object-destructuring pattern's own syntax --
 * `{ a, b: renamed, c = default, ...others, d: { e } }`. `localName` is the
 * name actually bound in scope (the identifier after `:`, or the shorthand
 * name itself); `sourceKey` is the source object's own key it reads from
 * (`null` only for a `...rest` binding, which isn't tied to any single key).
 * `nestedPattern` is set only for `key: { ... }` (nested destructuring) and
 * holds that inner pattern's own raw text (braces included) for a further,
 * recursive parse. A default (`c = default`) doesn't change how `c`
 * resolves -- the destructured value is still the source key's own entry
 * whenever the source actually has that key, same fail-closed precision as
 * everywhere else in this scanner (Codex, PR #874 round 35). `defaultLiteral`
 * (round 38) is the default expression's own literal bodies/identifier refs
 * (`extractLiteralBodies`/`extractIdentifierRefs`, same as any other
 * identifier-or-literal value in this file) -- used only when the source has
 * no precise entry for `sourceKey` at all, since real JS only ever falls
 * back to a destructuring default when the source key is genuinely
 * `undefined`, never when it resolves to some other value (`c = "text-xs"`
 * next to a real, present, pulsing `c` on the source stays on the source's
 * own value, unchanged). No `defaultLiteral` is collected for a nested
 * pattern's own default (`d: { e } = fallback`) -- out of scope for this
 * round, a known gap. */
interface DestructuringBinding {
  localName: string;
  sourceKey: string | null;
  nestedPattern?: string;
  defaultLiteral?: string;
}

/** Parses `{ a, b: renamed, c = default, ...others, d: { e } }` (braces
 * included) into its own bindings, in source order. This is the pattern-side
 * mirror of `extractObjectEntries`: same key-shape recognition and the same
 * `scanToDepthZeroComma` skip-past-what-I-don't-understand rule (a default's
 * own value, `c = someCall(1, 2)`, may itself contain a comma). A computed
 * key (`{ [k]: renamed }`) is skipped -- there's no way to know which source
 * key it reads at scan time, the same fail-closed skip an unresolved key
 * shape already gets everywhere else in this file (Codex, PR #874
 * round 35). */
/** If `patternText[pos]` (after skipping leading whitespace) is a default
 * initializer's own `=` -- not a destructured-then-renamed pattern's `:`,
 * already handled by the caller before this is ever reached -- returns that
 * default expression's own literal bodies and identifier refs, joined the
 * same way any other identifier-or-literal value in this file is
 * (`extractLiteralBodies`/`extractIdentifierRefs`, e.g. `extractObjectEntries`'s
 * own identifier-only entry handling), plus the position just past it.
 * Undefined (no default) when `patternText[pos]` isn't `=` (Codex, PR #874
 * round 38). */
function parseDefaultLiteral(
  patternText: string,
  pos: number,
  end: number,
): { defaultLiteral: string | undefined; after: number } {
  if (patternText[pos] !== "=") return { defaultLiteral: undefined, after: pos };
  let dv = pos + 1;
  while (dv < end && /\s/.test(patternText[dv])) dv++;
  const defaultEnd = scanToDepthZeroComma(patternText, dv, end);
  const defaultText = patternText.slice(dv, defaultEnd);
  const bodies = extractLiteralBodies(defaultText);
  const refs = extractIdentifierRefs(defaultText);
  const defaultLiteral = [bodies.join(" "), refs.join(" ")].filter(Boolean).join(" ") || undefined;
  return { defaultLiteral, after: defaultEnd };
}

function parseDestructuringPattern(patternText: string): DestructuringBinding[] {
  const bindings: DestructuringBinding[] = [];
  const end = extractBalanced(patternText, 0, "{", "}").endIndex;
  let i = 1; // past the pattern's own opening '{'
  while (i < end) {
    while (i < end && /[\s,]/.test(patternText[i])) i++;
    if (i >= end) break;

    if (patternText.slice(i, i + 3) === "...") {
      const specStart = i + 3;
      const specEnd = scanToDepthZeroComma(patternText, specStart, end);
      const spec = patternText.slice(specStart, specEnd).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(spec)) {
        bindings.push({ localName: spec, sourceKey: null });
      }
      i = specEnd;
      continue;
    }

    const idMatch = /^[A-Za-z_$][\w$]*/.exec(patternText.slice(i, i + 200));
    if (!idMatch) {
      // A computed key or another shape this parser doesn't recognize --
      // skipped past to the next depth-0 comma rather than aborting the
      // whole pattern.
      const skipTo = scanToDepthZeroComma(patternText, i, end);
      i = skipTo > i ? skipTo : i + 1;
      continue;
    }
    const key = idMatch[0];
    let j = i + key.length;
    while (j < end && /\s/.test(patternText[j])) j++;
    if (patternText[j] === ":") {
      j++;
      while (j < end && /\s/.test(patternText[j])) j++;
      if (patternText[j] === "{") {
        const nestedEnd = extractBalanced(patternText, j, "{", "}").endIndex;
        const nestedPattern = patternText.slice(j, nestedEnd + 1);
        bindings.push({ localName: key, sourceKey: key, nestedPattern });
        i = scanToDepthZeroComma(patternText, nestedEnd + 1, end);
        continue;
      }
      const renamedMatch = /^[A-Za-z_$][\w$]*/.exec(patternText.slice(j, j + 200));
      if (renamedMatch) {
        let k = j + renamedMatch[0].length;
        while (k < end && /\s/.test(patternText[k])) k++;
        const { defaultLiteral, after } = parseDefaultLiteral(patternText, k, end);
        bindings.push({ localName: renamedMatch[0], sourceKey: key, defaultLiteral });
        i = scanToDepthZeroComma(patternText, after, end);
      } else {
        i = scanToDepthZeroComma(patternText, j, end);
      }
      continue;
    }
    // Shorthand, optionally defaulted (`a` or `a = default`) -- `j` (already
    // advanced past `key` and any whitespace above) either sits on the `=`
    // of a default or isn't one at all, either way handled by
    // `parseDefaultLiteral`.
    const { defaultLiteral, after } = parseDefaultLiteral(patternText, j, end);
    const valueEnd = scanToDepthZeroComma(patternText, after, end);
    bindings.push({ localName: key, sourceKey: key, defaultLiteral });
    i = valueEnd;
  }
  return bindings;
}

/** Registers every binding `parseDestructuringPattern` found for one
 * destructuring declarator as its own `ConstDecl`, so a later
 * `className={alert}` resolves through `visibleDecl` exactly like a plain
 * `const alert = "…"` would. `sourceEntries`/`sourceLiteral` are the already-
 * resolved source object's own `entries`/`literal` (a spread-merged object's
 * `entries`, from `spreadQueue`, is included -- this runs after that queue).
 * A key present in `sourceEntries` resolves to that key's own entry,
 * precisely -- real JS destructuring only ever falls back to a default when
 * the source key is genuinely `undefined`, never when it's present with some
 * other value, so a present key's own entry always wins over
 * `binding.defaultLiteral`, unconditionally, exactly like it always has. A
 * key the source object doesn't have a precise entry for at all (an
 * unresolvable spread's open key already replaced with the whole object's
 * flattened literal, a computed key, or one this scanner never modeled) used
 * to fall back to `sourceLiteral` alone, discarding `binding.defaultLiteral`
 * outright even when the source is a plain object literal that provably
 * lacks the key -- the one case real JS *guarantees* the default applies
 * (Codex, PR #874 round 38). Now unions the two: `sourceLiteral` alone
 * already had to stay fail-closed for the genuinely ambiguous case (an
 * unresolvable spread that might still carry this key at runtime), and
 * `binding.defaultLiteral` is added alongside it rather than replacing it,
 * so neither the default's own literal/identifier-ref content nor the
 * pre-existing conservative fallback is ever lost. A `...rest` binding is
 * always "open" -- it could carry any key the pattern didn't destructure by
 * name -- so it always falls back to `sourceLiteral` too (no default is
 * syntactically possible on a rest binding). A nested pattern (`d: { e }`)
 * recurses using `d`'s own entry as the new source, however deep it goes;
 * a default on the nested pattern itself (`d: { e } = fallback`) is not
 * collected by `parseDestructuringPattern` and so never reaches here, a
 * known gap out of scope for this round (Codex, PR #874 round 35; round 38
 * adds the default union). */
function registerDestructuringBindings(
  bindings: DestructuringBinding[],
  sourceEntries: Map<string, ConstEntry> | undefined,
  sourceLiteral: string,
  scopeStart: number,
  scopeEnd: number,
  index: number,
  decls: ConstDecl[],
): void {
  for (const binding of bindings) {
    if (binding.sourceKey === null) {
      decls.push({ name: binding.localName, index, literal: sourceLiteral, scopeStart, scopeEnd });
      continue;
    }
    const entry = sourceEntries?.get(binding.sourceKey);
    if (binding.nestedPattern) {
      registerDestructuringBindings(
        parseDestructuringPattern(binding.nestedPattern),
        entry?.entries,
        entry?.literal ?? sourceLiteral,
        scopeStart,
        scopeEnd,
        index,
        decls,
      );
      continue;
    }
    decls.push({
      name: binding.localName,
      index,
      literal: entry?.literal ?? [binding.defaultLiteral, sourceLiteral].filter(Boolean).join(" "),
      entries: entry?.entries,
      scopeStart,
      scopeEnd,
    });
  }
}

/** Result of `skipTypeAnnotation`: either the position just past the
 * terminating `=` and any following whitespace (`kind: "initializer"`), or --
 * only reachable for `let`/`var`, since a `const` always has an initializer
 * in valid code -- the position of a depth-0 `;` reached before any `=` was
 * found at all, meaning the declaration has no initializer (`let classes:
 * string;`, Codex, PR #874 round 26). */
interface TypeAnnotationResult {
  kind: "initializer" | "none";
  pos: number;
}

/** Index just past a `const NAME: <this>` type annotation that starts at
 * `colonIndex` (the annotation's own colon), i.e. the position right after
 * the terminating `=` and any following whitespace -- or `null` if the
 * annotation runs off the end of the source with no `=` and no statement-
 * ending `;` ever found. Scans forward tracking depth over `<>`/`()`/`[]`/`{}`
 * (so a generic `Record<State, string>`, `Readonly<Record<"a" | "b",
 * string>>`, `Array<string>`, `string[]`, and an object-type literal `{ foo:
 * string }` are all skipped whole) and over quoted/template text (a union
 * member `"a" | "b"` never confuses depth tracking). A depth-0 `=` ends the
 * annotation, except `=>` (a function type's arrow, e.g. `(live: boolean) =>
 * string`, is part of the type, not the terminator) and `==`/`===` (skipped
 * as a run), both of which are stepped over whole before the check for a
 * bare `=` can fire (a bare `>=`/`<=` can't occur at depth 0 inside a type,
 * so only the arrow needs an explicit guard). A depth-0 `;` reached before
 * any such `=` ends the statement with no initializer at all -- this can't
 * happen for a real `const` (always initialized), so it never changes that
 * path's behavior, but it's what lets `let`/`var` with a bare type
 * annotation and no initializer register instead of the scan running away
 * hunting for a stray unrelated `=` later in the file. Without this, the
 * collector's old regex only tolerated a literal `: string` annotation, so
 * any other annotation made the whole `const` declaration invisible to it
 * (Codex, PR #874 round 17). */
function skipTypeAnnotation(source: string, colonIndex: number): TypeAnnotationResult | null {
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
    // A depth-0 comma also ends the annotation with no initializer -- the
    // declarator-list separator (`let a: string, classes: string = "x";`),
    // never a real type's own comma (a union/tuple/generic member's comma
    // is always inside `<>`/`()`/`[]`/`{}`, so always depth>0 here, Codex,
    // PR #874 round 33).
    if (depth === 0 && (c === ";" || c === ",")) {
      return { kind: "none", pos: i };
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
        return { kind: "initializer", pos: i };
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
 * references) registers regardless rather than being skipped as not
 * class-shaped -- an identifier-only (or identifier-plus-literal) alias
 * (`const classes = pulse;`, `const classes = cn(pulse, "text-xs");`,
 * `const classes = STYLES.alert;`) has every identifier/member-access chain
 * its initializer references folded into `literal` alongside any literal
 * bodies it does have, via `extractIdentifierRefs`, so the existing
 * recursive resolution walk resolves them exactly like any other reference
 * once this decl is looked up (Codex, PR #874 round 29). A type annotation
 * between the name and the initializer -- `Record<State, string>`, a
 * function type, a union, `typeof X` -- is skipped whole by
 * `skipTypeAnnotation` regardless of its shape, not just the literal `:
 * string` case (round 17). Despite the name, also collects `let` and `var`
 * declarations the same way, including one with no initializer at all
 * (`let classes: string;` or bare `let classes;`), and then unions in every
 * literal body from a later reassignment in the declaration's own scope via
 * `collectReassignedLiteralBodies` -- `classes += "…"`/`classes ||=
 * "…"`/`classes ??= "…"`/a later plain `classes = "…"` -- fail closed, since
 * a `const` is never reassigned but a `let`/`var` used for conditionally-
 * built class strings is invisible otherwise (Codex, PR #874 round 26). */
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

/** Every string/template literal body found in the RHS of a later
 * reassignment of `decl.name` (`name = …`, `name += …`, `name ||= …`, `name
 * ??= …` -- a bare identifier at a statement boundary, not `.name =`
 * reaching into an unrelated object and not a comparison `name == …`/`name
 * === …`) between `searchStart` and `scopeEnd` in `source`. Only ever called
 * for `let`/`var` (a `const` is never reassigned in valid code): a `let`/
 * `var` declaration's initial literal set can miss classes added by a later
 * assignment (`classes += " animate-pulse"`), so every RHS's literals found
 * in the declaration's own scope are unioned in here, fail closed -- which
 * branch of an `if` actually reaches a given reference is control flow this
 * scanner deliberately does not resolve (Codex, PR #874 round 26).
 *
 * A same-named assignment inside a NESTED scope may actually be that inner
 * scope's own declaration of `name` (`let classes = "text-alert-red"; function
 * inner() { let classes = "animate-pulse"; }`), not a reassignment of
 * `decl` at all -- the bare regex above can't tell `let classes =` from
 * `classes =`, since both end in the same "name, optional whitespace, `=`"
 * text. `decls` (already fully populated -- callers only run this sweep
 * once every declaration in the file has been collected, Codex, PR #874
 * round 31) resolves which declaration is actually visible at the match's
 * position via the same `visibleDecl` scoping rule a reference site uses; a
 * match that resolves to a DIFFERENT declaration than `decl` itself is
 * shadowed and skipped. */
function collectReassignedLiteralBodies(
  source: string,
  decl: ConstDecl,
  decls: ConstDecl[],
  searchStart: number,
  scopeEnd: number,
): string[] {
  const escaped = decl.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignRe = new RegExp(`(?<![\\w$.])${escaped}\\s*(\\+=|\\|\\|=|\\?\\?=|=)(?!=)`, "g");
  const scopeText = source.slice(searchStart, scopeEnd);
  const bodies: string[] = [];
  let am: RegExpExecArray | null;
  while ((am = assignRe.exec(scopeText))) {
    const rhsStart = am.index + am[0].length;
    const rhsEnd = findInitializerEnd(scopeText, rhsStart);
    const shadow = visibleDecl(decls, decl.name, searchStart + am.index);
    if (!shadow || shadow.index === decl.index) {
      bodies.push(...extractLiteralBodies(scopeText.slice(rhsStart, rhsEnd)));
    }
    assignRe.lastIndex = rhsEnd;
  }
  return bodies;
}

/** Same walk as `collectReassignedLiteralBodies`, but collecting identifier
 * references (`extractIdentifierRefs`) from each reassignment's RHS instead
 * of quoted literal bodies -- a `let`/`var` alias reassigned to another
 * binding (`let classes; classes = pulse;`) needs the same "no literal body
 * yet, but reaches one through an identifier" treatment as an aliasing
 * initializer (Codex, PR #874 round 29). Shares the same shadowed-by-a-
 * nested-declaration exclusion as `collectReassignedLiteralBodies` (Codex,
 * PR #874 round 31). */
function collectReassignedIdentifierRefs(
  source: string,
  decl: ConstDecl,
  decls: ConstDecl[],
  searchStart: number,
  scopeEnd: number,
): string[] {
  const escaped = decl.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignRe = new RegExp(`(?<![\\w$.])${escaped}\\s*(\\+=|\\|\\|=|\\?\\?=|=)(?!=)`, "g");
  const scopeText = source.slice(searchStart, scopeEnd);
  const refs: string[] = [];
  let am: RegExpExecArray | null;
  while ((am = assignRe.exec(scopeText))) {
    const rhsStart = am.index + am[0].length;
    const rhsEnd = findInitializerEnd(scopeText, rhsStart);
    const shadow = visibleDecl(decls, decl.name, searchStart + am.index);
    if (!shadow || shadow.index === decl.index) {
      refs.push(...extractIdentifierRefs(scopeText.slice(rhsStart, rhsEnd)));
    }
    assignRe.lastIndex = rhsEnd;
  }
  return refs;
}

/** Keywords that can appear as a bare word in a class expression's non-
 * string portion (`cond ? pulse : other`, `typeof x === "…"`) but are never
 * themselves an outer const reference, so `extractIdentifierRefs` never
 * treats them as one (Codex, PR #874 round 29). */
const IDENTIFIER_REF_KEYWORDS = new Set(["true", "false", "null", "undefined"]);

/** Call names that build a class string from their own arguments rather
 * than naming one directly (`cn(pulse, "text-xs")`) -- the call name itself
 * is never a const reference, though its arguments still are scanned
 * normally by the same walk (Codex, PR #874 round 29). */
const CLASS_HELPER_CALL_NAMES = new Set(["cn", "clsx", "twMerge", "classNames"]);

/** Bare identifiers and member-access chains (`NAME` or a dotted/quoted-key
 * run, `NAME.key1["key2"]`, extended exactly as far as
 * `resolveMemberAccess`'s own *precise*-key narrowing would walk it) found
 * anywhere in `text` outside a quoted/template string body -- kept as the
 * whole chain, not just its head, so a downstream `resolveConstRefs` pass
 * over the literal this feeds into can walk a `.key` access into an
 * object-valued const (`STYLES.alert`) exactly as precisely as it would at
 * the original reference site. A chain that reaches a *computed* (unquoted)
 * `[...]` segment instead drops the whole reference (not even the bare
 * head) -- `resolveMemberAccess` only narrows a precise key, so keeping just
 * the object's bare name would let `resolveConstRefs`'s member-access-blind
 * second pass substitute that object const's entire flattened literal in
 * its place with the real computed key left dangling, unrelated to whatever
 * key the alias's own use site narrows to. Used by `collectConstTemplateMap`
 * so an identifier-only (or identifier-plus-literal) initializer -- `const
 * classes = pulse;`, `const classes = cond ? pulse : other;`, `const classes
 * = cn(pulse, "text-xs");`, `const classes = STYLES.alert;`, `const classes
 * = pulse + " text-xs";` -- is never "not class-shaped" just because it has
 * no (or not only) a quoted literal of its own; the identifiers it names are
 * folded into the declaration's own `literal` text (see
 * `collectConstTemplateMap`) so the existing recursive
 * `resolveConstRefs`/`resolveMemberAccess` walk -- visited-set cycle guard
 * and all -- resolves them exactly like any other reference, including one
 * that lands on a round-28 imported decl. An arrow function's own parameter
 * name(s) (`(i) => …`/`i => …`) are bound locally, never an outer const
 * reference, so they're excluded; a keyword/`true`/`false`/`null`/
 * `undefined` and a call name that is `cn`/`clsx`/`twMerge`/`classNames`
 * (only the call name itself -- its arguments are still walked normally)
 * are excluded too, since none of those can ever resolve to a declaration
 * (Codex, PR #874 round 29). */
function extractIdentifierRefs(text: string): string[] {
  const bound = new Set<string>();
  const arrowRe = /(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*=>/g;
  let am: RegExpExecArray | null;
  while ((am = arrowRe.exec(text))) {
    const params = am[1] ?? am[2] ?? "";
    for (const rawParam of params.split(",")) {
      const paramName = rawParam.trim().split(/[:=]/)[0]?.trim();
      if (paramName && /^[A-Za-z_$][\w$]*$/.test(paramName)) bound.add(paramName);
    }
  }

  const refs: string[] = [];
  const headRe = /^[A-Za-z_$][\w$]*/;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      i += extractTemplateLiteral(text, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (c === "{") {
      // A nested `{...}` block -- a callback's statement body
      // (`useMemo(() => { ... })`), an object literal passed as an
      // argument, a destructuring pattern -- is opaque here: none of the
      // required alias shapes (bare identifier, ternary, `cn()` call, dot
      // member access, concatenation, `let` reassignment) ever contain one,
      // so walking into a block's own local variables (a `.filter`/`.find`
      // callback's parameter and loop-local names, an unrelated object
      // literal's own keys) would fold identifiers that were never a class
      // reference into the outer const's `literal`, only to have
      // `resolveConstRefs`'s member-access-blind second pass later
      // substitute unrelated text in for a bare use of the outer const
      // elsewhere -- e.g. `const breakInAlert = useMemo(() => { ...
      // several bound/loop-local names... }, [deps]);` lengthening
      // `breakInAlert`'s folded literal enough to drift a real, already
      // `KNOWN_REMAINING_SITES`-anchored violation's computed index outside
      // `ANCHOR_WINDOW_RADIUS` (KioskChrome.tsx, Codex, PR #874 round 29
      // follow-up). Skipped whole via the same quote/template-aware
      // brace-matcher `findClassNameSites` itself uses.
      i = extractBalanced(text, i, "{", "}").endIndex + 1;
      continue;
    }
    const headMatch = headRe.exec(text.slice(i));
    if (!headMatch) {
      i++;
      continue;
    }
    const head = headMatch[0];
    // Extend the chain through `.key` and a *quoted* `["key"]` segment
    // verbatim -- the same precise-key shape `resolveMemberAccess` narrows
    // on -- so the resolved literal feeds straight back into that existing
    // narrowing exactly as if the chain had been written directly at the
    // reference site instead of behind an alias (Codex, PR #874 round 29).
    // A *computed* bracket (`STATUS_CONFIG[status]`) stops the chain and
    // drops the whole reference instead of keeping just the bare head:
    // `resolveMemberAccess` only narrows a precise key, so an alias whose
    // own initializer is a computed lookup (`const config =
    // STATUS_CONFIG[status];`) has no `entries` of its own, and a later
    // `config.pulse` at the use site fails to narrow for the same reason --
    // leaving the bare object name as the only folded ref would instead let
    // `resolveConstRefs`'s member-access-blind second pass substitute the
    // *entire* object const's own flattened literal (every status's
    // label/bg/text/border bodies concatenated) in place of `config`, with
    // the real `.pulse` key left dangling unresolved -- a false "tinted
    // text" positive on a purely decorative dot (DxccStatusBadge.tsx,
    // OnAirBadge.tsx) this shape was never asked to cover (Codex, PR #874
    // round 29 follow-up).
    let chainEnd = i + head.length;
    let droppedForComputedKey = false;
    while (true) {
      if (text[chainEnd] === ".") {
        const keyMatch = headRe.exec(text.slice(chainEnd + 1));
        if (!keyMatch) break;
        chainEnd += 1 + keyMatch[0].length;
        continue;
      }
      if (text[chainEnd] === "[") {
        const close = findBracketClose(text, chainEnd);
        if (close === -1) break;
        const inner = text.slice(chainEnd + 1, close);
        const quoted = /^\s*(["'])((?:(?!\1)[\s\S])*)\1\s*$/.test(inner);
        if (!quoted) {
          droppedForComputedKey = true;
          break;
        }
        chainEnd = close + 1;
        continue;
      }
      break;
    }
    const chain = text.slice(i, chainEnd);
    const isCallName = chain === head && text[chainEnd] === "(";
    i = chainEnd;
    if (droppedForComputedKey) continue;
    if (bound.has(head)) continue;
    if (IDENTIFIER_REF_KEYWORDS.has(head)) continue;
    if (isCallName && CLASS_HELPER_CALL_NAMES.has(head)) continue;
    refs.push(chain);
  }
  return refs;
}

/** Replays a nested `ConstEntry`'s own `spreadOrder` (round 36b) the exact
 * same way `collectConstTemplateMap`'s `spreadQueue` loop replays a
 * top-level declaration's `order` -- a resolvable spread overwrites every
 * key it carries in source order (round 34), resolved against `decls` PLUS
 * any imported bindings (round 36); an unresolvable spread fails closed onto
 * `openKeys`, but with THIS entry's own flattened `literal` as the fallback,
 * not the enclosing declaration's -- so `{ a: { safe: "text-green", ...bad }
 * }` only clouds `a.safe`, never a sibling key at the parent level. Recurses
 * into the (possibly freshly merged) child `entries` afterward so nesting of
 * any depth resolves, guarded by `visited` against revisiting the same
 * `ConstEntry` object twice -- spread merging can make two different parents
 * share one entry by reference, and a spread cycle across declarations
 * (`a = { ...b }`, `b = { ...a }`) would otherwise recurse forever. */
function resolveNestedEntrySpreads(
  entries: Map<string, ConstEntry> | undefined,
  decls: ConstDecl[],
  atIndex: number,
  visited: Set<ConstEntry> = new Set(),
): void {
  if (!entries) return;
  for (const entry of entries.values()) {
    if (visited.has(entry)) continue;
    visited.add(entry);
    if (entry.spreadOrder) {
      const merged = new Map<string, ConstEntry>();
      const openKeys = new Set<string>();
      for (const op of entry.spreadOrder) {
        if (op.kind === "entry") {
          merged.set(op.key, op.entry);
          openKeys.delete(op.key);
          continue;
        }
        const spreadDecl = visibleDecl(decls, op.name, atIndex);
        if (spreadDecl?.entries) {
          for (const [key, value] of spreadDecl.entries) {
            merged.set(key, value);
            openKeys.delete(key);
          }
        } else {
          for (const key of merged.keys()) openKeys.add(key);
        }
      }
      for (const key of openKeys) {
        const existing = merged.get(key);
        merged.set(key, { literal: entry.literal, entries: existing?.entries });
      }
      entry.entries = merged;
      entry.spreadOrder = undefined;
    }
    resolveNestedEntrySpreads(entry.entries, decls, atIndex, visited);
  }
}

/** A JSX opening tag (`<div`, `<Foo.Bar`, `<br/>`) -- deliberately requires a
 * letter immediately after `<` with no space, so a comparison (`a < b`,
 * `x < 5`) never matches. Used to decide whether a nested function body
 * `findNestedFunctionBodyRange` finds is a plain helper (safe to recurse
 * into) or a React component's own render body (Codex, PR #874 round 40
 * thread 2 follow-up; see the guard at its call site in
 * `collectConstTemplateMap`). */
const JSX_OPENING_TAG_RE = /<[A-Za-z][\w.]*(?:[\s/>])/;

/** Locates the first `{` inside `source.slice(rangeStart, rangeEnd)` that
 * `isFunctionBodyOpenBrace` confirms is an actual function-body brace (not
 * one belonging to an object literal, destructuring pattern, or type
 * annotation) -- i.e., the body of a nested arrow function or function
 * expression assigned as a `const`/`let`/`var` initializer. The forward scan
 * in `collectConstTemplateMap` never revisits an initializer's own text once
 * `findInitializerEnd` has measured past it (needed so a nested statement
 * inside that body isn't mistaken for a sibling declarator of the SAME
 * statement) -- which means a `var`/`let`/`const` declared *inside* that
 * nested body, e.g. `const Inner = () => { var classes = "..."; }`, was
 * never scanned into `decls` at all, unlike an equivalent named `function
 * inner() {...}` declaration (never swallowed as anyone's initializer, so
 * naturally revisited by that same forward scan already -- round 32's own
 * "two nested functions" fixture only ever exercised that named-function
 * form). Returns the nested body's own `{...}` range so the caller can
 * recurse its scan into it (Codex, PR #874 round 40 thread 2 follow-up). */
function findNestedFunctionBodyRange(
  source: string,
  rangeStart: number,
  rangeEnd: number,
): { start: number; end: number } | null {
  let i = rangeStart;
  while (i < rangeEnd) {
    const c = source[i];
    if (c === "`") {
      i += extractTemplateLiteral(source, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1 || close >= rangeEnd) return null;
      i = close + 1;
      continue;
    }
    if (c === "{" && isFunctionBodyOpenBrace(source, i)) {
      return { start: i, end: findMatchingCloseBraceForward(source, i) };
    }
    i++;
  }
  return null;
}

/** Same job as `extractBalanced(source, openIndex, "{", "}").endIndex`, but
 * -- like `findInitializerEnd` -- skips a template literal via
 * `extractTemplateLiteral` (which tracks `${...}` brace depth explicitly)
 * rather than treating a backtick as a same-character string delimiter.
 * `extractBalanced`'s naive backtick handling closes the *string* at the
 * first backtick it meets, including one belonging to a template literal
 * NESTED inside another template's own `${...}` (`` `group ${cond ? a :
 * `grid ${gridCols}`} ...` `` -- a real construct in `SpotRow.tsx`) -- so a
 * second, later, now-*unmatched* backtick then opens an `inStr` span that
 * swallows the rest of the file, and every `{`/`}` inside it goes uncounted,
 * so a function body brace this large ever finds its own close. Used only
 * for `findNestedFunctionBodyRange`'s forward search, which routinely spans
 * a whole component body and so is exactly the case most likely to contain a
 * nested template literal somewhere inside it (Codex, PR #874 round 40
 * thread 2 follow-up). */
function findMatchingCloseBraceForward(source: string, openIndex: number): number {
  let depth = 0;
  let i = openIndex;
  while (i < source.length) {
    const c = source[i];
    if (c === "`") {
      i += extractTemplateLiteral(source, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1) return source.length - 1;
      i = close + 1;
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      if (depth === 0) return i;
      i++;
      continue;
    }
    i++;
  }
  return source.length - 1;
}

function collectConstTemplateMap(source: string, importedDecls: ConstDecl[] = []): ConstDecl[] {
  const decls: ConstDecl[] = [];
  // Reassignment sweeps (below) need every declaration in the file already
  // collected -- including one that appears LATER in the text than the
  // `let`/`var` it might shadow, e.g. a nested function's own `let classes`
  // declared after the outer `let classes` this same-named regex sweep runs
  // for -- so a shadow check against a still-partial `decls` list would miss
  // it. Queued here and run once the forward scan below finishes populating
  // `decls` completely (Codex, PR #874 round 31).
  const reassignQueue: Array<{ decl: ConstDecl; searchStart: number }> = [];
  // Same reasoning as `reassignQueue`: a spread's source object
  // (`const styles = { ...base, ... }`) may -- in principle -- be declared
  // anywhere relative to `styles` itself, so merging is deferred until
  // `decls` is fully populated rather than attempted inline (Codex, PR #874
  // round 32; round 34 replays the object's full `order`, not just its
  // spreads, so overwrite order matches the source).
  const spreadQueue: Array<{ decl: ConstDecl; order: ObjectEntryOp[] }> = [];
  // A destructuring declarator's own bindings (`const { alert } = styles;`)
  // are deferred the same way -- `styles` may be declared anywhere relative
  // to this destructure, and (if `styles` is itself spread-merged) needs
  // `spreadQueue` to have already run (Codex, PR #874 round 35).
  const destructureQueue: Array<{
    pattern: string;
    sourceName: string;
    scopeStart: number;
    scopeEnd: number;
    index: number;
  }> = [];
  // Wrapped in a function (rather than a single flat loop) so a nested
  // function/arrow body found INSIDE a declarator's own initializer --
  // swallowed whole by `findInitializerEnd` below so the outer loop can tell
  // where that declarator's OWN initializer ends -- can still be scanned for
  // its own `var`/`let`/`const` declarations by recursing into it, same as
  // `findNestedFunctionBodyRange`'s own doc comment explains (Codex, PR #874
  // round 40 thread 2 follow-up).
  function scanRange(rangeStart: number, rangeEnd: number): void {
    const keywordRe = /\b(const|let|var)\s+/g;
    keywordRe.lastIndex = rangeStart;
    let m: RegExpExecArray | null;
    while ((m = keywordRe.exec(source)) && m.index < rangeEnd) {
      const kind = m[1] as "const" | "let" | "var";
      const keywordIndex = m.index;
    // Every declarator in this declaration shares the same scope/kind --
    // computed once from the keyword's own position, not per declarator
    // (Codex, PR #874 round 33). `var` (unlike `let`/`const`) is never
    // block-scoped -- a `var` inside an `if`/`for`/`try` block is visible
    // for the whole enclosing FUNCTION, not just that block (Codex, PR #874
    // round 32).
    const scope =
      kind === "var"
        ? findEnclosingFunctionScope(source, keywordIndex)
        : findEnclosingBraceRange(source, keywordIndex);
    const scopeStart = scope ? scope.start : 0;
    const scopeEnd = scope ? scope.end : source.length;
    let pos = keywordRe.lastIndex;
    // Splits the declaration region into declarators at depth-0 commas --
    // `const pulse = "animate-pulse", classes = pulse;` used to register
    // only `pulse`: the old single-declarator regex captured just the first
    // name, and `findInitializerEnd` (not yet comma-aware) ran clean past
    // the comma to the statement's own terminating `;`, swallowing
    // `classes = pulse` into `pulse`'s own initializer text instead of ever
    // registering `classes` as its own declaration -- so a later
    // `className={classes}` had no declaration to resolve against no
    // matter what `pulse` itself resolved to (Codex, PR #874 round 33).
    for (;;) {
      // A destructuring declarator's own type annotation/initializer still
      // has to be scanned past correctly so a LATER declarator in the same
      // list isn't lost. An object pattern (`{ a } = …`) destructured from a
      // bare-identifier RHS is queued to `destructureQueue` and its own
      // bindings registered once that identifier resolves (below); any other
      // RHS shape (a call, a member access, a ternary...) can't be resolved
      // to a declaration at all, and an array pattern (`[x] = …`) has no
      // registrable shape either -- `ConstEntry` doesn't index an array's own
      // elements, only flattens its literals same as round 16 -- so both keep
      // today's prior behaviour: scanned past, but never registered (Codex,
      // PR #874 round 35).
      if (source[pos] === "{" || source[pos] === "[") {
        const open = source[pos];
        const patternStart = pos;
        const patternEnd =
          open === "{" ? extractBalanced(source, pos, "{", "}").endIndex : findBracketClose(source, pos);
        let after = (patternEnd === -1 ? source.length - 1 : patternEnd) + 1;
        while (after < source.length && /\s/.test(source[after])) after++;
        if (source[after] === ":") {
          const typeResult = skipTypeAnnotation(source, after);
          after = typeResult === null ? after + 1 : typeResult.pos;
          if (typeResult?.kind === "initializer") after = findInitializerEnd(source, after);
        } else if (source[after] === "=") {
          let i = after + 1;
          while (i < source.length && /\s/.test(source[i])) i++;
          const valueStart = i;
          after = findInitializerEnd(source, i);
          if (open === "{") {
            const rhs = source.slice(valueStart, after).trim();
            if (/^[A-Za-z_$][\w$]*$/.test(rhs) && patternEnd !== -1) {
              destructureQueue.push({
                pattern: source.slice(patternStart, patternEnd + 1),
                sourceName: rhs,
                scopeStart,
                scopeEnd,
                index: patternStart,
              });
            }
          }
        }
        pos = after;
      } else {
        const nameMatch = /^[A-Za-z_$][\w$]*/.exec(source.slice(pos));
        if (!nameMatch) break;
        const name = nameMatch[0];
        const nameIndex = pos;
        let after = pos + name.length;
        while (after < source.length && /\s/.test(source[after])) after++;
        let valueStart: number;
        if (source[after] === ":") {
          const typeResult = skipTypeAnnotation(source, after);
          if (typeResult === null) {
            pos = after + 1;
            break;
          }
          if (typeResult.kind === "none" && kind === "const") {
            // Can't happen in valid code (a const always has an initializer);
            // skip defensively rather than guess at an initializer that isn't
            // there.
            pos = typeResult.pos + 1;
            break;
          }
          valueStart = typeResult.pos;
        } else if (source[after] === "=") {
          let i = after + 1;
          while (i < source.length && /\s/.test(source[i])) i++;
          valueStart = i;
        } else if (kind !== "const" && (source[after] === ";" || source[after] === ",")) {
          // A `let`/`var` with no type annotation and no initializer at all
          // (`let classes;`, or a bare `let a, classes = "…";`) -- registers
          // with an empty literal set, same as the typed no-initializer case
          // above (Codex, PR #874 round 26).
          valueStart = after;
        } else {
          pos = after;
          break;
        }
        const firstChar = source[valueStart];
        const end = findInitializerEnd(source, valueStart);
        // Recurses into a nested arrow-function/function-expression body
        // this declarator's own initializer swallowed whole (see
        // `findNestedFunctionBodyRange`'s doc comment) so a `var`/`let`/
        // `const` declared inside it -- e.g. `const Inner = () => { var
        // classes = "..."; }` -- still gets its own entry in `decls`. Skipped
        // when that nested body itself renders JSX (`JSX_OPENING_TAG_RE`):
        // that shape is a React component, not a plain helper, and this
        // file's whole architecture already scans a component's own
        // `<div>`/`<span>` tags directly regardless of whether its local
        // consts resolve -- recursing into one anyway reaches `SpotRow.tsx`'s
        // entire ~19,000-character body (it's declared `const SpotRow =
        // memo(function SpotRow() {...})`, so its own initializer swallows
        // the whole component the exact same way `Inner`'s does here) and
        // starts resolving its `rowClasses` local, a site this file's own
        // header comment documents as a *deliberate* structural-census gap
        // covered only by the anchor/window freshness check -- a real
        // finding, but one the anchor-window coverage math (each anchor
        // must sit within `ANCHOR_WINDOW_RADIUS` of both the pulse text AND
        // the violation, which are hundreds of characters apart here) has no
        // slot for without a framework change well past this round's scope
        // (Codex, PR #874 round 40 thread 2 follow-up; confirmed by
        // temporarily removing this guard -- census went from 0 to 2
        // unlisted, both this same already-tracked SpotRow.tsx site).
        const nestedBody = findNestedFunctionBodyRange(source, valueStart, end);
        if (nestedBody && !JSX_OPENING_TAG_RE.test(source.slice(nestedBody.start, nestedBody.end))) {
          scanRange(nestedBody.start, nestedBody.end);
        }
        const initializerText = source.slice(valueStart, end);
        const bodies = extractLiteralBodies(initializerText);
        // An initializer with no quoted literal of its own -- an identifier-only
        // (or identifier-plus-literal) alias, `const classes = pulse;`/`const
        // classes = cn(pulse, "text-xs");`/`const classes = STYLES.alert;` --
        // used to make a `const` "not class-shaped" and drop it here entirely,
        // so `classes` was invisible to `visibleDecl` no matter what `pulse`
        // resolved to. Never dropped now: the identifiers/member-access chains
        // its initializer references are folded into `literal` alongside any
        // literal bodies it does have, so the existing recursive
        // `resolveConstRefs`/`resolveMemberAccess` walk resolves them exactly
        // like any other reference (including a cyclic one, via its own
        // visited-set guard) once this decl is looked up (Codex, PR #874
        // round 29).
        // Skipped for an object-literal initializer (`firstChar === "{"`):
        // `extractObjectEntries` already models it precisely, per key -- a bare
        // scan for identifier-shaped tokens over its raw text would misread its
        // own unquoted *key names* (`label`, `bg`, `pulse: true`) as if they
        // were value references, polluting the fail-closed top-level `literal`
        // with noise that was never a reference to anything (Codex, PR #874
        // round 29).
        const refs = firstChar === "{" ? [] : extractIdentifierRefs(initializerText);
        const objectResult = firstChar === "{" ? extractObjectEntries(initializerText) : undefined;
        const entries = objectResult?.entries;
        const literal = [bodies.join(" "), refs.join(" ")].filter(Boolean).join(" ");
        const declObj: ConstDecl = {
          name,
          index: nameIndex,
          literal,
          entries,
          scopeStart,
          scopeEnd,
        };
        decls.push(declObj);
        if (kind !== "const") reassignQueue.push({ decl: declObj, searchStart: end });
        if (objectResult && objectResult.spreads.length > 0) {
          spreadQueue.push({ decl: declObj, order: objectResult.order });
        }
        pos = end;
      }
      // A depth-0 comma continues to the next declarator in this same
      // declaration; anything else (a `;`, the end of the source, or an
      // unrecognized declarator shape already handled by `break` above)
      // ends it.
      while (pos < source.length && /\s/.test(source[pos])) pos++;
      if (source[pos] === ",") {
        pos++;
        while (pos < source.length && /\s/.test(source[pos])) pos++;
        continue;
      }
      break;
    }
      keywordRe.lastIndex = pos;
    }
  }
  scanRange(0, source.length);
  for (const { decl, searchStart } of reassignQueue) {
    const reassigned = collectReassignedLiteralBodies(source, decl, decls, searchStart, decl.scopeEnd);
    const reassignedRefs = collectReassignedIdentifierRefs(source, decl, decls, searchStart, decl.scopeEnd);
    if (reassigned.length > 0 || reassignedRefs.length > 0) {
      decl.literal = [decl.literal, reassigned.join(" "), reassignedRefs.join(" ")].filter(Boolean).join(" ");
    }
  }
  // A spread's source, once resolved, contributes its own entries to the
  // spreading object at the exact point it appears in `order` -- a
  // *resolvable* spread overwrites every key it carries (later wins, same as
  // a repeated named key would), so `{ safe: "text-green", ...base }`
  // correctly ends up with `base.safe` (Codex, PR #874 round 34; round 32's
  // "an explicit key always wins" rule only ever held for a spread coming
  // FIRST, which is why every one of round 32's own fixtures still passes
  // here). An *unresolvable* spread (an expression, a call, a name with no
  // visible declaration, or one with no `entries` of its own) contributes
  // nothing precise, but fails closed on every key set so far: those keys go
  // into `openKeys` and get their precise entry replaced below with the
  // object's own flattened `literal` (which already reached every key's text
  // regardless of `entries`, independent of this loop) -- an unresolvable
  // spread could, for all this scanner knows, itself carry `animate-pulse`
  // and overwrite any of them. A key (re)defined AFTER an unresolvable
  // spread is unaffected -- nothing has overwritten it yet -- and any key
  // that later gets a fresh named entry or a resolvable spread's value is
  // removed from `openKeys` again, since it's now precisely known past that
  // point.
  //
  // `visibleDecl` is looked up against `decls` PLUS `importedDecls` here --
  // not `decls` alone -- so `const styles = { safe: "text-green", ...base
  // };` where `base` only exists as an IMPORTED binding (never declared
  // locally) can still resolve the spread instead of falling into the
  // unresolvable-spread `openKeys` fallback just because of where its own
  // declaration happens to live (Codex, PR #874 round 36). `importedDecls`
  // are never added to `decls` itself -- they're module-scope
  // (`scopeStart: 0, scopeEnd: source.length`) placeholders the caller
  // already appends to its own final `constMap` separately, so adding them
  // here too would only risk a duplicate, not a new resolution.
  const declsWithImports = importedDecls.length > 0 ? [...decls, ...importedDecls] : decls;
  for (const { decl, order } of spreadQueue) {
    const entries = new Map<string, ConstEntry>();
    const openKeys = new Set<string>();
    for (const op of order) {
      if (op.kind === "entry") {
        entries.set(op.key, op.entry);
        openKeys.delete(op.key);
        continue;
      }
      const spreadDecl = visibleDecl(declsWithImports, op.name, decl.index);
      if (spreadDecl?.entries) {
        for (const [key, value] of spreadDecl.entries) {
          entries.set(key, value);
          openKeys.delete(key);
        }
      } else {
        for (const key of entries.keys()) openKeys.add(key);
      }
    }
    for (const key of openKeys) {
      const existing = entries.get(key);
      entries.set(key, { literal: decl.literal, entries: existing?.entries });
    }
    decl.entries = entries;
  }
  // A nested object literal's own spread(s) -- `{ a: { safe: "text-green",
  // ...base } }` -- couldn't be resolved inside `extractObjectEntries` itself
  // (no `decls`/scope access there), so each nested `ConstEntry` that has one
  // carries its raw `spreadOrder` up to here instead. Walked for every
  // top-level declaration now that `spreadQueue` above has finished (a
  // nested spread's source name is always a plain identifier, so it can only
  // ever resolve to a top-level/imported declaration, never to another
  // nested key -- by the time this runs, every such declaration's own
  // top-level `entries` are already final). Fails closed the same way
  // `spreadQueue` does, just scoped to that nested object's own flattened
  // `literal` instead of the whole declaration's -- an unresolvable spread
  // inside `{ a: { ...unknown } }` only clouds `a`'s own open keys, never a
  // sibling key at the parent level (Codex, PR #874 round 36b).
  for (const decl of decls) {
    resolveNestedEntrySpreads(decl.entries, declsWithImports, decl.index);
  }
  // Runs after `spreadQueue` so a destructuring source that is itself a
  // spread-merged object (`const styles = { ...base }; const { alert } =
  // styles;`) already has its final, merged `entries` by the time it's
  // resolved here (Codex, PR #874 round 35). Also resolved against
  // `declsWithImports`, same reasoning as the spread merge just above --
  // `const { alert } = STYLES;` where `STYLES` is only an imported binding
  // (Codex, PR #874 round 36).
  for (const { pattern, sourceName, scopeStart, scopeEnd, index } of destructureQueue) {
    const sourceDecl = visibleDecl(declsWithImports, sourceName, index);
    if (!sourceDecl) continue;
    registerDestructuringBindings(
      parseDestructuringPattern(pattern),
      sourceDecl.entries,
      sourceDecl.literal,
      scopeStart,
      scopeEnd,
      index,
      decls,
    );
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
 * hyphenated Tailwind token (`text-red`) is never mistaken for one. Also
 * excludes a preceding `.` or `]` -- a property name in a member-access
 * chain (`styles.pulse`, `styles?.pulse` via its trailing `.`, `arr[0].pulse`)
 * is never itself a candidate base identifier, even when the chain it's
 * part of fails to resolve: before this exclusion, a chain that failed to
 * narrow (`styles.alert` where `styles` has no `alert` key) left the tail
 * name for THIS SAME regex to re-match on its own next iteration, letting
 * `alert` resolve against a completely unrelated top-level `const alert =
 * "animate-pulse"` elsewhere in the file -- a false positive, and (in the
 * opposite direction) what made several round 37 shorthand fixtures pass
 * even against the unfixed parser, coincidentally, for the wrong reason
 * (Codex, PR #874 round 37b). */
const BASE_IDENT_RE = /(?<![\w$.\]-])[A-Za-z_$][\w$]*/g;

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

/** True when the `(` at `source[openIndex]` is a plain grouping paren rather
 * than a call's own argument-list opener -- i.e. the character immediately
 * before it is not an identifier/`$`/`)`/`]` character, so `foo(styles)`
 * (a call) is distinguished from `(styles)` or `return (styles)` (a
 * redundant grouping around a bare reference). Used only to decide whether
 * `resolveMemberAccess` may treat a `)` right after a resolved identifier as
 * transparent and keep walking a chain that continues past it, e.g.
 * `(styles).safe` -- never for `cn(styles).safe`, where the `.safe` binds to
 * `cn`'s return value, not to `styles` (Codex, PR #874 round 41 thread 1). */
function isGroupingOpenParen(source: string, openIndex: number): boolean {
  const prev = source[openIndex - 1];
  return prev === undefined || !/[\w$)\]]/.test(prev);
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
 * pass, same as an identifier with no accessor at all.
 *
 * Each step also tolerates the syntax a real TSX file can put between two
 * chain segments without changing what's being navigated: a TypeScript
 * non-null assertion (`styles!.safe`, `styles!["safe"]`, mixed forms like
 * `a?.b!.c`) is a type-only annotation with no runtime effect, and optional
 * chaining (`styles?.safe`, `styles?.["safe"]`) still reads the same
 * property when the base is non-nullish -- both are read the same as their
 * unguarded counterparts here, since this walk only cares about which
 * entries a reference could statically point to, not runtime nullishness. A
 * single grouping paren directly around the base identifier (`(styles).safe`)
 * is unwrapped via `isGroupingOpenParen` so the chain that follows it is
 * still recognized (Codex, PR #874 round 41 thread 1 -- before this, none of
 * `?.`, `!`, or a wrapping `(...)` was recognized as a chain continuation, so
 * the walk gave up immediately and left the base identifier for
 * `resolveConstRefs`'s generic bare-identifier fallback, which resolves the
 * WHOLE object's flattened literal instead of the one precise key -- a false
 * positive whenever an unrelated sibling key on the same object pulses). */
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

    // A grouping paren directly wrapping the base identifier is transparent
    // to the chain that follows it -- unwrap one level so the walk below
    // sees the same continuation it already knows how to read past a bare
    // identifier.
    if (raw[chainEnd] === ")" && raw[start - 1] === "(" && isGroupingOpenParen(raw, start - 1)) {
      chainEnd += 1;
    }

    while (true) {
      let pos = chainEnd;
      // A non-null assertion has no runtime effect on what's being
      // navigated -- skip it before looking for the next real segment.
      if (raw[pos] === "!") pos += 1;

      let dotStart = -1;
      let bracketStart = -1;
      if (raw[pos] === "?" && raw[pos + 1] === ".") {
        pos += 2;
        if (raw[pos] === "[") bracketStart = pos;
        else dotStart = pos;
      } else if (raw[pos] === ".") {
        dotStart = pos + 1;
      } else if (raw[pos] === "[") {
        bracketStart = pos;
      } else {
        break;
      }

      if (bracketStart !== -1) {
        const closeIdx = findBracketClose(raw, bracketStart);
        if (closeIdx === -1) break;
        const inner = raw.slice(bracketStart + 1, closeIdx);
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

      const keyMatch = /^[A-Za-z_$][\w$]*/.exec(raw.slice(dotStart));
      if (!keyMatch) break;
      const key = keyMatch[0];
      const narrowed = candidates
        .map((cand) => cand.entries?.get(key))
        .filter((c): c is ConstEntry => c !== undefined);
      if (narrowed.length === 0) break;
      candidates = narrowed;
      chainEnd = dotStart + key.length;
      matchedChain = true;
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
 * string-initialised const. The same `.`/`]` exclusion `BASE_IDENT_RE` now
 * carries is repeated here (this is a separate regex, not that constant):
 * `resolveMemberAccess` leaves a member-access chain that failed to narrow
 * as literal, untouched raw text (`styles.alert`, whole) rather than
 * consuming any of it, and this pass runs over that leftover text next --
 * without the exclusion it would treat the trailing property name as its
 * own unrelated bare identifier and resolve IT instead, the same false
 * positive `BASE_IDENT_RE`'s own doc explains (Codex, PR #874 round 37b).
 * The property name is left exactly as `visibleDecl`-miss already leaves
 * any other unresolvable identifier elsewhere in this function -- unchanged
 * raw text, which is this file's one fail-closed convention for "no idea
 * what this refers to" (never a deletion, never a placeholder). */
function resolveConstRefs(
  raw: string,
  decls: ConstDecl[],
  atIndex: number,
  seen: ReadonlySet<string> = new Set(),
): string {
  if (decls.length === 0 || seen.size > 8) return raw;
  const withMembers = resolveMemberAccess(raw, decls, atIndex, seen);
  return withMembers.replace(/(?<![\w$.\]-])[A-Za-z_$][\w$]*(?![\w$-])/g, (id) => {
    if (seen.has(id)) return id;
    const decl = visibleDecl(decls, id, atIndex);
    if (!decl) return id;
    return resolveConstRefs(decl.literal, decls, decl.index, new Set([...seen, id]));
  });
}

/** Backward counterpart to `extractBalanced`'s own quote/template handling:
 * when `source[j]` is a quote character (`"`, `'`, or a template backtick),
 * the index to resume a backward scan from -- one before the span's opening
 * delimiter -- so a `{`/`}`/`>` character inside a quoted value is never
 * mistaken for real structure by a backward walk. Treats a whole
 * backtick-delimited span as one opaque unit, same as `extractBalanced`
 * does forward (neither dives into a template's own `${...}` interpolation).
 * No escape-sequence awareness, matching the pre-existing quoted-attribute-
 * *value* skip this now shares a helper with. Returns `-1` when the span's
 * opening delimiter can't be found (malformed input) (Codex, PR #874
 * round 30). */
function skipQuotedSpanBackward(source: string, j: number): number {
  const openQuote = source.lastIndexOf(source[j], j - 1);
  return openQuote === -1 ? -1 : openQuote - 1;
}

/** Backward counterpart to `extractBalanced`: the index of the `{` matching
 * the `}` at `closeIndex`, skipping quoted/template spans via
 * `skipQuotedSpanBackward` so a brace character inside one -- an earlier
 * attribute's own `{...}` expression containing a quoted `"}"`, e.g.
 * `title={"}"}` -- is never miscounted as real tag structure (Codex, PR
 * #874 round 30: this used to be a plain, quote-blind depth count, which
 * returned an unmatched depth -- and so `null` from `findOpeningTag` --
 * for exactly that shape). Returns `-1` when no matching open brace is
 * found. */
function findMatchingOpenBraceBackward(source: string, closeIndex: number): number {
  let depth = 0;
  let j = closeIndex;
  while (j >= 0) {
    const c = source[j];
    if (c === '"' || c === "'" || c === "`") {
      const resume = skipQuotedSpanBackward(source, j);
      if (resume === -1) return -1;
      j = resume;
      continue;
    }
    if (c === "}") {
      depth++;
    } else if (c === "{") {
      depth--;
      if (depth === 0) return j;
    }
    j--;
  }
  return -1;
}

/** Backward counterpart to `extractBalanced`, but for `(`/`)` instead of
 * `{`/`}`, sharing the same quote/template-aware backward skip: the index
 * of the `(` matching the `)` at `closeIndex`, or `-1` if none is found.
 * Used only to find a function/method/control-flow parameter list's own
 * opening paren, so what comes immediately before IT (a name, the
 * `function` keyword, or a control-flow keyword like `if`) can decide
 * whether a `{` that follows is a function's own body (Codex, PR #874
 * round 32). */
function findMatchingOpenParenBackward(source: string, closeIndex: number): number {
  let depth = 0;
  let j = closeIndex;
  while (j >= 0) {
    const c = source[j];
    if (c === '"' || c === "'" || c === "`") {
      const resume = skipQuotedSpanBackward(source, j);
      if (resume === -1) return -1;
      j = resume;
      continue;
    }
    if (c === ")") {
      depth++;
    } else if (c === "(") {
      depth--;
      if (depth === 0) return j;
    }
    j--;
  }
  return -1;
}

/** Control-flow keywords whose own `(...)  {` looks exactly like a function
 * signature followed by its body but isn't one -- `if (x) {`, `for (...) {`,
 * `catch (e) {` -- so `isFunctionBodyOpenBrace` never mistakes one for a
 * function/method definition (Codex, PR #874 round 32). */
const CONTROL_FLOW_KEYWORDS_BEFORE_PAREN = new Set(["if", "for", "while", "switch", "catch", "with"]);

/** Given the index of a character that MIGHT be the last character of a
 * TypeScript return-type annotation (`function f(): <this> {`), walks
 * backward over it -- an identifier/dotted chain (`JSX.Element`), a generic
 * `<...>` (`Promise<Array<string>>`), an array suffix `[]`, a union `|` /
 * intersection `&`, a parenthesised or function-type `(...)`, an object-type
 * literal `{...}`, and a quoted/template literal type -- tracking depth over
 * `()[]{}<>` (so anything nested, including its own colons and commas, is
 * skipped whole rather than confused with the annotation's own leading
 * colon) and over quoted spans via `skipQuotedSpanBackward`. Returns the
 * index of that leading `:` once depth returns to 0 there, or `null` the
 * moment a character that isn't part of any of those shapes is reached (an
 * unmatched opener, or punctuation no type annotation this scanner models
 * can contain -- e.g. a return type that is itself a function type,
 * `(): (x: number) => void {`, isn't recognized: its own `=>` isn't inside
 * any bracket this scanner tracks, so the walk fails closed there rather
 * than guessing). A `null` here only ever means `isFunctionBodyOpenBrace`
 * falls through to its prior "not a function body" result -- never a new
 * false positive, only a possible remaining false negative for a return-type
 * shape this doesn't model (Codex, PR #874 round 40 thread 2). */
function findReturnTypeColonBackward(source: string, fromIndex: number): number | null {
  let i = fromIndex;
  let depth = 0;
  while (i >= 0) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const resume = skipQuotedSpanBackward(source, i);
      if (resume === -1) return null;
      i = resume;
      continue;
    }
    if (c === ")" || c === "]" || c === "}" || c === ">") {
      depth++;
      i--;
      continue;
    }
    if (c === "(" || c === "[" || c === "{" || c === "<") {
      if (depth === 0) return null; // an unmatched opener -- not a real type
      depth--;
      i--;
      continue;
    }
    if (depth > 0) {
      i--; // inside a balanced group -- any character is part of the type
      continue;
    }
    if (c === ":") return i;
    if (/[\s\w$.|&?]/.test(c)) {
      i--;
      continue;
    }
    return null; // not a character this scanner recognizes as part of a type
  }
  return null;
}

/** Whether the `{` at `openBraceIndex` in `source` opens a real JS FUNCTION
 * body -- `function name(...) {`, an anonymous `function (...) {`, a method
 * shorthand `name(...) {` in a class or object literal, or an arrow
 * function's block body (`(...) => {` / a single unparenthesized param,
 * `x => {`) -- as opposed to any other `{` (an `if`/`for`/`while`/`try`/
 * `catch`/`switch` block, a bare `{...}` block, an object/array literal's
 * own braces). `var` (unlike `let`/`const`) has real function scope in JS,
 * not block scope, so a `var` declaration's own enclosing scope has to walk
 * outward past every non-function block to find this (Codex, PR #874
 * round 32).
 *
 * An arrow's block body always ends in a literal `=>` immediately before
 * the `{` regardless of whether its parameter is parenthesized OR has its
 * own TypeScript return-type annotation (`(): JSX.Element => {`) -- the
 * `=>` itself is unaffected either way, so this case is checked first and
 * needs no paren-matching, return-type-skipping, or `async` handling at all
 * (an `async` keyword sits further back still, outside anything this
 * function ever looks at). Otherwise, the `{` must be immediately preceded
 * (past whitespace) by a `)` -- a function/method signature's parameter list
 * just closed, or a control-flow construct's condition did -- whose OWN
 * matching `(` is in turn immediately preceded by an identifier: the
 * function/method's name, the bare `function` keyword (an anonymous
 * function expression, `async` or not -- same reasoning as the arrow case),
 * or a control-flow keyword to exclude. A TypeScript return-type annotation
 * between the parameter list's `)` and the body's `{` (`function f(): void
 * {`) -- previously not handled at all, so `findEnclosingFunctionScope`
 * assigned a `var` inside such a function to the OUTER scope instead,
 * exactly the shape a typed inner helper component (`function
 * Inner(): JSX.Element { var pulse = "…"; ... }`) hits -- is skipped via
 * `findReturnTypeColonBackward`, re-anchoring `j` on the annotation's own
 * preceding `)` so every check below runs exactly as if the annotation had
 * never been there (Codex, PR #874 round 40 thread 2). */
function isFunctionBodyOpenBrace(source: string, openBraceIndex: number): boolean {
  let j = openBraceIndex - 1;
  while (j >= 0 && /\s/.test(source[j])) j--;
  if (j < 0) return false;
  if (source[j] === ">" && source[j - 1] === "=") return true; // arrow: `=> {`
  if (source[j] !== ")") {
    const colonIndex = findReturnTypeColonBackward(source, j);
    if (colonIndex === null) return false;
    let k = colonIndex - 1;
    while (k >= 0 && /\s/.test(source[k])) k--;
    if (k < 0 || source[k] !== ")") return false;
    j = k;
  }
  const openParen = findMatchingOpenParenBackward(source, j);
  if (openParen === -1) return false;
  let k = openParen - 1;
  while (k >= 0 && /\s/.test(source[k])) k--;
  if (k < 0) return false;
  const idEnd = k + 1;
  let idStart = k;
  while (idStart >= 0 && /[A-Za-z0-9_$]/.test(source[idStart])) idStart--;
  idStart++;
  if (idStart >= idEnd) return false; // nothing identifier-shaped right before '('
  const token = source.slice(idStart, idEnd);
  return !CONTROL_FLOW_KEYWORDS_BEFORE_PAREN.has(token);
}

/** The nearest enclosing FUNCTION body's brace range containing `index` in
 * `source`, walking outward through every non-function block
 * (`if`/`for`/`while`/`try`/`catch`/`switch`, a bare `{...}` block) via
 * repeated `findEnclosingBraceRange` calls until `isFunctionBodyOpenBrace`
 * says the innermost-so-far `{` really opens a function. Returns `null`
 * when no enclosing function body exists at all -- `index` sits at, or only
 * inside non-function blocks all the way up to, module/top-level scope --
 * the same "no scope restriction" result `collectConstTemplateMap` already
 * falls back to whole-source for. Only ever used for a `var` declaration's
 * own scope; `let`/`const` keep the innermost block exactly as before
 * (Codex, PR #874 round 32). */
function findEnclosingFunctionScope(source: string, index: number): { start: number; end: number } | null {
  let range = findEnclosingBraceRange(source, index);
  while (range) {
    if (isFunctionBodyOpenBrace(source, range.start)) return range;
    range = findEnclosingBraceRange(source, range.start - 1);
  }
  return null;
}

/** The opening tag an attribute at `before` belongs to, found by walking
 * backwards structurally: `{…}` attribute expressions are skipped as
 * blocks (quote/template-aware, so a brace character quoted inside one
 * never miscounts the depth -- Codex, PR #874 round 30), a quoted attribute
 * value is skipped whole (so a `>` inside it, e.g. `title="1 > 0"`, is
 * never mistaken for a tag boundary -- Codex, PR #874 round 14), a `>`
 * outside them (other than an arrow's `=>`) means the attribute is not
 * inside a tag, and the first `<Tag` reached is the element. No fixed-width
 * window, so verbose prop lists cannot push the tag out of reach (Codex, PR
 * #874 round 13). */
function findOpeningTag(source: string, before: number): { tag: string; index: number } | null {
  let i = before - 1;
  while (i >= 0) {
    const c = source[i];
    if (c === "}") {
      const openIdx = findMatchingOpenBraceBackward(source, i);
      if (openIdx === -1) return null;
      i = openIdx - 1;
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

/** The START of a `{...<expr>}` spread attribute -- just the `{`, whitespace,
 * and `...`, with no assumption at all about what the spread expression
 * itself looks like. Used so `findClassNameSites` can resolve a JSX opening
 * tag's className through an object spread (`const props = { className:
 * "text-alert-red animate-pulse" }; <span {...props}>Critical</span>`) in the
 * same attribute-order pass that also collects a literal `className=` (Codex,
 * PR #874 round 38 thread 1; round 39 folds this into ONE ordered pass with
 * `className=` instead of two independent ones; round 40 thread 1 widens this
 * from an identifier/dotted-chain-only match to any expression at all --
 * `{...getProps()}`, `{...{ className: "…" }}` -- since the ONLY thing this
 * regex itself needs to find is where a spread starts, not what's inside it.
 * The actual expression, from just after `...` to this spread's own matching
 * `}` (found the same brace/quote-aware way `findTagEnd` finds a tag's own
 * end), is classified separately by `classifySpreadExpression`. A spread
 * mixed with other content in the same braces isn't valid JSX attribute
 * syntax anyway, and a spread that's part of some larger expression -- nested
 * inside an already-matched attribute's own value, e.g.
 * `className={someFn({...base})}` or `style={{...vars}}` -- is filtered out
 * downstream by `isTopLevelAttributePosition`, not by this regex. */
const SPREAD_ATTR_START_RE = /\{\s*\.\.\.\s*/g;

/** Resolves the `className` value of an INLINE JSX spread object literal
 * (`{...{ className: "…" }}`, `{...{ ...base, className: "…" }}`) the exact
 * same way a `const styles = { ... }` declaration's own `className` key
 * already resolves: `extractObjectEntries` for the key/value shapes, then
 * `resolveNestedEntrySpreads`'s existing, already-tested spread-replay logic
 * for any spread(s) inside the literal (a resolvable spread's own keys
 * overwrite everything before them, last wins; an unresolvable one fails
 * closed onto the whole literal's own flattened text) -- wrapped in a
 * throwaway single-entry map purely so this reuses that exact replay code
 * instead of duplicating `collectConstTemplateMap`'s own `spreadQueue` loop
 * (Codex, PR #874 round 40 thread 1). Falls back to the object's whole
 * flattened literal when there's no explicit `className` key at all, the
 * same "resolvable but imprecise" convention every other object-valued
 * reference in this file already uses. Also reports whether the resolved
 * object actually has a `className` key of its own at all
 * (`resolved.entries?.has("className")`) -- KEY PRESENCE, not whether its
 * value resolves to any usable class text: `{ className: undefined }`,
 * `{ className: null }`, and `{ className: cond ? a : b }` (where neither
 * branch is readable) all still register the key in `entries` (with an
 * empty `literal` when nothing readable was found), since `className:
 * undefined` genuinely clears `className` at runtime and really does
 * override an earlier source -- only a spread whose resolved object never
 * wrote the key AT ALL (`{ title: "status" }`) leaves the earlier source in
 * force (Codex, PR #874 round 43 thread 1, correcting round 42 thread 1's
 * own `{ className: undefined }` handling -- Codex was right that it had
 * this backwards: presence of the key overrides regardless of value
 * readability, and only true absence doesn't). */
function resolveInlineObjectClassName(
  objectText: string,
  constMap: ConstDecl[],
  atIndex: number,
): { raw: string; suppliesClassName: boolean } {
  const { entries, spreads, order } = extractObjectEntries(objectText);
  const literal = extractLiteralBodies(objectText).join(" ");
  const wrapper = new Map<string, ConstEntry>([
    [
      "__inlineSpread__",
      { literal, entries: entries.size > 0 ? entries : undefined, spreadOrder: spreads.length > 0 ? order : undefined },
    ],
  ]);
  resolveNestedEntrySpreads(wrapper, constMap, atIndex);
  const resolved = wrapper.get("__inlineSpread__")!;
  const classNameEntry = resolved.entries?.get("className");
  return {
    raw: resolveConstRefs(classNameEntry?.literal ?? resolved.literal, constMap, atIndex),
    suppliesClassName: resolved.entries?.has("className") ?? false,
  };
}

/** Splits `text` at its outermost `? :` ternary, if it has one at depth 0
 * (i.e. not nested inside `(...)`/`[...]`/`{...}` and not inside a quoted or
 * template string) -- `null` otherwise. A `?` immediately followed by `.` or
 * another `?` is optional-chaining/nullish-coalescing syntax, never a
 * ternary, and is skipped as a two-character unit rather than counted. Every
 * other top-level `?` opens one level of "still looking for this ternary's
 * own `:`" (`qDepth`); the `:` that brings `qDepth` back to zero is the
 * outermost ternary's own divider between its true- and false-branches --
 * this single left-to-right counter handles both a nested ternary written in
 * the true-branch (`a ? b ? x : y : z`, real JS grammar: the true-branch
 * greedily consumes the nested ternary, so the outer split lands on the
 * SECOND `:`) and one chained in the false-branch (`a ? b : c ? d : e`,
 * right-associative: the split lands on the FIRST `:`, leaving `c ? d : e`
 * for a caller's own recursive call to split again) without needing to know
 * which shape it's looking at up front (Codex, PR #874 round 43 thread 2). */
function splitTopLevelTernary(text: string): { ifTrue: string; ifFalse: string } | null {
  let depth = 0;
  let qDepth = 0;
  let firstQIndex = -1;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "`") {
      i += extractTemplateLiteral(text, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c === "?") {
      if (text[i + 1] === "." || text[i + 1] === "?") {
        i += 2;
        continue;
      }
      if (qDepth === 0) firstQIndex = i;
      qDepth++;
      i++;
      continue;
    }
    if (depth === 0 && c === ":" && qDepth > 0) {
      qDepth--;
      if (qDepth === 0) {
        return { ifTrue: text.slice(firstQIndex + 1, i).trim(), ifFalse: text.slice(i + 1).trim() };
      }
      i++;
      continue;
    }
    i++;
  }
  return null;
}

/** Splits `text` at its first top-level `&&`, `||`, or `??` (depth-0, outside
 * quoted/template strings), if it has one -- `null` otherwise. Only the
 * leftmost top-level occurrence is used; this file's fixtures only ever pair
 * two operands, so a full-precedence multi-operator parse isn't needed
 * (Codex, PR #874 round 43 thread 2). */
function splitTopLevelLogical(text: string): { left: string; right: string; op: "&&" | "||" | "??" } | null {
  let depth = 0;
  let i = 0;
  while (i < text.length - 1) {
    const c = text[i];
    if (c === "`") {
      i += extractTemplateLiteral(text, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = text.indexOf(c, i + 1);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      i++;
      continue;
    }
    if (depth === 0) {
      const two = text.slice(i, i + 2);
      if (two === "&&" || two === "||" || two === "??") {
        return { left: text.slice(0, i).trim(), right: text.slice(i + 2).trim(), op: two };
      }
    }
    i++;
  }
  return null;
}

/** Classifies one spread attribute's own expression text (everything between
 * its `...` and its matching `}`), or one branch of a conditional/logical
 * spread expression recursed into by this same function, into a resolved-or-
 * fail-closed raw class string plus two signals, for `collectSpreadClassSources`
 * and `classifySpreadExpression` (Codex, PR #874 round 40 thread 1; round 43
 * thread 2 adds the conditional/logical recursion):
 * - A parenthesised grouping (`(active ? a : b)`) -- unwrapped one layer and
 *   recursed into.
 * - A top-level ternary (`cond ? a : b`, plain or nested either branch) --
 *   both branches recursed into and UNIONED: either branch supplying
 *   `className` makes the whole expression supply it (a real render can take
 *   either branch, so the census check has to cover both), and the `raw` text
 *   is both branches' own raw text space-joined so a `PULSE_CLASS_RE` (or
 *   contrast) check downstream sees whichever branch actually carries
 *   `animate-pulse`. Both branches must themselves resolve (`resolvable:
 *   true`) or the whole ternary fails closed as unresolvable, same direction
 *   as every other "can't rule this out, don't guess" case in this file.
 * - A top-level `||`/`??` (`a || b`, `obj ?? fallback`) -- same union-both-
 *   sides treatment as a ternary: either operand could be the one that's
 *   actually spread at runtime (a fallback pattern), so both must resolve.
 * - A top-level `&&` (`cond && obj`) -- NOT symmetric: the left operand is
 *   JS's own boolean-guard idiom (`{...(isActive && activeProps)}`), and
 *   spreading a falsy primitive (`{...false}`) is a real, valid no-op in JS,
 *   never a `className` supplier -- so only the RIGHT operand needs to
 *   resolve; the left is always treated as "resolves, supplies nothing"
 *   without requiring it to look like a class source at all (a literal
 *   boolean/comparison/prop-guard on the left is expected, not a fail-closed
 *   case).
 * - An identifier or dotted member chain (`props`, `styles.alert`) -- the
 *   existing round-38/39 path: resolved through `.className` member access
 *   when the base has a visible declaration, left as its own raw (inert)
 *   text otherwise.
 * - An inline object literal that is the expression's ENTIRE content
 *   (`{ className: "…" }`, `{ ...base, className: "…" }`) -- resolved via
 *   `resolveInlineObjectClassName`; always `resolvable: true`, since an
 *   object literal's own shape is fully known either way.
 * - Anything else at all (a call expression `getProps()`, a template
 *   literal, ...) -- this scanner has no model for what such an expression
 *   evaluates to, so it fails closed exactly like an unresolvable identifier
 *   already does: left as its own raw, unresolved text, which contributes
 *   nothing new rather than fabricating a violation (round 38 thread 1's own
 *   "no idea what this refers to" convention); `resolvable: false`.
 *
 * `suppliesClassName` is `findClassNameSites`'s "a spread only overrides when
 * it actually supplies `className`" signal (Codex, PR #874 round 42 thread
 * 1) -- KEY PRESENCE in the resolved object, not whether its value resolves
 * to usable class text (round 43 thread 1 correction: `resolveInlineObjectClassName`
 * and `extractObjectEntries` now register a `className` key even when its
 * value is `undefined`/`null`/otherwise unreadable, since that's still a real
 * override at runtime). `resolvable` is this function's own recursion signal
 * (not part of `classifySpreadExpression`'s public return shape) -- `false`
 * for the base case this scanner truly can't see into at all (an
 * unresolvable identifier base, the catch-all branch), so a conditional/
 * logical expression built out of it fails closed as a whole instead of
 * guessing. */
function classifyBranchExpression(
  exprText: string,
  constMap: ConstDecl[],
  atIndex: number,
): { raw: string; suppliesClassName: boolean; resolvable: boolean } {
  const trimmed = exprText.trim();

  if (trimmed.startsWith("(")) {
    const { endIndex } = extractBalanced(trimmed, 0, "(", ")");
    if (endIndex === trimmed.length - 1) {
      return classifyBranchExpression(trimmed.slice(1, -1), constMap, atIndex);
    }
  }

  const ternary = splitTopLevelTernary(trimmed);
  if (ternary) {
    const ifTrue = classifyBranchExpression(ternary.ifTrue, constMap, atIndex);
    const ifFalse = classifyBranchExpression(ternary.ifFalse, constMap, atIndex);
    if (!ifTrue.resolvable || !ifFalse.resolvable) {
      return { raw: trimmed, suppliesClassName: false, resolvable: false };
    }
    return {
      raw: [ifTrue.raw, ifFalse.raw].filter(Boolean).join(" "),
      suppliesClassName: ifTrue.suppliesClassName || ifFalse.suppliesClassName,
      resolvable: true,
    };
  }

  const logical = splitTopLevelLogical(trimmed);
  if (logical) {
    const right = classifyBranchExpression(logical.right, constMap, atIndex);
    if (logical.op === "&&") {
      // The left operand is a boolean guard, not a candidate className
      // source -- spreading its falsy value is a real, inert no-op in JS,
      // so it never needs to resolve for the expression as a whole to.
      if (!right.resolvable) return { raw: trimmed, suppliesClassName: false, resolvable: false };
      return { raw: right.raw, suppliesClassName: right.suppliesClassName, resolvable: true };
    }
    const left = classifyBranchExpression(logical.left, constMap, atIndex);
    if (!left.resolvable || !right.resolvable) {
      return { raw: trimmed, suppliesClassName: false, resolvable: false };
    }
    return {
      raw: [left.raw, right.raw].filter(Boolean).join(" "),
      suppliesClassName: left.suppliesClassName || right.suppliesClassName,
      resolvable: true,
    };
  }

  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
    const segments = trimmed.split(".");
    const baseName = segments[0];
    const decl = visibleDecl(constMap, baseName, atIndex);
    if (!decl) return { raw: trimmed, suppliesClassName: false, resolvable: false };
    let candidates: ConstEntry[] | null = [{ literal: decl.literal, entries: decl.entries }];
    for (const seg of segments.slice(1)) {
      const narrowed: ConstEntry[] = candidates!
        .map((c) => c.entries?.get(seg))
        .filter((c): c is ConstEntry => c !== undefined);
      candidates = narrowed.length > 0 ? narrowed : null;
      if (!candidates) break;
    }
    const suppliesClassName = candidates !== null && candidates.some((c) => c.entries?.has("className"));
    return { raw: resolveConstRefs(`${trimmed}.className`, constMap, atIndex), suppliesClassName, resolvable: true };
  }
  if (trimmed.startsWith("{")) {
    const { endIndex } = extractBalanced(trimmed, 0, "{", "}");
    if (endIndex === trimmed.length - 1) {
      return { ...resolveInlineObjectClassName(trimmed, constMap, atIndex), resolvable: true };
    }
  }
  return { raw: trimmed, suppliesClassName: false, resolvable: false };
}

/** Public entry point `collectSpreadClassSources` calls for one spread
 * attribute's own expression text -- thin wrapper over
 * `classifyBranchExpression` that collapses its `resolvable: false` case down
 * to this function's original two-field wire shape (`raw` left as the whole
 * expression's own inert trimmed text, `suppliesClassName: false`), same as
 * every caller already expects (Codex, PR #874 round 43 thread 2). */
function classifySpreadExpression(
  exprText: string,
  constMap: ConstDecl[],
  atIndex: number,
): { raw: string; suppliesClassName: boolean } {
  const result = classifyBranchExpression(exprText, constMap, atIndex);
  if (!result.resolvable) return { raw: exprText.trim(), suppliesClassName: false };
  return { raw: result.raw, suppliesClassName: result.suppliesClassName };
}

/** True when `index` is the exact start of a top-level attribute of the tag
 * starting at `tagStart` -- a position a forward attribute-by-attribute walk
 * lands ON, not one buried INSIDE a previous attribute's own `{...}`/quoted
 * value. Walks forward the same way `findTagEnd` does (a `{` is skipped
 * whole via `extractBalanced`, a quoted value skipped to its closing quote,
 * anything else one character at a time), but checks position equality at
 * each attribute boundary instead of only looking for the tag's own `>` --
 * so a spread nested inside another attribute's already-matched value
 * (`className={someFn({...base})}`, `style={{...vars}}`) is never mistaken
 * for its own separate, top-level attribute the way a standalone
 * `SPREAD_ATTR_RE` match alone can't tell apart (Codex, PR #874 round 39
 * thread 1). */
function isTopLevelAttributePosition(source: string, tagStart: number, index: number): boolean {
  const nameMatch = /^<[A-Za-z][\w.]*/.exec(source.slice(tagStart));
  if (!nameMatch) return false;
  let i = tagStart + nameMatch[0].length;
  while (i <= index) {
    while (i < source.length && /\s/.test(source[i])) i++;
    if (i === index) return true;
    if (i > index) return false;
    const c = source[i];
    if (c === undefined || c === ">") return false;
    if (c === "{") {
      i = extractBalanced(source, i, "{", "}").endIndex + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const close = source.indexOf(c, i + 1);
      if (close === -1) return false;
      i = close + 1;
      continue;
    }
    i++;
  }
  return false;
}

/** One class source found directly on a JSX opening tag -- a literal
 * `className=` attribute or a top-level `{...<expr>}` spread -- kept with
 * its own position and already-resolved text so `findClassNameSites` can
 * pick whichever source is actually in force, LAST-IN-SOURCE-ORDER-THAT-
 * SUPPLIES-A-CLASSNAME, per tag. JSX applies attributes (including spreads)
 * left to right, so a later source always overrides an earlier one at
 * runtime -- PROVIDED it actually supplies a `className`; a spread whose
 * resolved object has no `className` key of its own changes nothing at
 * runtime, and a scanner that treats it as an unconditional override anyway
 * erases whatever `className=`/spread came before it, e.g. `<span
 * className="text-red animate-pulse" {...{ title: "status" }}>Loading
 * </span>` really still renders `"text-red animate-pulse"` (Codex, PR #874
 * round 42 thread 1 -- round 39 thread 1's own fix only ever got the
 * ordering right, not this "does it actually override" gate). A scanner
 * that just picks the first `className=` it sees regardless of what comes
 * after it, or resolves a spread only when there's no OTHER `className=`
 * anywhere on the tag (round 38's own rule), makes the wrong call whenever
 * the two are mixed (Codex, PR #874 round 39 thread 1): `<span
 * className="text-green" {...props}>` really renders whatever
 * `props.className` is, not `"text-green"`, and the reverse -- an explicit
 * `className=` AFTER a spread -- really does win over the spread. */
interface ClassSource {
  /** Position used to order this source against every other one on the
   * same tag -- the attribute's own start (`className=`'s `m.index`, or the
   * spread's own `{`). */
  index: number;
  /** Where this source's resolved class content actually starts, carried
   * through to the emitted `ClassNameSite.index` when this source wins. */
  contentStart: number;
  raw: string;
  /** Whether this source actually supplies a `className` value at runtime --
   * always `true` for a literal `className=` attribute; for a spread, only
   * when `classifySpreadExpression` could confirm the resolved source
   * actually carries a `className` key of its own (Codex, PR #874 round 42
   * thread 1). A source with `false` here is still kept in `sources` (it
   * still needs its own `afterIndex` for locating the tag's children/close),
   * but `findClassNameSites` never lets it become the winner over whatever
   * source preceded it. */
  suppliesClassName: boolean;
  /** Position right after this source's own attribute -- valid as the
   * starting point for `findTagEnd` from ANY source on the tag, not just
   * the winning one, since `findTagEnd` skips forward through every later
   * attribute/expression regardless of where it starts. */
  afterIndex: number;
}

/** Every literal `className=` attribute in `source`, resolved through
 * `resolveConstRefs` exactly as the single pre-round-39 pass always did --
 * this is that same logic, just returning `ClassSource`s instead of
 * `ClassNameSite`s directly, so `findClassNameSites` can order them against
 * spreads before deciding which one actually applies to each tag. */
function collectExplicitClassSources(source: string, constMap: ConstDecl[]): ClassSource[] {
  const sources: ClassSource[] = [];
  // The negative lookbehind requires `className` to start a prop name (only
  // preceded by whitespace, a tag's `<Name`, or other prop-boundary
  // punctuation) -- without it, a differently-named prop that merely ends in
  // "className" (`labelClassName="..."`, a common forwarding-prop pattern)
  // would be misread as the element's own `className` (Codex, PR #874
  // round 24 regex sweep).
  const attrRe = /(?<![\w.:-])className\s*=\s*(\{|"|')/g;
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

    sources.push({ index: m.index, contentStart, raw, afterIndex, suppliesClassName: true });
  }
  return sources;
}

/** Every top-level `{...<expr>}` spread attribute in `source` -- see
 * `SPREAD_ATTR_START_RE`'s, `classifySpreadExpression`'s, and
 * `isTopLevelAttributePosition`'s own docs for the shape, how the spread
 * expression itself is resolved/fails closed, and the nested-expression
 * exclusion. Round 38 thread 1's own reasoning for NOT force-matching an
 * unresolvable base to `PULSE_CLASS` (a real, non-pulsing
 * `{...props}`-forwarding call site would otherwise become a false
 * positive) still applies unchanged here -- `classifySpreadExpression`'s
 * "anything else" branch is that exact same fail-closed convention, just
 * reached for a wider set of expression shapes than a bare identifier/chain
 * (Codex, PR #874 round 40 thread 1: an inline object literal, or an
 * expression this scanner has no model for at all, e.g. a call
 * expression). */
function collectSpreadClassSources(source: string, constMap: ConstDecl[]): ClassSource[] {
  const sources: ClassSource[] = [];
  SPREAD_ATTR_START_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = SPREAD_ATTR_START_RE.exec(source))) {
    const braceIndex = sm.index;
    const opening = findOpeningTag(source, braceIndex);
    if (!opening || !isTopLevelAttributePosition(source, opening.index, braceIndex)) continue;
    const { endIndex } = extractBalanced(source, braceIndex, "{", "}");
    const contentStart = braceIndex + sm[0].length;
    const exprText = source.slice(contentStart, endIndex);
    const afterIndex = endIndex + 1;

    const { raw, suppliesClassName } = classifySpreadExpression(exprText, constMap, braceIndex);

    sources.push({ index: braceIndex, contentStart: braceIndex, raw, afterIndex, suppliesClassName });
  }
  return sources;
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

/** One `ClassNameSite` per JSX opening tag, chosen from every `className=`/
 * spread `ClassSource` found on that tag by keeping the LAST one in source
 * order that actually `suppliesClassName` (Codex, PR #874 round 39 thread 1;
 * round 42 thread 1 adds the "actually supplies" gate) -- see `ClassSource`'s
 * own doc for why last-wins is the correct rule (it's exactly what JSX
 * itself does) and for why a spread with nothing to override with must
 * leave the winner unchanged instead of blanking it. The very first source
 * on a tag is always the initial winner regardless of its own
 * `suppliesClassName` (there's nothing earlier for it to not-override), but
 * every source after it only replaces the winner when it actually supplies
 * one. Sources are grouped by `findOpeningTag`'s own tag-start position,
 * the same backward walk every earlier single-source version of this
 * function already used, so a nested element's own attribute is never
 * mistaken for an outer element's (the walk always finds the NEAREST
 * enclosing `<Tag`, however deep). A source whose tag can't be found
 * (`findOpeningTag` returns `null` -- not real JSX, e.g. a `className`
 * inside a plain string/object comparison) is silently dropped, the same
 * outcome the old code reached by pushing a `tag: null` site that
 * `findElementViolations`'s own `if (!site.tag) continue;` immediately
 * discarded anyway. */
function findClassNameSites(
  source: string,
  constMap: ConstDecl[],
): ClassNameSite[] {
  const sites: ClassNameSite[] = [];
  const allSources = [
    ...collectExplicitClassSources(source, constMap),
    ...collectSpreadClassSources(source, constMap),
  ];

  const byTag = new Map<number, { tag: string; sources: ClassSource[] }>();
  for (const src of allSources) {
    const opening = findOpeningTag(source, src.index);
    if (!opening) continue;
    let group = byTag.get(opening.index);
    if (!group) {
      group = { tag: opening.tag, sources: [] };
      byTag.set(opening.index, group);
    }
    group.sources.push(src);
  }

  for (const [tagStart, { tag, sources }] of byTag) {
    sources.sort((a, b) => a.index - b.index);
    let winner = sources[0];
    for (let i = 1; i < sources.length; i++) {
      if (sources[i].suppliesClassName) winner = sources[i];
    }

    let childrenText: string | null = null;
    let openingTag: string | null = null;
    const gt = findTagEnd(source, winner.afterIndex);
    if (gt !== -1) {
      openingTag = source.slice(tagStart, gt);
      if (source[gt - 1] !== "/") {
        const closeAt = findMatchingCloseTag(source, tag, gt + 1);
        if (closeAt !== -1) {
          childrenText = source.slice(gt + 1, closeAt);
        }
      }
    }

    sites.push({ raw: winner.raw, tag, openingTag, childrenText, index: winner.contentStart });
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
 * PR #874 round 11). Walks the source position-by-position rather than
 * running a global regex over the raw text, so a same-tag token that isn't a
 * real sibling can never be miscounted: a `{...}` expression (including a
 * `{/* comment *\/}`) is skipped whole via `extractBalanced` before its
 * contents are ever compared against the tag pattern, and every other
 * element's tag (same-name or not) is skipped whole via `findTagEnd` so a
 * quoted attribute value containing this tag's own name followed by
 * whitespace/`/`/`>` can't be mistaken for a real open or close (Codex,
 * PR #874 round 19: `{/* replace <div> later *\/}Loading` previously left
 * depth stuck above zero and dropped the visible `Loading` text). -1 when
 * unbalanced. */
function findMatchingCloseTag(source: string, tag: string, from: number): number {
  const escaped = tag.replace(/[.$]/g, "\\$&");
  const openRe = new RegExp(`<${escaped}(?=[\\s/>])`, "y");
  const closeRe = new RegExp(`</${escaped}(?=[\\s>])`, "y");
  let depth = 1;
  let i = from;
  while (i < source.length) {
    const c = source[i];
    if (c === "{") {
      i = extractBalanced(source, i, "{", "}").endIndex + 1;
      continue;
    }
    if (c === "<") {
      closeRe.lastIndex = i;
      if (closeRe.test(source)) {
        depth--;
        if (depth === 0) return i;
        i += 2 + tag.length;
        continue;
      }
      openRe.lastIndex = i;
      if (openRe.test(source)) {
        const gt = findTagEnd(source, i + 1);
        if (gt === -1) return -1;
        if (source[gt - 1] !== "/") depth++;
        i = gt + 1;
        continue;
      }
      const skipFrom = source[i + 1] === "/" ? i + 2 : i + 1;
      const gt = findTagEnd(source, skipFrom);
      if (gt === -1) return -1;
      i = gt + 1;
      continue;
    }
    i++;
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

/** Every tag in `text` dropped whole -- unlike a naive `/<[^>]*>/g` strip,
 * this finds each tag's real end with `findTagEnd` (which already skips
 * quoted attribute values and `{…}` expressions), so a `>` inside a quoted
 * value (`<div data-formula="x > y" />`) can never be mistaken for the tag's
 * own close and leave trailing quote/attribute text (`y" />`) behind to read
 * as false text content (Codex, PR #874 round 18). */
function stripTags(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      const gt = findTagEnd(text, i + 1);
      if (gt === -1) {
        out += text.slice(i);
        break;
      }
      i = gt + 1;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

/** Prop names whose value is rendered as visible text by the component that
 * receives them -- a self-closing PascalCase component carrying one of
 * these (or a spread, which might carry one) still renders text under its
 * parent's pulse even though the component tag itself has no children for
 * this scanner to see (Codex, PR #874 round 18: `<RadioBadge label={i.label}
 * />` renders `i.label` as text, but a self-closing tag has no closing tag
 * or children text for the rest of this function to find). A spread
 * (`{...props}`) fails closed, since any of its keys could be one of these.
 * The negative lookbehind on the prop-name alternation requires the name to
 * start at a prop boundary (whitespace, tag start, or other punctuation --
 * never a word char, `-`, `.`, or `:`), so `aria-label=`/`data-label=` never
 * match `label=` the way a bare `\b` would (`\b` only asks for a transition
 * between word and non-word chars, and `-` counts as non-word either side)
 * (Codex, PR #874 round 24). The spread alternative needs no such boundary:
 * it matches a literal `{` followed by `...`, which can't be a suffix of an
 * unrelated identifier the way a bare word can. */
const TEXT_PROP_RE =
  /(?<![\w.:-])(label|text|title|children|value|name|caption|content|message|summary|description|heading|subtitle|badge)\s*=|\{\s*\.\.\./;

/** Every self-closing `<Name … />` tag in `text` whose tag name starts with
 * an uppercase letter (a component, not an intrinsic element -- intrinsic
 * self-closing tags keep the existing value-bearing-control rule instead),
 * found the same quote/brace-aware way as `stripTags`. */
function findSelfClosingComponentTags(text: string): string[] {
  const tags: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<" && /[A-Z]/.test(text[i + 1] ?? "")) {
      const gt = findTagEnd(text, i + 1);
      if (gt === -1) break;
      if (text[gt - 1] === "/") tags.push(text.slice(i, gt + 1));
      i = gt + 1;
      continue;
    }
    i++;
  }
  return tags;
}

/** One JSX element found by `extractJsxElements`: its full source text, tag
 * name, whether it's self-closing, and (for a non-self-closing element) the
 * raw text between its opening and closing tags. */
interface JsxElement {
  raw: string;
  tagName: string;
  selfClosing: boolean;
  children: string | null;
}

/** Every named JSX element (`<Tag ...>...</Tag>` or self-closing `<Tag
 * .../>`) found anywhere in `text`, skipping quoted strings so a `<` inside
 * one is never mistaken for an element start. Shares `findTagEnd` (attribute
 * quotes/expressions) and `findMatchingCloseTag` (nested same-tag depth)
 * with the rest of the file, so an element embedded in a ternary or
 * logical-AND expression (`cond ? <span>Loading</span> : null`, `ready &&
 * <span className="h-2" />`) is found the same way a direct child would be
 * (Codex, PR #874 round 19). Fragments (`<>...</>`) are not recognized here;
 * callers fail closed on any expression whose only unrecognized content
 * looks like JSX. */
function extractJsxElements(text: string): JsxElement[] {
  const elements: JsxElement[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const close = text.indexOf(c, i + 1);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (c === "<") {
      const nameMatch = /^<([A-Za-z][\w.]*)/.exec(text.slice(i));
      if (nameMatch) {
        const tagName = nameMatch[1];
        const gt = findTagEnd(text, i + 1);
        if (gt === -1) {
          i++;
          continue;
        }
        if (text[gt - 1] === "/") {
          elements.push({ raw: text.slice(i, gt + 1), tagName, selfClosing: true, children: null });
          i = gt + 1;
          continue;
        }
        const closeIndex = findMatchingCloseTag(text, tagName, gt + 1);
        if (closeIndex === -1) {
          i = gt + 1;
          continue;
        }
        const closeTagEnd = findTagEnd(text, closeIndex + 2);
        if (closeTagEnd === -1) {
          i = gt + 1;
          continue;
        }
        elements.push({
          raw: text.slice(i, closeTagEnd + 1),
          tagName,
          selfClosing: false,
          children: text.slice(gt + 1, closeIndex),
        });
        i = closeTagEnd + 1;
        continue;
      }
    }
    i++;
  }
  return elements;
}

/** True when a single JSX element found by `extractJsxElements` renders text
 * under its enclosing pulse: a self-closing component (uppercase tag name)
 * counts when it carries a text-shaped prop or spread (same rule as
 * `findSelfClosingComponentTags`/`TEXT_PROP_RE`); a self-closing intrinsic
 * element counts only as a value-bearing form control; any element with
 * real children recurses into `isTextBearingChildren` so nested text,
 * mappings and components are judged by the exact same rules regardless of
 * how deep they're nested (round 19). */
function isJsxElementTextBearing(el: JsxElement): boolean {
  if (el.selfClosing) {
    if (/^[A-Z]/.test(el.tagName)) return TEXT_PROP_RE.test(el.raw);
    // `el.raw` is already exactly one bounded tag (via `findTagEnd` in
    // `extractJsxElements`), so a plain substring test for the attribute
    // name is safe here -- no `[^>]*` traversal from the tag name to the
    // attribute is needed (Codex, PR #874 round 20).
    return FORM_VALUE_TAGS.has(el.tagName) && VALUE_ATTR_RE.test(el.raw);
  }
  return isTextBearingChildren(el.children);
}

/** Every char index in `text` that is inside a quoted string ('/"/`),
 * skipping over parens/brackets/braces depth-tracking helpers below need to
 * treat as opaque -- kept as a small shared scanning primitive rather than
 * duplicated inline in both `splitAtTopLevelOperators` and `findArrowBodies`
 * (Codex, PR #874 round 21). */
function isQuoteChar(c: string): boolean {
  return c === '"' || c === "'" || c === "`";
}

/** One operand of a `?`/`:`/`&&`/`||`/`??` chain, together with the operator
 * that immediately follows it at depth 0 (`null` for the chain's last
 * operand) -- what `valueOperands` below needs to tell a condition from a
 * rendered value. */
interface OperandSplit {
  text: string;
  opAfter: "?" | ":" | "&&" | "||" | "??" | null;
}

/** Splits `text` at depth 0 (outside `()`/`[]`/`{}` and quoted strings) on
 * the operators `?`, `:`, `&&`, `||`, `??` -- a `?` immediately followed by
 * `.` (optional chaining, `a?.b`) is not a split point. Used to separate a
 * ternary/logical expression's condition(s) from its value-bearing operands
 * (Codex, PR #874 round 21); each operand keeps the operator that follows
 * it so `valueOperands` can classify it correctly per operator, not just by
 * position (round 22 fixed a wrong assumption that every operand but the
 * first is a value -- true for `?`/`:`, but `||`/`??` render BOTH operands,
 * so their left operand is a value too, not a condition). */
function splitAtTopLevelOperators(text: string): OperandSplit[] {
  const parts: OperandSplit[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (isQuoteChar(c)) {
      inStr = c;
      i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      i++;
      continue;
    }
    if (depth === 0) {
      if (c === "?" && text[i + 1] === "?") {
        parts.push({ text: text.slice(start, i), opAfter: "??" });
        i += 2;
        start = i;
        continue;
      }
      if (c === "&" && text[i + 1] === "&") {
        parts.push({ text: text.slice(start, i), opAfter: "&&" });
        i += 2;
        start = i;
        continue;
      }
      if (c === "|" && text[i + 1] === "|") {
        parts.push({ text: text.slice(start, i), opAfter: "||" });
        i += 2;
        start = i;
        continue;
      }
      if (c === "?" && text[i + 1] !== ".") {
        parts.push({ text: text.slice(start, i), opAfter: "?" });
        i += 1;
        start = i;
        continue;
      }
      if (c === ":") {
        parts.push({ text: text.slice(start, i), opAfter: ":" });
        i += 1;
        start = i;
        continue;
      }
    }
    i++;
  }
  parts.push({ text: text.slice(start), opAfter: null });
  return parts;
}

/** The operands of a `?`/`:`/`&&`/`||`/`??` chain that are actually rendered
 * values, as opposed to a condition that only decides which value renders
 * (Codex, PR #874 round 23). An operand is a condition -- excluded -- only
 * when the operator immediately after it is `?` (the ternary condition) or
 * `&&` (its LEFT operand only: `cond && value`). Every other operand is a
 * value: the chain's last operand always is (there's no operator after it
 * to make it a condition); an operand followed by `:` is a ternary's
 * true-branch value; and -- the round-21 spec's mistake -- an operand
 * followed by `||` or `??` is ALSO a value, since both sides of a logical-OR
 * or nullish-coalescing fallback render (`message || <Spinner />` renders
 * `message` when it's truthy, not just when it's falsy). A mixed chain
 * classifies each operand by its own following operator: `a && b || <X />`
 * treats `a` as a condition (left of `&&`) but `b` as a value (left of
 * `||`). */
function valueOperands(parts: OperandSplit[]): string[] {
  return parts.filter((p) => p.opAfter !== "?" && p.opAfter !== "&&").map((p) => p.text);
}

/** Every `return <expr>;` statement's `<expr>` found at the top level of a
 * block-bodied callback (`{ … }` after `=>` or `function (…)`) -- a block
 * body used to be skipped by `findArrowBodies` entirely, so
 * `{items.map(i => { return i.ready ? <span className="h-2" /> : "Loading";
 * })}` never had its returned ternary examined at all (Codex, PR #874 round
 * 34). A nested arrow/`function`'s OWN block body is skipped wholesale (via
 * `extractBalanced`) since a `return` inside it belongs to that inner
 * function, not this one; every other `return` -- including one inside a
 * braced or unbraced `if`/`for`/etc, which introduces no *function* nesting
 * of its own, only a plain block -- is found by a flat left-to-right scan
 * (skipping only quoted/template spans and nested-function bodies) and its
 * expression captured up to its own depth-0 terminating `;` (same
 * `(`/`[`/`{` depth rule `findInitializerEnd` uses for a declarator). This is
 * exactly why `function (i) { if (!i) return null; return i.label; }`'s
 * second `return` is found: the `if` has no braces of its own, so it adds no
 * depth at all. */
function extractBlockReturnExpressions(blockInner: string): string[] {
  const results: string[] = [];
  const len = blockInner.length;
  const isWordChar = (ch: string | undefined) => !!ch && /[\w$]/.test(ch);
  let i = 0;
  while (i < len) {
    const c = blockInner[i];
    if (c === "`") {
      i += extractTemplateLiteral(blockInner, i).length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < len && blockInner[j] !== c) j += blockInner[j] === "\\" ? 2 : 1;
      i = j + 1;
      continue;
    }
    // A nested arrow function's own block body: skip it wholesale.
    if (c === "=" && blockInner[i + 1] === ">") {
      let k = i + 2;
      while (k < len && /\s/.test(blockInner[k])) k++;
      if (blockInner[k] === "{") {
        i = extractBalanced(blockInner, k, "{", "}").endIndex + 1;
        continue;
      }
      i = k;
      continue;
    }
    // A nested `function` declaration/expression's own block body: same
    // reasoning, skipping past its optional name and parameter list first.
    if (!isWordChar(blockInner[i - 1]) && /^function(?:[\s(]|$)/.test(blockInner.slice(i, i + 9))) {
      let k = i + "function".length;
      while (k < len && /\s/.test(blockInner[k])) k++;
      const nameMatch = /^[A-Za-z_$][\w$]*/.exec(blockInner.slice(k));
      if (nameMatch) k += nameMatch[0].length;
      while (k < len && /\s/.test(blockInner[k])) k++;
      if (blockInner[k] === "(") {
        k = extractBalanced(blockInner, k, "(", ")").endIndex + 1;
        while (k < len && /\s/.test(blockInner[k])) k++;
      }
      if (blockInner[k] === "{") {
        i = extractBalanced(blockInner, k, "{", "}").endIndex + 1;
        continue;
      }
      i = k;
      continue;
    }
    // A `return` statement at this block's own depth.
    if (!isWordChar(blockInner[i - 1]) && /^return(?:[\s;]|$)/.test(blockInner.slice(i, i + 7))) {
      let k = i + "return".length;
      const exprStart = k;
      let depth = 0;
      let inStr: string | null = null;
      for (; k < len; k++) {
        const rc = blockInner[k];
        if (inStr) {
          if (rc === "\\") {
            k++;
            continue;
          }
          if (rc === inStr) inStr = null;
          continue;
        }
        if (rc === "`") {
          k += extractTemplateLiteral(blockInner, k).length - 1;
          continue;
        }
        if (rc === '"' || rc === "'") {
          inStr = rc;
          continue;
        }
        if (rc === "(" || rc === "[" || rc === "{") {
          depth++;
          continue;
        }
        if (rc === ")" || rc === "]" || rc === "}") {
          if (depth === 0) break;
          depth--;
          continue;
        }
        if (depth === 0 && rc === ";") break;
      }
      results.push(blockInner.slice(exprStart, k).trim());
      i = blockInner[k] === ";" ? k + 1 : k;
      continue;
    }
    i++;
  }
  return results;
}

/** Every top-level (any nesting depth, quote-aware) arrow/`function`
 * callback's rendered body found in `text` -- a `.map((i) => cond ? <A /> :
 * i.label)` callback's ternary sits inside the map call's own parens,
 * invisible to a depth-0-only split of the whole expression, so its body is
 * extracted and examined on its own, depth reset to 0 for that body alone
 * (Codex, PR #874 round 21). A `{ … }` block body (statements, not a single
 * expression) can't be evaluated as one expression, but every `return
 * <expr>;` it contains at its own depth is extracted by
 * `extractBlockReturnExpressions` and examined the same way an expression
 * body is -- a block with no `return`, or only `return null/undefined/false;`,
 * contributes nothing (Codex, PR #874 round 34: `.map(i => { return
 * i.ready ? <span className="h-2" /> : "Loading"; })` and `.map(function
 * (i) { if (!i) return null; return i.label; })` were both previously
 * invisible to this scanner, a `function` callback doubly so since only
 * `=>` was ever matched at all). */
function findArrowBodies(text: string): string[] {
  const bodies: string[] = [];
  const re = /=>|\bfunction\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let i: number;
    if (m[0] === "=>") {
      i = m.index + 2;
      while (i < text.length && /\s/.test(text[i])) i++;
    } else {
      // `function` keyword: skip an optional name and the parameter list to
      // reach the body, the same place an arrow's `=>` already points at.
      let k = m.index + "function".length;
      while (k < text.length && /\s/.test(text[k])) k++;
      const nameMatch = /^[A-Za-z_$][\w$]*/.exec(text.slice(k));
      if (nameMatch) k += nameMatch[0].length;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (text[k] === "(") {
        k = extractBalanced(text, k, "(", ")").endIndex + 1;
        while (k < text.length && /\s/.test(text[k])) k++;
      }
      i = k;
    }
    if (text[i] === "{") {
      const { endIndex } = extractBalanced(text, i, "{", "}");
      const inner = text.slice(i + 1, endIndex);
      bodies.push(...extractBlockReturnExpressions(inner));
      re.lastIndex = endIndex + 1;
      continue;
    }
    let depth = 0;
    let inStr: string | null = null;
    let j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (c === "\\") {
          j++;
          continue;
        }
        if (c === inStr) inStr = null;
        continue;
      }
      if (isQuoteChar(c)) {
        inStr = c;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") {
        depth++;
        continue;
      }
      if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
        continue;
      }
      if (depth === 0 && c === ",") break;
    }
    bodies.push(text.slice(i, j));
    re.lastIndex = j;
  }
  return bodies;
}

/** True when a single value-position operand (already isolated by
 * `splitAtTopLevelOperators`) renders as visible text: fails closed on
 * anything that isn't unambiguously non-text -- empty, `null`/`undefined`/
 * `false`/`true`, an empty string/template literal, or (after an extracted
 * JSX element's raw span has been blanked to spaces by the caller) nothing
 * but whitespace (Codex, PR #874 round 21). */
function isValuePositionTextBearing(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  if (/^(null|undefined|false|true)$/.test(trimmed)) return false;
  if (/^(""|''|``)$/.test(trimmed)) return false;
  return true;
}

/** Strips a `( … )` pair that wraps `text`'s *entire* trimmed span, repeated
 * as long as one keeps wrapping the result -- so `{(ready ? <span /> :
 * "Loading")}`'s grouping parens don't hide its ternary's `?`/`:` at depth 1
 * from a depth-0 split (Codex, PR #874 round 24). Only ever strips a paren
 * that is the very first character of the trimmed text, which a call's
 * parens (`t("x")`) can never be (a call always has an identifier/expression
 * immediately before its `(`), so `t("x")` is left alone. Confirms the pair
 * spans the *whole* string (via `extractBalanced`, quote-aware) before
 * stripping, so a non-wrapping pair like `(a)(b)` -- where the first `(`
 * only closes partway through -- is left alone too. */
function unwrapGroupingParens(text: string): string {
  let out = text.trim();
  while (out.length >= 2 && out[0] === "(") {
    const { endIndex } = extractBalanced(out, 0, "(", ")");
    if (endIndex !== out.length - 1) break;
    out = out.slice(1, -1).trim();
  }
  return out;
}

/** Classifies one value operand of a `?`/`:`/`&&`/`||`/`??` chain (already
 * isolated by `valueOperands`): unwraps its own grouping parens and, if
 * doing so reveals the operand is itself a further chain (`(b || "x")`),
 * recurses through the same value-operand rule for its own operands, rather
 * than falling straight to `isValuePositionTextBearing`'s flat fail-closed
 * check -- so a chain nested by its own parens is examined the same way a
 * depth-0 one is (round 24: `{(a ? (b ? <X /> : "y") : null)}`'s inner
 * ternary is itself a value operand of the outer one). A true leaf (a bare
 * identifier, string, or blanked-JSX span with no operator of its own) falls
 * through to `isValuePositionTextBearing` unchanged. */
function isValueOperandTextBearing(operand: string): boolean {
  const unwrapped = unwrapGroupingParens(operand);
  const parts = splitAtTopLevelOperators(unwrapped);
  if (parts.length > 1) return valueOperands(parts).some(isValueOperandTextBearing);
  return isValuePositionTextBearing(unwrapped);
}

/** Same balanced-scan rule as `extractBalanced`, restricted to a `[`/`]`
 * pair (an array literal) -- `extractBalanced`'s own type only spans
 * `{}`/`()`, and every existing call site already commits to one of those
 * two, so widening its signature for this one new caller isn't worth the
 * churn (Codex, PR #874 round 37, `isRemainderTextBearing`'s new
 * array-literal branch below). */
function extractBalancedBrackets(source: string, openIndex: number): { endIndex: number } {
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
    if (isQuoteChar(c)) {
      inStr = c;
      continue;
    }
    if (c === "[") {
      depth++;
    } else if (c === "]") {
      depth--;
      if (depth === 0) return { endIndex: i };
    }
  }
  return { endIndex: source.length - 1 };
}

/** Splits `text` at depth 0 (outside `()`/`[]`/`{}` and quoted strings) on a
 * bare `,` -- an array literal's own elements (Codex, PR #874 round 37).
 * Same quote-aware depth-tracking rule as `splitAtTopLevelOperators`, just
 * splitting on `,` instead of a ternary/logical operator. A part that trims
 * to nothing is dropped rather than kept as an empty element -- an empty
 * array (`[]`), a trailing comma (`[a, b,]`), and a sparse hole (`[a, , b]`)
 * all render nothing at that position, same as `null`/`false` already do. */
function splitTopLevelCommaList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (isQuoteChar(c)) {
      inStr = c;
      i++;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      i++;
      continue;
    }
    if (depth === 0 && c === ",") {
      parts.push(text.slice(start, i));
      i++;
      start = i;
      continue;
    }
    i++;
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

/** True when a single array-literal element (already isolated by
 * `splitTopLevelCommaList`) renders text -- the same "value position" rule
 * `isRemainderTextBearing`/`isValueOperandTextBearing` apply elsewhere, run
 * on one element instead of a whole block: a `?`/`:`/`&&`/`||`/`??` chain at
 * this element's own depth 0 recurses through this same rule per operand
 * (`[cond && "x"]`'s one element is such a chain); a nested array literal
 * (`[[<span/>, "Loading"]]`) recurses through this same rule per its OWN
 * element; an arrow/`function` callback embedded in this element
 * (`...items.map((i) => <div key={i} className="h-2" />)` as one element
 * among others) is decided ENTIRELY by whether any of its own bodies render
 * text (`isRemainderTextBearing`, the same rule a block-level callback
 * already gets) -- unlike the final fallback below, a callback found here is
 * never ALSO run back through the blunt leaf check, or a purely decorative
 * one (blanked JSX, no text of its own) would wrongly count via its own
 * leftover call syntax (`items.map(i =>            )` is not empty text).
 * Anything else -- a bare identifier, string, or blanked-JSX span with no
 * operator or callback of its own -- falls through to the same
 * `isValuePositionTextBearing` fail-closed leaf check every other value
 * position gets. Known gap, same shape as the file's other documented ones:
 * an element that is ONLY a non-JSX callback with no ternary of its own
 * (`items.map(i => i.label)`, no `<...>` anywhere in the whole callback) is
 * judged solely by its body's own JSX-shaped content, same as a block-level
 * callback already is -- a callback that never contained JSX to begin with
 * renders through neither path (Codex, PR #874 round 37). */
function isArrayElementTextBearing(element: string): boolean {
  const unwrapped = unwrapGroupingParens(element);
  const parts = splitAtTopLevelOperators(unwrapped);
  if (parts.length > 1) return valueOperands(parts).some(isArrayElementTextBearing);
  if (unwrapped[0] === "[") {
    const { endIndex } = extractBalancedBrackets(unwrapped, 0);
    if (endIndex === unwrapped.length - 1) {
      return splitTopLevelCommaList(unwrapped.slice(1, -1)).some(isArrayElementTextBearing);
    }
  }
  const arrowBodies = findArrowBodies(unwrapped);
  if (arrowBodies.length > 0) return arrowBodies.some(isRemainderTextBearing);
  return isValuePositionTextBearing(unwrapped);
}

/** True when `remainder` -- an expression block's text with every JSX
 * element `extractJsxElements` found already blanked to spaces -- still
 * renders text through a non-JSX alternative: every value operand
 * (`valueOperands`, which knows `?`'s condition and `&&`'s left operand are
 * the only non-value positions) of a `?`/`:`/`&&`/`||`/`??` chain at depth 0
 * is judged by `isValueOperandTextBearing` (round 21's `{ready ? <span
 * className="h-2" /> : "Loading"}` -- the only JSX is the decorative span,
 * but the ternary's other branch is a literal string that renders when
 * `ready` is false; round 23's `{message || <Spinner />}` -- `message` is a
 * value here, not a condition, and renders whenever it's truthy; round 24:
 * `unwrapGroupingParens` runs first, so a whole block wrapped in its own
 * grouping parens still exposes its chain at depth 0). An array literal
 * spanning the WHOLE (unwrapped) remainder (`[<span className="h-2" />,
 * "Loading"]`) is examined elementwise by `isArrayElementTextBearing`,
 * rather than by the ternary/logical split above -- `splitAtTopLevelOperators`
 * already treats `[`/`]` as depth-changing brackets, so an operator strictly
 * INSIDE the array's own elements is invisible to that split at this level
 * anyway, and the two checks never fire on the same text (Codex, PR #874
 * round 37: previously, a plain array of JSX + text siblings had no
 * elementwise inspection at all -- a decorative element blanked to spaces
 * left nothing behind that either check above could see, and a sibling
 * literal string was never examined on its own). An arrow function's body
 * (`.map((i) => ...)`) is examined the same way, recursively, since its own
 * ternary/logical operators sit inside the call's parens and are invisible
 * to a depth-0 split of the whole block. */
function isRemainderTextBearing(remainder: string): boolean {
  const unwrapped = unwrapGroupingParens(remainder);
  const parts = splitAtTopLevelOperators(unwrapped);
  if (parts.length > 1 && valueOperands(parts).some(isValueOperandTextBearing)) return true;
  if (unwrapped[0] === "[") {
    const { endIndex } = extractBalancedBrackets(unwrapped, 0);
    if (endIndex === unwrapped.length - 1) {
      const elements = splitTopLevelCommaList(unwrapped.slice(1, -1));
      if (elements.some(isArrayElementTextBearing)) return true;
    }
  }
  return findArrowBodies(remainder).some(isRemainderTextBearing);
}

/** `text` with every element `extractJsxElements` found blanked out to an
 * equal-length run of spaces (so downstream character offsets and depth
 * tracking are unaffected), leaving only the expression's non-JSX text
 * behind for `isRemainderTextBearing` to examine. Elements are blanked at
 * their first occurrence from a left-to-right cursor, matching the
 * left-to-right order `extractJsxElements` already returns them in. */
function blankJsxElements(text: string, elements: JsxElement[]): string {
  let out = text;
  let cursor = 0;
  for (const el of elements) {
    const at = out.indexOf(el.raw, cursor);
    if (at === -1) continue;
    out = out.slice(0, at) + " ".repeat(el.raw.length) + out.slice(at + el.raw.length);
    cursor = at + el.raw.length;
  }
  return out;
}

/** Classifies one `{...}` expression block (braces included) from a
 * child's raw JSX by what it actually emits, replacing the old `.map(`/`=>`
 * special case (Codex, PR #874 round 19). A block with no JSX in it at all
 * (`{count}`, `{label}`, `{t("x")}`, `{a ? "Loading" : "Ready"}`, a bare
 * spread `{...props}`) renders that value as text right here, so it counts
 * (fail closed -- this scanner can't evaluate the expression). A block that
 * does contain JSX (a ternary, `&&`, or a `.map()` callback) counts when the
 * JSX inside would itself be text-bearing by `isJsxElementTextBearing`, OR
 * when the block's non-JSX remainder (the block with each found JSX
 * element's raw span blanked out) still renders text through some other
 * branch of the same ternary/logical expression (round 21) -- so
 * `{ready && <span className="h-2" />}` (decorative) and
 * `{items.map((i) => <div key={i} className="h-2" />)}` (skeleton) are
 * dismissed, while `{ready ? <span>Loading</span> : null}` and
 * `{ready ? <span className="h-2" /> : "Loading"}` both still count. */
function isExpressionBlockTextBearing(block: string): boolean {
  const inner = block.slice(1, -1);
  // `inner` has already had every comment blanked to same-length spaces by
  // the time this runs (`blankCommentsAndQuotedJsx`, applied once during
  // normalization, before any element-level scanning) -- so a comment-only
  // block arrives here as nothing but whitespace, not as literally empty
  // text. Without this check, that whitespace fell into the "no JSX-shaped
  // content, fail closed to true" path just below, wrongly counting a
  // decorative comment placeholder (or a literal `{}`) as rendered text. The
  // rendered-space idiom `{" "}` is unaffected -- its quote characters are
  // not JSX-shaped text and are never blanked, so `inner` there is `" "`
  // (quotes included), not whitespace-only, and still falls through to the
  // same fail-closed `true` below it always has (Codex, PR #874 round 35).
  if (inner.trim() === "") return false;
  if (!/<(?:[A-Za-z]|>)/.test(inner)) return true;
  const elements = extractJsxElements(inner);
  if (elements.length === 0) return true;
  if (elements.some(isJsxElementTextBearing)) return true;
  return isRemainderTextBearing(blankJsxElements(inner, elements));
}

/** True when `children` (the raw JSX between an opening and closing tag)
 * carries non-whitespace text, a `{...}` expression child that renders a
 * simple value or text-bearing JSX (round 19), or a self-closing component
 * that renders a text-shaped prop of its own (round 18). */
function isTextBearingChildren(children: string | null): boolean {
  if (!children) return false;
  // A value-bearing form control anywhere under this element renders its
  // value or placeholder as text that this element's pulse fades, whether
  // it sits directly in the children or inside a mapping's emitted JSX; the
  // control itself carries no pulse class for the scan to find (Codex,
  // PR #874 round 10). Each control tag is extracted whole via `findTagEnd`
  // first (round 20) so a quoted `>` in an earlier attribute (`<input
  // title="1 > 0" value="Loading" />`) can't truncate the search before it
  // ever reaches `value=`/`defaultValue=`/`placeholder=`.
  if (findFormValueControlTags(children).some((tag) => VALUE_ATTR_RE.test(tag))) return true;
  // A self-closing component (direct child or emitted by a mapping) that
  // carries a text-shaped prop renders that prop's value as text, even
  // though the tag itself has no children of its own (round 18).
  if (findSelfClosingComponentTags(children).some((tag) => TEXT_PROP_RE.test(tag))) return true;
  const withoutTags = stripTags(children);
  if (/\S/.test(stripBalancedExpressions(withoutTags).withoutExpr)) return true;
  // Classify the `{…}` blocks on the raw children (tags intact) by what
  // JSX (if any) they emit, so a mapping or conditional that renders text
  // is told from one that renders only decorative elements (round 19).
  return stripBalancedExpressions(children).blocks.some(isExpressionBlockTextBearing);
}

/** Void form controls render their value or placeholder as text, so a pulse
 * on the control fades it even though the element has no children
 * (Codex, PR #874 round 8). Same prop-boundary lookbehind as `TEXT_PROP_RE`
 * (round 24), so `aria-placeholder=`/`data-value=` don't count as this
 * control's own rendered value or placeholder. Tolerates whitespace on
 * either side of `=` (`value = "Loading"`), matching `TEXT_PROP_RE`'s and
 * `className`'s own `attrRe`'s existing `\s*=\s*` -- this one was still
 * exact-`=` only, so a spaced assignment on a value/defaultValue/placeholder
 * attribute was missed entirely (Codex, PR #874 round 36). */
const FORM_VALUE_TAGS = new Set(["input", "textarea"]);
const VALUE_ATTR_RE = /(?<![\w.:-])(value|defaultValue|placeholder)\s*=\s*/;
const FORM_VALUE_TAG_OPEN_RE = new RegExp(`<(${[...FORM_VALUE_TAGS].join("|")})(?=[\\s/>])`, "y");

/** Every `<input …>`/`<textarea …>` opening tag (self-closing or not) found
 * anywhere in `text`, extracted whole via `findTagEnd` -- unlike the old
 * `VALUE_BEARING_CONTROL` regex (which used `<tag\b[^>]*\b attr=` to jump
 * from the tag name to the attribute across arbitrary text), a quoted `>` in
 * an earlier attribute (`<input title="1 > 0" value="Loading" />`) can never
 * truncate the scan before it reaches `value=`/`defaultValue=`/`placeholder=`
 * (Codex, PR #874 round 20: the old regex silently failed to match that
 * fixture, and the quote-aware `stripTags` then removed the whole tag,
 * leaving no other signal behind to catch it). */
function findFormValueControlTags(text: string): string[] {
  const tags: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      FORM_VALUE_TAG_OPEN_RE.lastIndex = i;
      if (FORM_VALUE_TAG_OPEN_RE.test(text)) {
        const gt = findTagEnd(text, i + 1);
        if (gt === -1) break;
        tags.push(text.slice(i, gt + 1));
        i = gt + 1;
        continue;
      }
    }
    i++;
  }
  return tags;
}

function isValueBearingControl(site: ClassNameSite): boolean {
  return (
    site.tag !== null && FORM_VALUE_TAGS.has(site.tag) && VALUE_ATTR_RE.test(site.openingTag ?? "")
  );
}

/** Index range of the innermost enclosing `{...}` block containing `index`
 * in `source` (found by scanning backward for a `{` unmatched by an
 * interceding `}`, skipping quoted/template spans via
 * `skipQuotedSpanBackward` so a brace character quoted somewhere earlier in
 * the file never miscounts the depth -- Codex, PR #874 round 30: this used
 * to be a plain, quote-blind depth count), or `null` when `index` sits at
 * module scope with no enclosing block at all. Shared by
 * `findEnclosingBraceBlock` (the config-map scan) and
 * `collectConstTemplateMap` (a declaration's lexical scope, PR #874 round
 * 14) so both agree on what "innermost block" means. */
function findEnclosingBraceRange(
  source: string,
  index: number,
): { start: number; end: number } | null {
  let depth = 0;
  let i = index;
  while (i >= 0) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const resume = skipQuotedSpanBackward(source, i);
      if (resume === -1) return null;
      i = resume;
      continue;
    }
    if (c === "}") {
      depth++;
    } else if (c === "{") {
      if (depth === 0) {
        return { start: i, end: extractBalanced(source, i, "{", "}").endIndex };
      }
      depth--;
    }
    i--;
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
 * children, OR a PascalCase component (`isTextBearingTag` unconditionally
 * excludes every capitalized tag, since a scanner with no type information
 * can't know what an arbitrary component renders) whose className carries
 * the pulse class AND which itself carries a text-shaped prop/spread or
 * (non-self-closing) text-bearing children -- `<RadioBadge className=
 * "animate-pulse" label="TX" />` forwards its own className onto whatever
 * text-bearing element it renders internally, same as `<Icon className=
 * "animate-pulse" />` (no text signal at all) staying skipped (Codex, PR
 * #874 round 21). `normalizedSource` must already be whitespace-normalized
 * (see `normalize`) -- `scanSourceForViolations` does this once for both
 * scans so every `Violation.index` shares one coordinate space with the
 * anchors they're compared against. `importedDecls` (Codex, PR #874 round
 * 28) are extra `ConstDecl`s -- resolved by the census's cross-file import
 * pass, or supplied directly by a fixture -- appended after this file's own
 * declarations so a `className={alertClasses}` bound to an *imported*
 * `export const alertClasses = "…animate-pulse…"` resolves exactly like a
 * local one; empty by default so every existing single-file caller is
 * unaffected. Also passed into `collectConstTemplateMap` itself (not just
 * appended after it) -- `const styles = { safe: "text-green", ...base };`
 * where `base` is one of these imported bindings used to be replayed before
 * `importedDecls` was ever appended, so the spread's own source was
 * invisible to `visibleDecl` and treated as unresolvable, leaving
 * `styles.safe` on its local, non-pulsing value even when `base.safe` really
 * does carry the pulse class (Codex, PR #874 round 36). */
function findElementViolations(
  normalizedSource: string,
  importedDecls: ConstDecl[] = [],
): Violation[] {
  const constMap = [...collectConstTemplateMap(normalizedSource, importedDecls), ...importedDecls];
  const violations: Violation[] = [];
  for (const site of findClassNameSites(normalizedSource, constMap)) {
    if (!site.tag) continue;
    const pulseMatch = PULSE_CLASS_RE.exec(site.raw);
    if (!pulseMatch) continue;
    if (/^[A-Z]/.test(site.tag)) {
      // Reuses the same `TEXT_PROP_RE` prop list as `findSelfClosingComponentTags`
      // (round 18) rather than duplicating it -- and the same
      // `isTextBearingChildren` rules a non-self-closing intrinsic element
      // is judged by, since `findClassNameSites`/`findMatchingCloseTag` are
      // already tag-name-agnostic and populate `childrenText` for a
      // component tag exactly the same way.
      const textBearing =
        TEXT_PROP_RE.test(site.openingTag ?? "") || isTextBearingChildren(site.childrenText);
      if (textBearing) {
        violations.push({
          description: `<${site.tag}> pulses while forwarding its className to a text-shaped prop, spread, or text-bearing children (className: ${JSON.stringify(normalize(site.raw).slice(0, 100))})`,
          index: site.index + pulseMatch.index,
        });
      }
      continue;
    }
    if (!isTextBearingTag(site.tag)) continue;
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

/** Blanks out (same-length spaces, so total length -- and every downstream
 * character offset -- is unchanged) every `//` line comment, `/* … *\/`
 * block comment (a `{/* … *\/}` JSX comment is just one of these sitting
 * inside ordinary `{}`, not special-cased), and the BODY of any quoted
 * string or template literal whose contents look like a JSX opening tag
 * (`<` immediately followed by a letter) -- a real `className`/prop value
 * never contains a tag, while a comment or doc string illustrating one does,
 * so this scanner (which can't tell a comment from code any other way)
 * fails closed on treating that as a signal (Codex, PR #874 round 23: `//
 * <span className="animate-pulse">Loading</span>` in a comment, or `const
 * doc = "<span className=\"animate-pulse\">Loading</span>";`, both read as
 * a real rendered site before this).
 *
 * Rounds 25 and 27 made this quote-vs-JSX-text and `//`-vs-JSX-text call with
 * a pair of preceding-character heuristics (`isQuoteInExpressionPosition`,
 * `isRealLineCommentStart`), because every character was judged the same way
 * regardless of where it sat. This is a real mode machine instead: JS mode
 * (`scanJs`, comments/strings/templates real, a quote always a real string),
 * JSX-tag mode (`scanJsxElement`, an attribute's quoted value or `{expr}`),
 * and JSX-text mode (`scanJsxText`, no comments and no quotes at all -- an
 * apostrophe in `Don't wait` is just a character there, not a string
 * delimiter, and `//`/`/* *\/` are just text, not comments, e.g. `Visit
 * https://example.com`). A `//`/`https://` inside a URL, or an apostrophe in
 * JSX prose, is never ambiguous once its MODE is known, rather than guessed
 * from the character immediately before it (Codex, PR #874 round 33: `<div>Use
 * // as a separator <span className="animate-pulse">Loading</span></div>` --
 * whitespace, not code, before the `//` -- read the rest of the line,
 * including the real site, as a comment under the old heuristic). Quote-aware
 * throughout -- a `//` inside `"https://…"`, or inside any other quoted
 * string, is consumed whole by the string scanner before the comment check
 * ever sees it, so it can never start a false line comment. Delimiters (the
 * `//`, `/*`/`*\/`, and a string's own quote characters) are left in place;
 * only comment bodies and JSX-shaped string bodies are blanked, which is what
 * keeps the total length -- and so every anchor/violation offset computed
 * from the result -- stable. Applied once, by `scanSourceForViolations` and
 * by the census's own `normalize(raw)` call, so a violation's index and the
 * anchor window it's checked against are always computed from the same
 * text. */
/** Punctuation that puts an immediately-following `<` in JavaScript
 * expression position -- a JSX subtree is starting, not a comparison
 * (Codex, PR #874 round 25, repurposed from a quote-starts-a-string test to
 * a `<`-starts-JSX test in round 33 now that a quote in JS mode is always
 * unambiguously a real string). */
const EXPRESSION_POSITION_PUNCT = new Set([
  "=", "(", ",", "[", "{", ":", "?", "+", "-", "*", "/", "%", "&", "|", "^", "!", ";", "<", "~",
]);

/** Keywords that, immediately before a `<`, also put it in expression
 * position (`return <div/>`, `typeof x === <weird>` never appears but the
 * list errs toward the spec rather than trimming it to only what's
 * plausible). */
const EXPRESSION_POSITION_KEYWORDS = new Set([
  "return", "case", "typeof", "in", "of", "yield", "await", "throw", "new",
  "else", "do", "delete", "void", "instanceof",
]);

/** True when `source[index]` sits in JavaScript expression position, as
 * opposed to right after a completed value -- used only to decide whether a
 * `<` seen in JS mode starts a JSX subtree (a comparison, `a < b`, never
 * does) or is a `<`/`<=` operator. Looks at the nearest non-whitespace
 * character before `index` in the *original* `source` (not the
 * already-partly-blanked output, whose spaces wouldn't reflect the real
 * preceding token): expression position is the start of the file, one of the
 * punctuation marks above, one of the keywords above, or the two-character
 * exception `=>` -- a bare `>` (closing a JSX tag, or a `)`/`]`-closed value)
 * is deliberately NOT expression position, since `a > b < c` and `f() < g()`
 * are comparisons, not JSX (Codex, PR #874 round 25; repurposed for `<` in
 * round 33). */
function isExpressionPosition(source: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i--;
  if (i < 0) return true;
  const prevChar = source[i];
  if (prevChar === ">") return i > 0 && source[i - 1] === "=";
  if (prevChar === ")" || prevChar === "]") return false;
  if (EXPRESSION_POSITION_PUNCT.has(prevChar)) return true;
  if (/[\w$]/.test(prevChar)) {
    let start = i;
    while (start >= 0 && /[\w$]/.test(source[start])) start--;
    return EXPRESSION_POSITION_KEYWORDS.has(source.slice(start + 1, i + 1));
  }
  return true;
}

/** Shape a `<` must have, immediately after itself, to even be considered
 * for JSX (an opening tag's name, a fragment's `>`, or a closing tag's
 * `/`) -- checked before `isExpressionPosition` bothers walking backward. */
const JSX_START_RE = /^<(?:[A-Za-z]|>|\/)/;

function blankCommentsAndQuotedJsx(source: string): string {
  const len = source.length;
  const out: string[] = [];

  /** A `"..."`/`'...'` string starting at `i` (`source[i]` is the opening
   * quote): pushes its blanked form (JSX-shaped body spaced out, delimiters
   * and any other body kept verbatim, same rule a template literal's own
   * static chunks use) and returns the index just past the closing quote (or
   * end of source if unterminated). Every quote reached in JS mode is
   * unambiguously a real string -- there is no JSX-text-apostrophe ambiguity
   * left to resolve, since JSX text is its own mode that never calls this at
   * all (Codex, PR #874 round 33). */
  function scanQuotedString(i: number, quote: string): number {
    let j = i + 1;
    while (j < len && source[j] !== quote) {
      j += source[j] === "\\" ? 2 : 1;
    }
    const closed = source[j] === quote;
    const body = source.slice(i + 1, Math.min(j, len));
    const end = closed ? j + 1 : j;
    if (/<[A-Za-z]/.test(body)) {
      out.push(quote, " ".repeat(body.length));
      if (closed) out.push(quote);
    } else {
      out.push(source.slice(i, end));
    }
    return end;
  }

  /** A template literal starting at `i` (`source[i]` is the backtick): each
   * static chunk is blanked the same way a plain string's body is (JSX-shaped
   * -> spaced out); each `${...}` interpolation is hard boundary text (`${`,
   * `}`) around a full recursive `scanJs` call bounded to that interpolation's
   * own matching `}` -- so a comment, string, or nested JSX subtree inside an
   * interpolation is handled by the exact same rules as anywhere else in JS
   * mode, rather than the whole template being treated as one opaque span
   * (Codex, PR #874 round 33). Returns the index just past the closing
   * backtick (or end of source if unterminated). */
  function scanTemplate(i: number): number {
    out.push("`");
    let j = i + 1;
    let chunkStart = j;
    const flushChunk = (end: number) => {
      const body = source.slice(chunkStart, end);
      out.push(/<[A-Za-z]/.test(body) ? " ".repeat(body.length) : body);
    };
    while (j < len) {
      const c = source[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "`") {
        flushChunk(j);
        out.push("`");
        return j + 1;
      }
      if (c === "$" && source[j + 1] === "{") {
        flushChunk(j);
        out.push("${");
        const exprEnd = scanJs(j + 2, "}");
        if (exprEnd < len) {
          out.push("}");
          j = exprEnd + 1;
        } else {
          j = len;
        }
        chunkStart = j;
        continue;
      }
      j++;
    }
    flushChunk(len);
    return len;
  }

  /** A regex literal starting at `i` (`source[i]` is the opening `/`,
   * already confirmed by the caller to be in expression position and not
   * immediately followed by `/` or `*`, which are always a line/block
   * comment in real JS regardless of position -- an empty regex body isn't
   * valid syntax, so `//` can never actually be one). Consumed as a single
   * atomic unit -- delimiters, escapes (`\/` doesn't close it), and a
   * character class's own unescaped `/` (`[/]`, doesn't close it either,
   * only a genuinely unescaped `/` outside `[...]` does) -- plus any
   * trailing flag letters, so none of its internal characters are ever
   * re-examined one at a time by `scanJs`'s own per-character loop, where an
   * escaped-slash pair near the closing delimiter could otherwise line up
   * into what looks like a `//` line-comment start partway through (`const
   * separator = /\/\//;` -- Codex, PR #874 round 43 thread 3). Returns the
   * index just past the literal (delimiters and flags included), or `null`
   * if the line ends (or source runs out) before an unescaped, non-class
   * closing `/` is found -- not actually a regex after all, left for the
   * caller to fall back to treating `source[i]` as an ordinary character. */
  function scanRegexLiteral(i: number): number | null {
    let j = i + 1;
    let inCharClass = false;
    while (j < len) {
      const c = source[j];
      if (c === "\n") return null;
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (c === "[") {
        inCharClass = true;
        j++;
        continue;
      }
      if (c === "]") {
        inCharClass = false;
        j++;
        continue;
      }
      if (c === "/" && !inCharClass) {
        j++;
        while (j < len && /[a-zA-Z]/.test(source[j])) j++;
        return j;
      }
      j++;
    }
    return null;
  }

  /** JS-mode text starting at `i`: comments and strings/templates are real;
   * a `<` in expression position with a JSX-tag shape pushes into
   * `scanJsxElement`. Runs to end of source (`stopChar === null`, the
   * top-level call) or stops -- without consuming it -- at a depth-0
   * occurrence of `stopChar` (used to bound one `{...}` JSX expression
   * container to its own matching `}`). A literal `{` encountered here
   * (an object literal, an arrow block body, a template `${}` -- anything
   * that isn't itself a nested JSX element/expression, which each get their
   * own independent `scanJs` call with its own fresh `depth`) increments a
   * local depth counter so `stopChar` only really ends the call at depth
   * zero -- `{format({}) /* comment *\/}` used to stop at the object
   * literal's own inner `}`, handing the rest of the JSX expression
   * (including the comment) back to the caller as raw, unblanked JSX text
   * (Codex, PR #874 round 36). A string/template's own braces never reach
   * this counter -- `scanQuotedString`/`scanTemplate` consume their whole
   * span as a unit before the per-character loop here ever sees them. A `/`
   * in expression position (`isExpressionPosition`, reused unchanged from
   * its round-25/33 `<`-vs-comparison job -- a `/` is division only right
   * after a value: an identifier, a number, `)`, `]`, or a string, and a
   * regex literal exactly everywhere else) that isn't immediately a `//`/
   * `/*` comment start is a regex literal, consumed whole by
   * `scanRegexLiteral` before this loop's own comment checks ever see its
   * interior characters (Codex, PR #874 round 43 thread 3). Returns the
   * index it stopped at. */
  function scanJs(i: number, stopChar: "}" | null): number {
    let depth = 0;
    while (i < len) {
      const c = source[i];
      if (stopChar !== null && c === stopChar && depth === 0) return i;
      if (c === "/" && source[i + 1] !== "/" && source[i + 1] !== "*" && isExpressionPosition(source, i)) {
        const regexEnd = scanRegexLiteral(i);
        if (regexEnd !== null) {
          out.push(source.slice(i, regexEnd));
          i = regexEnd;
          continue;
        }
      }
      if (c === "/" && source[i + 1] === "/") {
        const nl = source.indexOf("\n", i);
        const end = nl === -1 ? len : nl;
        out.push(" ".repeat(end - i));
        i = end;
        continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        const close = source.indexOf("*/", i + 2);
        const end = close === -1 ? len : close + 2;
        out.push(" ".repeat(end - i));
        i = end;
        continue;
      }
      if (c === '"' || c === "'") {
        i = scanQuotedString(i, c);
        continue;
      }
      if (c === "`") {
        i = scanTemplate(i);
        continue;
      }
      if (c === "<" && JSX_START_RE.test(source.slice(i, i + 2)) && isExpressionPosition(source, i)) {
        i = scanJsxElement(i);
        continue;
      }
      if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      }
      out.push(c);
      i++;
    }
    return i;
  }

  /** One JSX element or fragment starting at `i` (`source[i]` is `<`, shape
   * already confirmed by the caller): the opening tag's attributes (a quoted
   * value scanned like a JS string; a `{expr}` value handed to `scanJs`
   * bounded by its own matching `}`), then -- unless self-closing (`/>`) --
   * the element's children via `scanJsxText`, which itself consumes the
   * matching closing tag before returning. Returns the index just past the
   * whole element. */
  function scanJsxElement(i: number): number {
    out.push("<");
    i++;
    const nameMatch = /^[A-Za-z][\w.:-]*/.exec(source.slice(i));
    if (nameMatch) {
      out.push(nameMatch[0]);
      i += nameMatch[0].length;
    }
    while (i < len) {
      const c = source[i];
      if (c === "/" && source[i + 1] === ">") {
        out.push("/>");
        return i + 2;
      }
      if (c === ">") {
        out.push(">");
        i++;
        break;
      }
      if (c === '"' || c === "'") {
        i = scanQuotedString(i, c);
        continue;
      }
      if (c === "{") {
        out.push("{");
        const exprEnd = scanJs(i + 1, "}");
        if (exprEnd < len) {
          out.push("}");
          i = exprEnd + 1;
        } else {
          i = len;
        }
        continue;
      }
      out.push(c);
      i++;
    }
    return scanJsxText(i);
  }

  /** JSX children starting at `i`, up to and including the enclosing
   * element's own closing tag: no quotes and no comments at all (an
   * apostrophe or a `//` here is just text, Codex, PR #874 round 33) -- only
   * `{` (a child expression, handed to `scanJs` bounded by its own matching
   * `}`, which also covers a `{/* … *\/}` JSX comment: the block-comment
   * check inside `scanJs` fires regardless of what pushed it into JS mode)
   * and `<` (a nested element, or -- on a following `/` -- the closing tag
   * that ends this text run) are special. Returns the index just past the
   * closing tag (or end of source if the element is never closed). */
  function scanJsxText(i: number): number {
    while (i < len) {
      const c = source[i];
      if (c === "{") {
        out.push("{");
        const exprEnd = scanJs(i + 1, "}");
        if (exprEnd < len) {
          out.push("}");
          i = exprEnd + 1;
        } else {
          i = len;
        }
        continue;
      }
      if (c === "<") {
        if (source[i + 1] === "/") {
          const close = source.indexOf(">", i);
          const end = close === -1 ? len : close + 1;
          out.push(source.slice(i, end));
          return end;
        }
        i = scanJsxElement(i);
        continue;
      }
      out.push(c);
      i++;
    }
    return i;
  }

  scanJs(0, null);
  return out.join("");
}

/** `importedDecls` (Codex, PR #874 round 28) are passed straight through to
 * `findElementViolations`; empty by default, so every existing single-file
 * call site is unaffected. */
function scanSourceForViolations(source: string, importedDecls: ConstDecl[] = []): Violation[] {
  const normalized = normalize(blankCommentsAndQuotedJsx(source));
  return [
    ...findElementViolations(normalized, importedDecls),
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

// ─── Cross-file import/export resolution (Codex, PR #874 round 28) ────────
//
// A `className={alertClasses}` bound to an *imported* `export const
// alertClasses = "…animate-pulse…"` was invisible to the census: the file
// that renders it never mentions "animate-pulse" literally (so the
// prefilter skipped it), and even without that, `collectConstTemplateMap`
// only ever sees one file's own declarations. Two passes fix this without
// touching single-file scanning: pass 1 (`collectExportedPulseBindings`)
// finds every exported binding, in every file, whose resolved literal
// contains the pulse class, keyed by a module path both sides can agree on;
// pass 2 (`resolveImportedDecls`) reads one file's `import` statements and,
// for each imported name that resolves to a pass-1 binding, manufactures a
// whole-file-scoped `ConstDecl` carrying that binding's literal/entries, so
// `findElementViolations` resolves it exactly like a local declaration.
// Both are plain functions over an in-memory `{path: source}`-shaped input
// (`Record<string, string>` for pass 1, one file's text for pass 2) so the
// fixture proofs below can drive them without touching disk.

/** The extension-stripped, forward-slash module path for `file` (e.g.
 * `src/lib/a.tsx` -> `"src/lib/a"`), plus -- when `file` is an index file --
 * the alias an importer targeting its directory would resolve to instead
 * (`src/lib/a/index.ts` -> also `"src/lib/a"`), since either spelling can
 * reach the same module. */
function moduleKeysForFile(file: string): string[] {
  const stripped = file.replace(/\.tsx?$/, "");
  const keys = [stripped];
  if (/\/index$/.test(stripped)) keys.push(stripped.replace(/\/index$/, ""));
  return keys;
}

/** Resolves an import specifier written inside `fromFile` to the same kind
 * of module-path key `moduleKeysForFile` produces, or `null` when it's a
 * specifier this scanner doesn't resolve at all -- a bare package name
 * (`"react"`) or an alias other than `@/` (the only one this repo's
 * `tsconfig`/`vite.config` map to `src/`). A relative specifier (`./a`,
 * `../b/c`) is resolved against `fromFile`'s own directory, collapsing `.`/
 * `..` segments by hand (no `path.resolve` -- everything here is a
 * forward-slash `src/...`-relative string, not a real filesystem path). */
function resolveModuleKey(fromFile: string, specifier: string): string | null {
  let target: string;
  if (specifier.startsWith("@/")) {
    target = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const fromDir = fromFile.split("/").slice(0, -1).join("/");
    const parts: string[] = [];
    for (const part of `${fromDir}/${specifier}`.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    target = parts.join("/");
  } else {
    return null;
  }
  return target.replace(/\.tsx?$/, "");
}

/** Maps every name a file exports to the local name it refers to --
 * `export const NAME = …`/`export let|var NAME = …` (name maps to itself),
 * `export { name }`/`export { name as alias }` (alias maps to `name`), and
 * `export default name;` (mapped under the reserved key `"default"`).
 * `source` should already be comment/string-blanked and whitespace-
 * normalized (same convention `collectConstTemplateMap` expects), so a
 * `// export { fake }` inside a comment is never picked up. */
/** Rewrites an inline `export default <expr>;` -- an object literal
 * (`export default { alert: "animate-pulse" }`), a string
 * (`export default "animate-pulse"`), or a template literal with no `${}`
 * -- into a separate `const` declaration followed by `export default
 * <name>;`, before `collectExportedNames`/`collectConstTemplateMap` ever run
 * on this source. This lets the EXISTING identifier-form default-export
 * machinery in both of those (unchanged by this) see and resolve it exactly
 * the way it already resolves `export default someName;`, including through
 * the round-36b spread path for `export default { ...base }`. A module has
 * at most one default export, so this runs at most once per call. `export
 * default function`/`export default class` are left untouched -- neither
 * was ever recognized as an export name at all (this doesn't build a class
 * map), same as before this round -- and the already-correct
 * bare-identifier form (`export default someIdentifier;`) is left untouched
 * too, to avoid adding a redundant indirection (Codex, PR #874 round 37). */
function synthesizeInlineDefaultExports(source: string): string {
  const m = /\bexport\s+default\s+/.exec(source);
  if (!m) return source;
  const exprStart = m.index + m[0].length;
  const rest = source.slice(exprStart);
  if (/^(function|class)(?:[\s(*{]|$)/.test(rest)) return source;
  if (/^[A-Za-z_$][\w$]*\s*;/.test(rest)) return source;
  const exprEnd = findInitializerEnd(source, exprStart);
  const expr = source.slice(exprStart, exprEnd);
  const name = "__round37DefaultExport__";
  return (
    source.slice(0, m.index) +
    `const ${name} = ${expr};\nexport default ${name}` +
    source.slice(exprEnd)
  );
}

/** Every local name a destructuring pattern (as already parsed by
 * `parseDestructuringPattern`) introduces, flattened through a nested
 * pattern (`{ a: { b } }`) however deep, in the same source order
 * `parseDestructuringPattern` returns them in. Used by `collectExportedNames`
 * to register each name an EXPORTED destructuring declarator (`export const
 * { alert } = styles;`, `export const { alert: cls } = styles;`) introduces,
 * the same way a plain `export const NAME = …` already registers `NAME` --
 * an exported destructuring binding used to advance past its own pattern
 * without registering anything at all, so a consumer's `import { alert }
 * from "./m"` had no export entry to resolve against no matter what `styles`
 * itself resolved to (Codex, PR #874 round 39 thread 2). A `...rest` binding
 * (`sourceKey: null`, no `nestedPattern`) falls through to the same
 * `localName` push as any other leaf binding. */
function collectPatternLocalNames(bindings: DestructuringBinding[]): string[] {
  const names: string[] = [];
  for (const binding of bindings) {
    if (binding.nestedPattern) {
      names.push(...collectPatternLocalNames(parseDestructuringPattern(binding.nestedPattern)));
    } else {
      names.push(binding.localName);
    }
  }
  return names;
}

function collectExportedNames(source: string): Map<string, string> {
  const exported = new Map<string, string>();
  // `export const safe = "text-xs", classes = "animate-pulse";` used to
  // register only `safe` -- the old regex captured just the first name after
  // the keyword and never looked past it. Every declarator in the statement
  // is walked instead, reusing `collectConstTemplateMap`'s own round-33
  // comma-declarator-splitting loop: only the NAME is needed here (not a
  // literal/entries), so a destructuring declarator's own pattern/initializer
  // is still scanned past correctly (via the same `extractBalanced`/
  // `findBracketClose`/`skipTypeAnnotation`/`findInitializerEnd` calls). An
  // OBJECT pattern's own bindings (plain, renamed, defaulted, nested one
  // level) are now also registered via `collectPatternLocalNames`, same as
  // `export const NAME = …` registers `NAME` itself -- the value each one
  // resolves to is found later, through the module's own `decls` map, the
  // same way a plain exported name already is (Codex, PR #874 round 35;
  // round 39 thread 2 adds destructuring). An ARRAY pattern (`export const
  // [a] = …`) is still left unregistered -- `ConstEntry` doesn't index an
  // array's own elements at all, the same fail-closed gap round 35 already
  // documented for a non-exported array destructure.
  const keywordRe = /\bexport\s+(?:const|let|var)\s+/g;
  while (keywordRe.exec(source)) {
    let pos = keywordRe.lastIndex;
    for (;;) {
      if (source[pos] === "{" || source[pos] === "[") {
        const open = source[pos];
        const patternStart = pos;
        const patternEnd =
          open === "{" ? extractBalanced(source, pos, "{", "}").endIndex : findBracketClose(source, pos);
        if (open === "{" && patternEnd !== -1) {
          const patternText = source.slice(patternStart, patternEnd + 1);
          for (const name of collectPatternLocalNames(parseDestructuringPattern(patternText))) {
            exported.set(name, name);
          }
        }
        let after = (patternEnd === -1 ? source.length - 1 : patternEnd) + 1;
        while (after < source.length && /\s/.test(source[after])) after++;
        if (source[after] === ":") {
          const typeResult = skipTypeAnnotation(source, after);
          after = typeResult === null ? after + 1 : typeResult.pos;
          if (typeResult?.kind === "initializer") after = findInitializerEnd(source, after);
        } else if (source[after] === "=") {
          let i = after + 1;
          while (i < source.length && /\s/.test(source[i])) i++;
          after = findInitializerEnd(source, i);
        }
        pos = after;
      } else {
        const nameMatch = /^[A-Za-z_$][\w$]*/.exec(source.slice(pos));
        if (!nameMatch) break;
        const name = nameMatch[0];
        exported.set(name, name);
        let after = pos + name.length;
        while (after < source.length && /\s/.test(source[after])) after++;
        if (source[after] === ":") {
          const typeResult = skipTypeAnnotation(source, after);
          if (typeResult === null) {
            pos = after + 1;
            break;
          }
          pos = typeResult.kind === "initializer" ? findInitializerEnd(source, typeResult.pos) : typeResult.pos;
        } else if (source[after] === "=") {
          let i = after + 1;
          while (i < source.length && /\s/.test(source[i])) i++;
          pos = findInitializerEnd(source, i);
        } else if (source[after] === ";" || source[after] === ",") {
          pos = after;
        } else {
          pos = after;
          break;
        }
      }
      while (pos < source.length && /\s/.test(source[pos])) pos++;
      if (source[pos] === ",") {
        pos++;
        while (pos < source.length && /\s/.test(source[pos])) pos++;
        continue;
      }
      break;
    }
    keywordRe.lastIndex = pos;
  }
  const braceRe = /\bexport\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = braceRe.exec(source))) {
    for (const rawSpec of m[1].split(",")) {
      const spec = rawSpec.trim();
      if (!spec) continue;
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(spec);
      if (asMatch) {
        exported.set(asMatch[2], asMatch[1]);
      } else if (/^[A-Za-z_$][\w$]*$/.test(spec)) {
        exported.set(spec, spec);
      }
    }
  }
  const defaultRe = /\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/g;
  while ((m = defaultRe.exec(source))) {
    exported.set("default", m[1]);
  }
  return exported;
}

/** One `export ... from "…"` re-export statement -- a binding this file
 * forwards without ever declaring it itself: `export { a, b as c } from
 * "./mod"` (`kind: "named"`, `names` maps the exported-here name to the
 * name in the source module), `export * from "./mod"` (`kind: "star"`,
 * every one of the source module's own exports forwarded under its own
 * name), or `export * as ns from "./mod"` (`kind: "starAs"`, the whole
 * module re-exported as a single namespace binding named `ns`). `source`
 * should already be comment/string-blanked and whitespace-normalized, same
 * convention as `collectExportedNames` (Codex, PR #874 round 30). */
interface ReExportStatement {
  kind: "named" | "star" | "starAs";
  specifier: string;
  names: Map<string, string>;
  namespaceName?: string;
}

function collectReExportStatements(source: string): ReExportStatement[] {
  const statements: ReExportStatement[] = [];
  const starAsRe = /\bexport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = starAsRe.exec(source))) {
    statements.push({ kind: "starAs", specifier: m[2], names: new Map(), namespaceName: m[1] });
  }
  const starRe = /\bexport\s*\*\s*from\s*["']([^"']+)["']/g;
  while ((m = starRe.exec(source))) {
    statements.push({ kind: "star", specifier: m[1], names: new Map() });
  }
  const namedRe = /\bexport\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  while ((m = namedRe.exec(source))) {
    const names = new Map<string, string>();
    for (const rawSpec of m[1].split(",")) {
      const spec = rawSpec.trim();
      if (!spec) continue;
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(spec);
      if (asMatch) names.set(asMatch[2], asMatch[1]);
      else if (/^[A-Za-z_$][\w$]*$/.test(spec)) names.set(spec, spec);
    }
    statements.push({ kind: "named", specifier: m[2], names });
  }
  return statements;
}

/** Cheap, deliberately loose text check for "this file has at least one
 * `export ... from "…"` re-export statement" -- used only to decide
 * whether pass 1 below bothers normalizing and parsing a file that doesn't
 * literally contain the pulse class itself, the same way `rawSource.
 * includes(PULSE_CLASS)` already does for a direct export; a barrel file
 * forwarding another module's pulsing export never mentions the class
 * literally on its own (Codex, PR #874 round 30). */
const REEXPORT_HINT_RE = /\bexport\s*(?:\*|\{[^}]*\})\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?from\s*["']/;

/** Pass 1: every exported member of every file in `sources` that has AT
 * LEAST ONE pulsing export -- keyed first by the exporting module's path key
 * (`moduleKeysForFile`), then by the exported name. A file that doesn't
 * literally contain `"animate-pulse"` can't possibly export a binding that
 * does (the class name has to appear as a literal *somewhere* in the file
 * for `collectConstTemplateMap` to find it), so it's skipped outright --
 * this keeps pass 1 as cheap as the existing single-file prefilter, just run
 * once up front instead of once per file that happens to import from it.
 * Only a file's own module-level declarations (whole-file scope, per
 * `collectConstTemplateMap`) are ever exportable; a function-local
 * same-named const is never in scope for `export { name }` to reach.
 *
 * Round 37: a qualifying file's map holds EVERY one of its exported members,
 * not just the pulsing ones -- a non-pulsing sibling's own resolved (clean)
 * literal has to be here for a namespace import/re-export's per-member
 * narrowing (`ns.safe`) to resolve precisely instead of falling back to the
 * namespace's own aggregate literal, which still carries a pulsing sibling's
 * class and would otherwise flag the clean member too. A plain named import
 * of a non-pulsing sibling still resolves to that clean literal either way,
 * so this doesn't change what a direct `import { safe }` flags -- only what
 * a `* as ns` map has available to narrow against.
 *
 * A second stage then follows every `export ... from "…"` re-export
 * statement (a barrel: `styles.ts` declares `alertClasses`, `index.ts` has
 * `export { alertClasses } from "./styles"`, and a component imports
 * `alertClasses` from `index`) -- `REEXPORT_HINT_RE` widens the file
 * prefilter to also cover a barrel with no literal `"animate-pulse"` of its
 * own, and bindings are propagated to a fixpoint (bounded at 10 passes, a
 * generous multiple of any real barrel chain depth, so a re-export cycle
 * can't loop forever) so a two-level barrel chain resolves the same as a
 * one-level one, INCLUDING a non-pulsing member riding along (round 37: the
 * `"star"`/`"named"` branches below have always just copied whatever's in
 * the source module's map verbatim, with no pulse-ness filter of their own
 * -- once that map itself carries every member, so does a barrel's copy of
 * it, with no changes needed to the copy itself). `export * as ns from "…"`
 * registers `ns` in the re-exporting file's own map as an object binding
 * whose `entries` mirror EVERY one of the source module's exports (not just
 * its pulsing ones -- same round-37 fix, and again no change needed to the
 * copy itself), the same shape a `namespace` *import* already builds in
 * `resolveImportedDecls` (Codex, PR #874 round 30).
 *
 * A third stage then follows a module's own IMPORTS the same way the second
 * stage follows a barrel's re-export statements: `a.ts` exports a pulsing
 * binding, `b.ts` imports it and re-exports a local alias under a new name
 * (`import { pulse } from "./a"; export const classes = pulse;`) -- not a
 * re-export statement, so invisible to stage two, and never containing the
 * pulse class literally in its own text, so invisible to stage one. Every
 * import+export-bearing file is a candidate, resolved through
 * `resolveImportedDecls` against the current `byModule` and interleaved into
 * the same fixpoint loop as stage two, since either stage's addition can
 * unlock the other's next pass (Codex, PR #874 round 33). */

/** Round 36b: whether ANY entry in `entries`, at any depth, resolves to a
 * literal carrying the pulse class -- used alongside a flattened `decl.
 * literal` check (below) so an object-valued export that is ONLY a spread of
 * a pulsing source, `export const mid = { ...base };`, is still caught. Its
 * own `decl.literal` never gets the pulse class folded in: `extractLiteralBodies`
 * only sees quoted text physically written inside the initializer, and
 * `{ ...base }` has none of its own -- the pulse class only ever reaches
 * `mid` through `entries`, since `collectConstTemplateMap`'s spread merge
 * (round 34/36, and round 36b's nested version) already copied `base`'s own
 * resolved entries onto `mid`. Each entry's own literal is resolved the same
 * way a decl's is, so an entry that is itself an identifier-only alias
 * folded via round 33's ref-folding still resolves through `decls`. Guarded
 * by `seen` against revisiting the same `ConstEntry` object twice, since
 * spread merging can make two different parents share one entry by
 * reference, and a spread cycle across modules (`a = { ...b }`, `b = { ...a
 * }`) would otherwise recurse forever. */
function entriesHavePulseClass(
  entries: Map<string, ConstEntry> | undefined,
  decls: ConstDecl[],
  atIndex: number,
  seen: Set<ConstEntry> = new Set(),
): boolean {
  if (!entries) return false;
  for (const entry of entries.values()) {
    if (seen.has(entry)) continue;
    seen.add(entry);
    const resolved = resolveConstRefs(entry.literal, decls, atIndex);
    if (PULSE_CLASS_RE.test(resolved)) return true;
    if (entriesHavePulseClass(entry.entries, decls, atIndex, seen)) return true;
  }
  return false;
}

function collectExportedPulseBindings(
  sources: Record<string, string>,
): Map<string, Map<string, ConstDecl>> {
  const byModule = new Map<string, Map<string, ConstDecl>>();
  for (const [file, rawSource] of Object.entries(sources)) {
    if (!rawSource.includes(PULSE_CLASS)) continue;
    const source = synthesizeInlineDefaultExports(normalize(blankCommentsAndQuotedJsx(rawSource)));
    const exportedNames = collectExportedNames(source);
    if (exportedNames.size === 0) continue;
    const decls = collectConstTemplateMap(source);
    const moduleLevelByName = new Map<string, ConstDecl>();
    for (const decl of decls) {
      if (decl.scopeStart !== 0 || decl.scopeEnd !== source.length) continue;
      const existing = moduleLevelByName.get(decl.name);
      if (!existing || decl.index < existing.index) moduleLevelByName.set(decl.name, decl);
    }
    // Round 37: this module's own map (stored into `byModule` below) now
    // carries EVERY exported member, not just the ones that turn out to be
    // pulsing -- a namespace import/re-export (`* as ns`, direct or through
    // `export * as ns from`) builds its own `entries` map by copying
    // whatever is here verbatim (see `resolveImportedDecls`'s `nsMatch`
    // branch and the barrel loop's `stmt.namespaceName` branch below, both
    // unchanged by this round), so a non-pulsing sibling (`ns.safe`) has to
    // already be here, with its own resolved (clean) literal, for that copy
    // to narrow precisely instead of falling back to the namespace's
    // aggregate literal -- which DOES still carry a pulsing sibling's class
    // and would otherwise flag `ns.safe` as a false positive. A plain named
    // import of a non-pulsing sibling (`import { safe } from "./m"`) is
    // unaffected: it now gets its own decl registered too, but that decl's
    // own resolved literal has no pulse class either, so nothing downstream
    // that decides a violation by testing the RESOLVED text ever flags it
    // (Codex, PR #874 round 37).
    const moduleExports = new Map<string, ConstDecl>();
    let hasPulsing = false;
    for (const [exportedName, localName] of exportedNames) {
      const decl = moduleLevelByName.get(localName);
      if (!decl) continue;
      // `decl.literal` may itself be nothing but an unresolved alias chain
      // (`export const alertClasses = pulse;` -> literal `"pulse"`, or
      // `export const alertClasses = STYLES.alert;` -> literal
      // `"STYLES.alert"`, per round 29's identifier-ref folding in
      // `collectConstTemplateMap`) with no `animate-pulse` substring of its
      // own -- filtering on the raw literal missed both shapes entirely.
      // Resolved here through the module's own full `decls` map with the
      // same recursive, cycle-guarded `resolveConstRefs`/`resolveMemberAccess`
      // walk a reference site already gets, and the RESOLVED text (not the
      // raw alias chain) is what gets stored in the export map, so a
      // consumer never needs the exporter's own private `decls` to see
      // through it (Codex, PR #874 round 31).
      const resolvedLiteral = resolveConstRefs(decl.literal, decls, decl.index);
      moduleExports.set(exportedName, { ...decl, literal: resolvedLiteral });
      // Round 36b: also checked recursively through `decl.entries`, not just
      // the flattened `resolvedLiteral` -- an object-valued export that is
      // ONLY a spread of a local pulsing map (`export const mid = { ...base
      // };`) never gets the pulse class into its own flattened literal (see
      // `entriesHavePulseClass`), but this module's own file DOES contain
      // the pulse class literally (in `base`'s own initializer), so this
      // file already passed the `rawSource.includes(PULSE_CLASS)` prefilter
      // above -- this is the case stage one CAN catch, given the gate looks
      // deep enough. This flag only decides whether the FILE is worth
      // keeping at all (below) -- it no longer gates which members make it
      // into `moduleExports` (round 37).
      if (PULSE_CLASS_RE.test(resolvedLiteral) || entriesHavePulseClass(decl.entries, decls, decl.index)) {
        hasPulsing = true;
      }
    }
    if (!hasPulsing) continue;
    for (const key of moduleKeysForFile(file)) {
      byModule.set(key, moduleExports);
    }
  }

  const reExportsByFile = new Map<string, ReExportStatement[]>();
  for (const [file, rawSource] of Object.entries(sources)) {
    if (!rawSource.includes(PULSE_CLASS) && !REEXPORT_HINT_RE.test(rawSource)) continue;
    const source = normalize(blankCommentsAndQuotedJsx(rawSource));
    const statements = collectReExportStatements(source);
    if (statements.length > 0) reExportsByFile.set(file, statements);
  }

  // Third stage (Codex, PR #874 round 33): a module that only becomes
  // pulsing by IMPORTING a currently-pulsing binding and re-exporting a
  // local alias of it under its own name -- `import { pulse } from "./a";
  // export const classes = pulse;` -- is invisible to both passes above:
  // it's not a re-export statement (`reExportsByFile` never sees it, since
  // `collectReExportStatements` only recognizes `export ... from "…"`), and
  // its own file never contains the pulse class literally (only the
  // imported alias's name does), so the direct-export loop's own
  // `rawSource.includes(PULSE_CLASS)` prefilter skips it outright. Every
  // file with at least one `import` AND one `export` statement is a
  // candidate for this -- computed once here, since a file's own local
  // decls/exported names never change across iterations, only whether its
  // imports currently resolve to something pulsing does. Each iteration
  // below, a candidate whose imports resolve (via `resolveImportedDecls`,
  // round 28) to at least one binding in the current `byModule` gets its
  // own exported names checked against its local decls PLUS those imported
  // ones, through the same recursive `resolveConstRefs` walk pass 1 already
  // uses for a file's purely local exports.
  const importAliasCandidates: Array<{
    file: string;
    rawSource: string;
    normalizedSource: string;
    exportedNames: Map<string, string>;
  }> = [];
  for (const [file, rawSource] of Object.entries(sources)) {
    if (!/\bimport\b/.test(rawSource) || !/\bexport\b/.test(rawSource)) continue;
    const normalizedSource = synthesizeInlineDefaultExports(normalize(blankCommentsAndQuotedJsx(rawSource)));
    const exportedNames = collectExportedNames(normalizedSource);
    if (exportedNames.size === 0) continue;
    importAliasCandidates.push({ file, rawSource, normalizedSource, exportedNames });
  }

  // Interleaved with the barrel loop below (both run every iteration,
  // sharing the same `changed` flag and iteration cap): an addition from
  // either mechanism can unlock the other's next pass -- a barrel
  // re-exporting an alias only this import mechanism resolves, or this
  // mechanism resolving something only a prior barrel pass added.
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    for (const [file, statements] of reExportsByFile) {
      const destKeys = moduleKeysForFile(file);
      let destPulsing = byModule.get(destKeys[0]);
      for (const stmt of statements) {
        const moduleKey = resolveModuleKey(file, stmt.specifier);
        if (moduleKey === null) continue;
        const sourcePulsing = byModule.get(moduleKey);
        if (!sourcePulsing) continue;
        if (stmt.kind === "star") {
          for (const [exportedName, decl] of sourcePulsing) {
            if (destPulsing?.has(exportedName)) continue;
            destPulsing ??= new Map();
            destPulsing.set(exportedName, decl);
            changed = true;
          }
        } else if (stmt.kind === "named") {
          for (const [localName, nameInSource] of stmt.names) {
            const decl = sourcePulsing.get(nameInSource);
            if (!decl || destPulsing?.has(localName)) continue;
            destPulsing ??= new Map();
            destPulsing.set(localName, decl);
            changed = true;
          }
        } else if (stmt.namespaceName) {
          const entries = new Map<string, ConstEntry>();
          for (const [exportedName, decl] of sourcePulsing) {
            entries.set(exportedName, { literal: decl.literal, entries: decl.entries });
          }
          const nsDecl: ConstDecl = {
            name: stmt.namespaceName,
            index: 0,
            literal: [...sourcePulsing.values()].map((decl) => decl.literal).join(" "),
            entries,
            scopeStart: 0,
            scopeEnd: 0,
          };
          const existing = destPulsing?.get(stmt.namespaceName);
          if (existing && existing.literal === nsDecl.literal && existing.entries?.size === entries.size) {
            continue;
          }
          destPulsing ??= new Map();
          destPulsing.set(stmt.namespaceName, nsDecl);
          changed = true;
        }
      }
      if (destPulsing) {
        for (const key of destKeys) byModule.set(key, destPulsing);
      }
    }

    for (const candidate of importAliasCandidates) {
      const importedDecls = resolveImportedDecls(candidate.file, candidate.rawSource, byModule);
      if (importedDecls.length === 0) continue;
      // Recomputed fresh every iteration (Codex, PR #874 round 36): a
      // spread-based object export (`export const styles = { ...importedBase
      // };`) only picks up an imported source's keys through
      // `collectConstTemplateMap`'s OWN internal spread-merge step, which
      // resolves `visibleDecl` lookups against whatever `importedDecls` array
      // it is given at call time. A `localDecls`/`moduleLevelByName` pair
      // cached once, before any import resolved, can never see a later
      // iteration's newly-resolved imports -- an object literal's `.literal`
      // never contains an identifier ref for `resolveConstRefs` to substitute
      // after the fact, so the merge must happen inside this call, not after
      // it. Rebuilding both here, passing this iteration's `importedDecls`
      // through, lets a newly-unlocked import retroactively complete an
      // object-valued export's spread merge.
      const localDecls = collectConstTemplateMap(candidate.normalizedSource, importedDecls);
      const moduleLevelByName = new Map<string, ConstDecl>();
      for (const decl of localDecls) {
        if (decl.scopeStart !== 0 || decl.scopeEnd !== candidate.normalizedSource.length) continue;
        const existing = moduleLevelByName.get(decl.name);
        if (!existing || decl.index < existing.index) moduleLevelByName.set(decl.name, decl);
      }
      const combinedDecls = [...localDecls, ...importedDecls];
      const destKeys = moduleKeysForFile(candidate.file);
      let destPulsing = byModule.get(destKeys[0]);
      // Round 41 thread 2: resolve every exported name FIRST, and only
      // decide afterward whether to keep any of them -- mirroring stage
      // one's own `hasPulsing` flag (round 37), which keeps EVERY exported
      // member of a module once ANY of them pulses, rather than filtering
      // key-by-key. Before this round, the loop below tested each
      // export's own resolved literal independently and skipped straight
      // to the next one when it came up clean, so a clean sibling export
      // living alongside a pulsing one via this import-alias path (`import
      // { pulse } from "./a"; export const alert = pulse; export const
      // safe = "text-green";`) never made it into `byModule`'s copy at
      // all. A namespace import/re-export of that module then had no
      // `safe` entry to narrow against, so `ns.safe` fell back to the
      // namespace's own aggregate literal -- which DOES still carry
      // `alert`'s pulsing class -- and was wrongly flagged, exactly the
      // false positive stage one's own round-37 fix already closed for a
      // module's directly-written exports.
      const resolvedByName = new Map<string, { decl: ConstDecl; literal: string }>();
      let candidateHasPulsing = false;
      for (const [exportedName, localName] of candidate.exportedNames) {
        if (destPulsing?.has(exportedName)) continue;
        const decl = moduleLevelByName.get(localName);
        if (!decl) continue;
        const resolvedLiteral = resolveConstRefs(decl.literal, combinedDecls, decl.index);
        resolvedByName.set(exportedName, { decl, literal: resolvedLiteral });
        // Round 36b: same recursive `entries` check as stage one's gate,
        // needed here for the exact case stage one's own
        // `rawSource.includes(PULSE_CLASS)` prefilter skips outright -- a
        // module whose only pulsing content comes from an IMPORTED spread
        // source (`export const mid = { ...importedBase };`) never contains
        // the pulse class literally in its own text, so it never reaches
        // this gate at all through stage one; it only ever gets here because
        // this stage's own candidate list (`importAliasCandidates`, built
        // from a `/\bimport\b/ && /\bexport\b/` regex) is independent of
        // that prefilter.
        if (PULSE_CLASS_RE.test(resolvedLiteral) || entriesHavePulseClass(decl.entries, combinedDecls, decl.index)) {
          candidateHasPulsing = true;
        }
      }
      if (candidateHasPulsing) {
        for (const [exportedName, { decl, literal }] of resolvedByName) {
          destPulsing ??= new Map();
          destPulsing.set(exportedName, { ...decl, literal });
          changed = true;
        }
      }
      if (destPulsing) {
        for (const key of destKeys) byModule.set(key, destPulsing);
      }
    }
  }

  return byModule;
}

/** One `import` statement's clause (everything between `import`/`import
 * type` and ` from`) and its specifier string, e.g. `{ clause: "{ a, b as
 * c }", specifier: "@/lib/a" }` for `import { a, b as c } from "@/lib/a"`.
 * Spans multiple lines (`[\s\S]*?`, non-greedy up to the nearest ` from
 * "…"`). A leading `type` -- `import type { X } from "…"` -- is a
 * type-only import; skipped here entirely, since a type is never a
 * `ConstDecl`. */
function parseImportClauses(source: string): Array<{ clause: string; specifier: string }> {
  const results: Array<{ clause: string; specifier: string }> = [];
  const importRe = /\bimport\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source))) {
    if (m[1]) continue;
    results.push({ clause: m[2].trim(), specifier: m[3] });
  }
  return results;
}

/** Pass 2: every extra `ConstDecl` `file`'s own `import` statements bring
 * into scope, resolved against `exportsMap` (pass 1's output) -- a named
 * import (`{ a, b as c }`) registers the local name with the exported
 * binding's literal/entries directly; a default import (`import d from
 * "…"`) does the same under the reserved `"default"` key; a namespace
 * import (`* as ns`) registers `ns` as an object decl whose `entries` map
 * EVERY one of the module's exports (not just its pulsing ones -- round 37;
 * `exportsMap`'s own per-module map already carries every member, and this
 * branch has always just copied it verbatim), so `ns.alertClasses` still
 * resolves through the existing dotted member-access chain
 * (`resolveMemberAccess`), and `ns.safe` (a non-pulsing sibling) narrows to
 * its own clean literal instead of falling back to `ns`'s aggregate one.
 * Every registered decl gets the whole file as its
 * scope (`scopeStart: 0, scopeEnd: source.length`) and `index: 0` -- an
 * imported binding has no meaningful declaration offset in *this* file, and
 * none of the offsets `Violation`/anchor matching use ever come from an
 * import (Codex, PR #874 round 28). An unresolvable specifier (a package, or
 * an alias other than `@/`) is ignored, same as one that resolves to a
 * module with no pulsing exports at all.
 *
 * A leading default binding (`import def, * as ns from "…"`) is split off
 * BEFORE the namespace-clause match below is attempted (Codex, PR #874
 * round 42 thread 2) -- previously `nsMatch`'s anchored `^\*\s+as\s+…$`
 * pattern only ever matched a clause that STARTS with `*`, so `def, * as
 * ns` fell all the way through to the brace-based default/named path below,
 * whose own `defaultName` derivation (`clause.slice(0, braceMatch.index)`)
 * only works when the clause actually HAS a `{...}` to anchor before; with
 * none here, the WHOLE clause (`"def, * as ns"`) was taken as one bogus
 * default name, silently registering neither a usable default binding NOR
 * the namespace object at all, so `ns.alert` stayed unresolved. The brace
 * form (`import def, { a, b as c } from "…"`) already worked before this
 * round by the same accident in reverse -- `braceMatch` anchors on the
 * FIRST `{` in the clause regardless of what precedes it, so `clause.slice(
 * 0, braceMatch.index)` already yields exactly `"def, "` -- so only the
 * namespace form needed this split. */
function resolveImportedDecls(
  file: string,
  rawSource: string,
  exportsMap: Map<string, Map<string, ConstDecl>>,
): ConstDecl[] {
  const source = normalize(blankCommentsAndQuotedJsx(rawSource));
  const extra: ConstDecl[] = [];
  for (const { clause, specifier } of parseImportClauses(source)) {
    const moduleKey = resolveModuleKey(file, specifier);
    if (moduleKey === null) continue;
    const pulsing = exportsMap.get(moduleKey);
    if (!pulsing) continue;

    // Only a clause that starts with a bare identifier immediately followed
    // by a `,` can carry a leading default binding -- `{ a, b as c }` and
    // `* as ns` clauses (with no default) both start with `{`/`*`, which
    // this can never match, so a named-only or namespace-only clause is
    // completely unaffected by this split.
    const leadingDefaultMatch = /^([A-Za-z_$][\w$]*)\s*,\s*([\s\S]*)$/.exec(clause);
    const namespaceClause = leadingDefaultMatch ? leadingDefaultMatch[2].trim() : clause;

    const nsMatch = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(namespaceClause);
    if (nsMatch) {
      if (leadingDefaultMatch) {
        const defaultDecl = pulsing.get("default");
        if (defaultDecl) {
          extra.push({ ...defaultDecl, name: leadingDefaultMatch[1], index: 0, scopeStart: 0, scopeEnd: source.length });
        }
      }
      const entries = new Map<string, ConstEntry>();
      for (const [exportedName, decl] of pulsing) {
        entries.set(exportedName, { literal: decl.literal, entries: decl.entries });
      }
      extra.push({
        name: nsMatch[1],
        index: 0,
        literal: [...pulsing.values()].map((decl) => decl.literal).join(" "),
        entries,
        scopeStart: 0,
        scopeEnd: source.length,
      });
      continue;
    }

    const braceMatch = /\{([^}]*)\}/.exec(clause);
    const defaultName = (braceMatch ? clause.slice(0, braceMatch.index) : clause)
      .replace(/,\s*$/, "")
      .trim();
    if (defaultName) {
      const decl = pulsing.get("default");
      if (decl) {
        extra.push({ ...decl, name: defaultName, index: 0, scopeStart: 0, scopeEnd: source.length });
      }
    }
    if (braceMatch) {
      for (const rawSpec of braceMatch[1].split(",")) {
        const spec = rawSpec.trim();
        if (!spec) continue;
        const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(spec);
        const importedName = asMatch ? asMatch[1] : spec;
        const localName = asMatch ? asMatch[2] : spec;
        const decl = pulsing.get(importedName);
        if (decl) {
          extra.push({ ...decl, name: localName, index: 0, scopeStart: 0, scopeEnd: source.length });
        }
      }
    }
  }
  return extra;
}

/** The fixture-testable entry point: scans one module's source for
 * violations with its imported pulse-class bindings (resolved against
 * `exportsMap`, pass 1's output over some in-memory `{path: source}` set)
 * merged in, exactly the way the census below merges them in for a real
 * `src/` file. */
function scanModuleForViolations(
  file: string,
  source: string,
  exportsMap: Map<string, Map<string, ConstDecl>>,
): Violation[] {
  return scanSourceForViolations(source, resolveImportedDecls(file, source, exportsMap));
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

interface AnchorPosition {
  anchorIndex: number;
  windowStart: number;
  windowEnd: number;
}

/** Matches each anchor in `anchors` to at most one violation in `violations`
 * by a maximum bipartite matching (Kuhn's augmenting-path algorithm) over
 * the "anchor window covers violation" edges, so a single anchor can no
 * longer vouch for a second, distinct pulsing element that merely happens to
 * sit in the same `ANCHOR_WINDOW_RADIUS` window (Codex, PR #874 round 20),
 * AND every violation reachable through *some* one-to-one assignment gets
 * one, even when the nearest-pair-first greedy would have consumed the only
 * anchor a later violation could reach (Codex, PR #874 round 21: two
 * ten-character anchors at offsets 0 and 10, violations at 10 and 171 --
 * violation 1 is nearest to anchor 2, but anchor 1 -> violation 1 and
 * anchor 2 -> violation 2 covers both, which the greedy's exact-nearest-pair
 * consumption could never find since it fixed violation 1 to anchor 2 before
 * violation 2 was ever considered). Deterministic: violations are tried in
 * source order (`violations` as given), each violation's candidate anchors
 * (in ledger order from `anchors`) are attempted nearest-distance-first so
 * an augmenting path explores the same edge order the old greedy would have
 * preferred. Sizes here are always tiny (a handful of anchors per file), so
 * a plain O(V*E) Kuhn's is simpler than Hopcroft-Karp and just as fast in
 * practice. Pure/synthetic-input-friendly on purpose, so it can be
 * unit-tested directly without touching the real `AUDITED_SITES`/
 * `KNOWN_REMAINING_SITES` tables; `coveredViolations` below is the thin
 * wrapper the census actually calls. Returns the subset of `violations`
 * that got their own unconsumed anchor -- every violation NOT in this set
 * is, by definition, unlisted. A registered anchor that matches no
 * violation (a stale entry) is simply left unconsumed here; that case is
 * covered separately by the "every KNOWN_REMAINING_SITES anchored element
 * still pulses" freshness test. */
function matchAnchorsToViolations(
  normalizedContent: string,
  anchors: string[],
  violations: Violation[],
): Set<Violation> {
  const anchorPositions: AnchorPosition[] = [];
  for (const anchor of anchors) {
    const anchorNorm = normalize(anchor);
    const anchorIndex = normalizedContent.indexOf(anchorNorm);
    if (anchorIndex === -1) continue;
    anchorPositions.push({
      anchorIndex,
      windowStart: Math.max(0, anchorIndex - ANCHOR_WINDOW_RADIUS),
      windowEnd: anchorIndex + anchorNorm.length + ANCHOR_WINDOW_RADIUS,
    });
  }

  // Each violation's candidate anchors, nearest distance first (ties by
  // anchor position, matching ledger order for anchors at the same
  // distance) -- the order an augmenting-path search tries edges in.
  const candidatesByViolation = new Map<Violation, AnchorPosition[]>();
  for (const violation of violations) {
    const candidates = anchorPositions
      .filter(
        (anchorPos) =>
          violation.index >= anchorPos.windowStart && violation.index <= anchorPos.windowEnd,
      )
      .sort(
        (a, b) =>
          Math.abs(violation.index - a.anchorIndex) - Math.abs(violation.index - b.anchorIndex) ||
          a.anchorIndex - b.anchorIndex,
      );
    candidatesByViolation.set(violation, candidates);
  }

  const matchOfAnchor = new Map<AnchorPosition, Violation>();

  function tryAugment(violation: Violation, visited: Set<AnchorPosition>): boolean {
    for (const anchorPos of candidatesByViolation.get(violation) ?? []) {
      if (visited.has(anchorPos)) continue;
      visited.add(anchorPos);
      const incumbent = matchOfAnchor.get(anchorPos);
      if (!incumbent || tryAugment(incumbent, visited)) {
        matchOfAnchor.set(anchorPos, violation);
        return true;
      }
    }
    return false;
  }

  for (const violation of violations) {
    tryAugment(violation, new Set());
  }

  return new Set(matchOfAnchor.values());
}

/** Builds the text `matchAnchorsToViolations` searches for `anchors` in:
 * the same blanked-then-normalized text `scanSourceForViolations` computes
 * violation indices from, with each anchor's own span spliced back in at
 * its original (pre-blank) raw position. `blankCommentsAndQuotedJsx` is
 * same-length at the raw-character level and untouched outside a spliced
 * span, so every position *before* a splice matches the blanked-normalized
 * text exactly; the splice only re-lengthens the normalized text from that
 * point on (a whole blanked comment collapses to one normalized space,
 * while its restored anchor text does not), which can shift a downstream
 * violation's apparent distance from the anchor by roughly the anchor's own
 * length. That's well inside `ANCHOR_WINDOW_RADIUS` for the short
 * human-written anchors this ledger uses, so the window-based matcher below
 * still pairs them correctly (Codex, PR #874 round 23: blanking comments to
 * stop them from being read as real elements also erased the four ledger
 * anchors written as `{/* descriptive comment *\/}` text; restoring just the
 * anchor's own span -- not exempting `{/* *\/}` from blanking in general,
 * and not re-anchoring those four entries -- keeps both fixed). */
function buildAnchorMatchingContent(raw: string, anchors: string[]): string {
  let patched = blankCommentsAndQuotedJsx(raw);
  for (const anchor of anchors) {
    const rawIndex = raw.indexOf(anchor);
    if (rawIndex === -1) continue;
    patched =
      patched.slice(0, rawIndex) +
      raw.slice(rawIndex, rawIndex + anchor.length) +
      patched.slice(rawIndex + anchor.length);
  }
  return normalize(patched);
}

/** Thin wrapper around `matchAnchorsToViolations` for `file`'s registered
 * anchors -- what the census below actually calls. */
function coveredViolations(
  file: string,
  raw: string,
  violations: Violation[],
): Set<Violation> {
  const anchors = registeredAnchorsFor(file);
  return matchAnchorsToViolations(buildAnchorMatchingContent(raw, anchors), anchors, violations);
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
  const files = listSourceFiles(SRC_ROOT);
  // Pass 1 (Codex, PR #874 round 28): every exported binding, in every file,
  // whose literal contains the pulse class -- computed once for the whole
  // census run (not once per importing file) so a hot export isn't re-parsed
  // for each of its consumers.
  const sources: Record<string, string> = {};
  for (const file of files) sources[file] = readRaw(file);
  const exportsMap = collectExportedPulseBindings(sources);
  for (const file of files) {
    const raw = sources[file];
    // Pass 2: this file's own imports resolved against pass 1 -- empty for
    // the overwhelming majority of files (no import reaches a pulsing
    // export), cheap regex work when it isn't.
    const extraDecls = resolveImportedDecls(file, raw, exportsMap);
    if (!raw.includes(PULSE_CLASS) && extraDecls.length === 0) continue;
    const violations = scanSourceForViolations(raw, extraDecls);
    const covered = coveredViolations(file, raw, violations);
    for (const violation of violations) {
      if (!covered.has(violation)) {
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

  it("never mistakes animate-pulse-slow, animate-pulsed, or not-animate-pulse for the real Tailwind pulse class (#874 round 38 thread 3)", () => {
    // `PULSE_CLASS_RE` used to only special-case `-glow`, leaving any other
    // word/hyphen-adjacent suffix or prefix free to match as a substring.
    // Verified red on revert against d06d87a0: the old regex
    // (`animate-pulse(?!-glow)`) matches all three of these, so the old
    // parser flags each as a violation.
    for (const cls of ["animate-pulse-slow", "animate-pulsed", "not-animate-pulse"]) {
      const fixture = `<span className="text-alert-red ${cls}">Critical</span>`;
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
  });

  it("still catches the real pulse class plain and through a variant prefix (round 38 thread 3, non-regression)", () => {
    // Not red-on-revert by itself (the old regex already caught all three
    // shapes here, having no leading-boundary check at all) -- proves the
    // widened boundary that fixes the false positives above didn't cost any
    // of these true positives.
    for (const fixture of [
      '<span className="text-alert-red animate-pulse">Critical</span>',
      '<span className="text-alert-red md:animate-pulse">Critical</span>',
      '<span className="text-alert-red group-hover:animate-pulse">Critical</span>',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
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

  it("resolves a let-bound class string, plain or var, the same as a const", () => {
    // The `ConstDecl` collector only ever recognised `const`, so a `let`
    // (or `var`) class binding was invisible to `visibleDecl` no matter
    // what it resolved to (Codex, PR #874 round 26).
    for (const fixture of [
      'let classes = "text-alert-red animate-pulse"; return <span className={classes}>Critical</span>;',
      'var classes = "text-alert-red animate-pulse"; return <span className={classes}>Critical</span>;',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
    }
  });

  it("unions in a let-bound class string's later reassignment (+=), fail closed over conditional flow", () => {
    const fixture =
      'let classes = "text-xs"; if (critical) classes += " text-alert-red animate-pulse"; return <span className={classes}>Critical</span>;';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("unions in a let-bound class string's later plain reassignment too, even though it looks like full replacement", () => {
    // The declaration's own literal ("text-alert-red animate-pulse") and
    // the reassignment's literal ("text-xs") are both kept -- this scanner
    // doesn't trace control flow to know only one of them ever actually
    // renders, so it unions everything ever assigned (fail closed) rather
    // than guessing the reassignment always wins (Codex, PR #874 round 26).
    const fixture =
      'let classes = "text-alert-red animate-pulse"; classes = "text-xs"; return <span className={classes}>Critical</span>;';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not treat a nested function's own let declaration of the same name as a reassignment of the outer binding", () => {
    // The reassignment-sweep regex can't tell `let classes =` (a NEW,
    // inner-scoped declaration) from `classes =` (a real reassignment of
    // the outer `classes`) by text shape alone -- both end in "classes",
    // optional whitespace, "=". Before this fix the inner declaration's own
    // "animate-pulse" literal got unioned into the OUTER `classes` binding's
    // literal set, even though the outer binding is never actually assigned
    // that value; the two are unrelated, shadowed declarations of the same
    // name (Codex, PR #874 round 31).
    const fixture =
      'let classes = "text-alert-red"; function inner() { let classes = "animate-pulse"; return null; } return <span className={classes}>Critical</span>;';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still unions a nested function's genuine reassignment (no declaration of its own) into the outer binding", () => {
    // Unlike the previous fixture, `inner` here never declares its own
    // `classes` -- `classes += " animate-pulse"` is a real reassignment of
    // the single, outer `classes` binding, and must still be unioned in
    // (Codex, PR #874 round 31).
    const fixture =
      'let classes = "text-alert-red"; function inner() { classes += " animate-pulse"; return null; } return <span className={classes}>Critical</span>;';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a var declared inside an if block at the enclosing function's scope, not the block's", () => {
    // `var` (unlike `let`/`const`) is never block-scoped in real JS -- a
    // `var` declared inside an `if` block is visible for the whole
    // enclosing function (here, the whole file: there's no enclosing
    // function at all). Giving it the `if` block's own range like `let`/
    // `const` left the later reference outside the block unable to see it
    // (Codex, PR #874 round 32).
    const fixture =
      'if (active) { var classes = "text-alert-red animate-pulse"; } return <span className={classes}>Loading</span>;';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("keeps a let declared inside an if block scoped to the block, unlike var", () => {
    // Same shape as the previous fixture but with `let` -- block scope is
    // correct here, so the outer reference never resolves and stays
    // unflagged (Codex, PR #874 round 32).
    const fixture =
      'if (active) { let classes = "text-alert-red animate-pulse"; } return <span className={classes}>Loading</span>;';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("gives each of two nested functions' own same-named var its own function scope, shadowing correctly", () => {
    // `outer`'s own `var classes` is scoped to `outer`'s whole function body
    // (including `inner`'s definition); `inner`'s own `var classes` is
    // scoped only to `inner`'s function body, shadowing `outer`'s within
    // `inner` but not affecting `outer`'s own trailing reference (Codex, PR
    // #874 round 32).
    const fixture =
      'function outer() { var classes = "text-alert-red animate-pulse"; function inner() { var classes = "text-xs"; return <span className={classes}>Inner</span>; } return <span className={classes}>Outer</span>; }';
    // Only `outer`'s own span can ever be flagged: `inner`'s `classes`
    // resolves to its own non-pulsing `var`, so exactly one violation means
    // `inner`'s declaration correctly shadowed `outer`'s within `inner`
    // without leaking a false positive there, and `outer`'s own trailing
    // reference still resolved past `inner`'s definition to its own pulsing
    // `var`.
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("text-alert-red animate-pulse");
  });

  it("keeps a typed inner function's own pulsing var out of the outer function's clean scope (#874 round 40 thread 2)", () => {
    // Before this round, `isFunctionBodyOpenBrace` required the character
    // immediately before `{` to be `)` -- `function Inner(): JSX.Element {`
    // fails that (the character before `{` is `t`), so `Inner`'s own body
    // was never recognized as a function body at all, and
    // `findEnclosingFunctionScope` kept walking outward past it, landing
    // `var classes` inside `Inner` on `Outer`'s own whole-body scope instead
    // -- the exact same scope as `Outer`'s own clean `let classes`. Since
    // `Inner`'s leaked declaration then has a LATER index than `Outer`'s own
    // (it's textually declared after it), `visibleDecl`'s own "most recent
    // declaration wins" tie-break picked `Inner`'s pulsing `var` for
    // `Outer`'s own render, falsely flagging it. Verified red on revert
    // against a59fb83b (round 39 head): `scanSourceForViolations` there
    // returns a violation for this fixture.
    const fixture =
      'function Outer() { let classes = "text-green"; function Inner(): JSX.Element { var classes = "text-alert-red animate-pulse"; return null; } return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("keeps the same typed-return-type fix working for an arrow function (round 40 thread 2)", () => {
    // The arrow-body check (`=> {`) never depended on what precedes the
    // arrow at all, so this shape was actually already correct before this
    // round -- included as the requested fixture anyway, to document and
    // lock in that non-regression rather than leave it unproven.
    const fixture =
      'function Outer() { let classes = "text-green"; const Inner = (): JSX.Element => { var classes = "text-alert-red animate-pulse"; return null; }; return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("skips a generic return type (`Promise<Array<string>>`) the same way, including on an async function", () => {
    // Also exercises the `async` keyword sitting before `function`: it's
    // further back than anything `isFunctionBodyOpenBrace` looks at (the
    // identifier check only looks at the token immediately before the
    // parameter list's own `(`, i.e. `inner`, never `async`), so it was
    // never the source of the original gap and needs no special-casing.
    // Verified red on revert against a59fb83b.
    const fixture =
      'function Outer() { let classes = "text-green"; async function inner(): Promise<Array<string>> { var classes = "text-alert-red animate-pulse"; return []; } return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("skips an OBJECT return type (`{ a: string }`) without mistaking its own brace for the function body", () => {
    // The trickiest shape: the return type's own `{ a: string }` has to be
    // walked as a single balanced unit by `findReturnTypeColonBackward` (its
    // inner `:` must never be mistaken for the annotation's own leading
    // colon) so the REAL body brace that follows it is what gets tested.
    // Verified red on revert against a59fb83b.
    const fixture =
      'function Outer() { let classes = "text-green"; function Inner(): { a: string } { var classes = "text-alert-red animate-pulse"; return { a: "x" }; } return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("registers a let declared with a type annotation and no initializer, resolved only once assigned, but still dismisses it when decorative", () => {
    // `let classes: string;` has no initializer to extract a literal from
    // at all -- it must still register (with an empty literal set) so the
    // later `classes = "…"` assignment has a declaration to attach to.
    // The element itself is a self-closing `<div />` with no text-shaped
    // prop or children, so even once `classes` resolves to a pulsing class,
    // this stays decorative and unflagged.
    const fixture =
      'let classes: string; classes = "h-2 animate-pulse"; return <div className={classes} />;';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves an identifier-only const alias of a pulsing class const (no literal body of its own)", () => {
    // `classes`'s initializer (`pulse`) has no string/template literal of
    // its own, which used to make `collectConstTemplateMap` treat the whole
    // declaration as "not class-shaped" and drop it entirely -- `classes`
    // was then invisible to `visibleDecl` no matter what `pulse` resolved
    // to (Codex, PR #874 round 29).
    const fixture =
      'const pulse = "animate-pulse";\nconst classes = pulse;\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("registers every declarator in a comma-separated declaration, not just the first", () => {
    // `const pulse = "animate-pulse", classes = pulse;` used to register
    // only `pulse` -- `collectConstTemplateMap`'s declarator regex matched
    // once per `const`/`let`/`var` keyword, so `classes` (the second
    // declarator) never became a declaration at all, and `classes`'s
    // reference in the JSX below resolved to nothing (Codex, PR #874 round
    // 33).
    const fixture =
      'const pulse = "animate-pulse", classes = pulse;\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("registers every declarator in a multi-declarator let statement whose second declarator is the pulsing one", () => {
    const fixture =
      'let a = "x", classes = "text-alert-red animate-pulse";\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves an identifier-only const alias through a ternary, fail closed regardless of which branch renders", () => {
    const fixture =
      'const pulse = "animate-pulse";\nconst other = "text-xs";\nconst classes = cond ? pulse : other;\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves an identifier-only const alias passed through a cn() call alongside a literal", () => {
    const fixture =
      'const pulse = "animate-pulse";\nconst classes = cn(pulse, "text-xs");\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves an identifier-only const alias of an object entry's member access, the same as a direct reference", () => {
    const fixture =
      'const STYLES = { alert: "text-alert-red animate-pulse", ok: "text-xs" };\nconst classes = STYLES.alert;\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("keeps precise per-key entries past a leading spread, instead of falling back to the whole object's flattened literal", () => {
    // `...base` used to abort `extractObjectEntries` entirely, dropping
    // `safe` and `alert` both -- `styles.safe`'s member access then failed
    // to narrow (no `entries` at all) and fell back to `resolveConstRefs`'s
    // member-access-blind bare-identifier pass substituting `styles`'s
    // whole flattened literal (which also carries `alert`'s
    // "animate-pulse"), a false positive on a purely non-pulsing key
    // (Codex, PR #874 round 32).
    const fixture =
      'const styles = { ...base, safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still finds the pulsing key on the same spread object, past the leading spread", () => {
    const fixture =
      'const styles = { ...base, safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("merges a resolvable spread source's own entries into the spreading object", () => {
    // `styles` never declares `alert` itself -- it only reaches it by
    // spreading `base`, whose own `entries` (already precisely resolved) are
    // merged in for any key `styles` doesn't declare explicitly (Codex, PR
    // #874 round 32).
    const fixture =
      'const base = { alert: "text-red animate-pulse" };\nconst styles = { ...base, safe: "text-green" };\nexport function A() { return <span className={styles.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still expands every entry (including a merged one) for a computed-key access on a spread object", () => {
    const fixture =
      'const styles = { ...base, safe: "text-green", alert: "text-red animate-pulse" };\nexport function A({ k }) { return <span className={styles[k]}>Status</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("overwrites an earlier named entry with a later, resolvable spread's own value for the same key", () => {
    // `base.safe` is `"animate-pulse"` and comes AFTER `styles`'s own plain
    // `safe: "text-green"` -- the merge used to install a spread's entries
    // only when the spreading object didn't already have that key, so
    // `styles.safe` kept the earlier, non-pulsing entry regardless of which
    // one actually came last in source (Codex, PR #874 round 34).
    const fixture =
      'const base = { safe: "animate-pulse" };\nconst styles = { safe: "text-green", ...base };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still keeps a named entry precise when it comes AFTER a leading spread (round 32 shape, unaffected by the ordering fix)", () => {
    const fixture =
      'const styles = { ...base, safe: "text-green" };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("fails closed on a precise key defined before an unresolvable spread, since the spread could overwrite it with anything", () => {
    const fixture =
      'const styles = { safe: "text-green", alert: "animate-pulse", ...unknownImport };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a precise key before an unresolvable spread when the object has no pulse anywhere", () => {
    const fixture =
      'const styles = { safe: "text-green", ok: "text-blue", ...unknownImport };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves a spread inside a NESTED object literal against a LOCAL map, at member-access depth two", () => {
    // `styles.group` was never given `extractObjectEntries`'s own
    // `spreads`/`order` for its inner `{ ...base, safe: "text-green" }` --
    // only `nested.entries` (the group's own precise, non-spread keys) made
    // it into the parent's `ConstEntry`, discarding the nested spread info
    // entirely, so `styles.group.alert` (reachable only via the spread of
    // `base`) could never resolve regardless of `base` being a plain local
    // const (Codex, PR #874 round 36b).
    const fixture =
      'const base = { alert: "text-red animate-pulse" };\nconst styles = { group: { ...base, safe: "text-green" } };\nexport function A() { return <span className={styles.group.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("keeps a nested spread object's own precise, non-pulsing key clean past a resolvable local spread", () => {
    const fixture =
      'const base = { alert: "text-red animate-pulse" };\nconst styles = { group: { ...base, safe: "text-green" } };\nexport function A() { return <span className={styles.group.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("overwrites an earlier named entry inside a NESTED object with a later, resolvable spread's own value, in source order", () => {
    // Round 34's source-order-overwrite rule (`{ safe: "text-green", ...base
    // }` where `base.safe` is pulsing overwrites the earlier plain entry)
    // replayed one level deeper: `styles.group`'s own `safe` entry is
    // defined BEFORE `...base` inside the nested object, so the later
    // spread's `safe` value must win for `styles.group.safe` (Codex, PR #874
    // round 36b).
    const fixture =
      'const base = { safe: "animate-pulse" };\nconst styles = { group: { safe: "text-green", ...base } };\nexport function A() { return <span className={styles.group.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("fails closed on a nested object's own key before an unresolvable spread, without touching a sibling key at the parent level", () => {
    // `styles.group`'s unresolvable `...unknownImport` could, for all this
    // scanner knows, overwrite `group.safe` with anything -- fails closed on
    // that key using `group`'s OWN flattened literal, exactly like a
    // top-level unresolvable spread would (round 34) but scoped to this
    // nested object only. `styles.parentSafe`, a sibling key one level up
    // from `group`, is untouched by anything inside `group` and must stay
    // precise (Codex, PR #874 round 36b). (`alert`'s value is deliberately
    // `"text-red animate-pulse"`, not a bare `"animate-pulse"` field, so
    // this fixture doesn't also trip the separate config-map-mixing
    // heuristic in `findConfigMapViolations` -- the same care round 36's own
    // imported-spread fixtures took.)
    const fixture =
      'const styles = { group: { safe: "text-green", alert: "text-red animate-pulse", ...unknownImport }, parentSafe: "text-blue" };\nexport function A() { return <span className={styles.group.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("keeps a sibling key at the PARENT level precise when a NESTED object's own unresolvable spread fails closed", () => {
    const fixture =
      'const styles = { group: { safe: "text-green", alert: "text-red animate-pulse", ...unknownImport }, parentSafe: "text-blue" };\nexport function A() { return <span className={styles.parentSafe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("registers a shorthand object property (`{ pulse }`) as an identifier-valued entry of a LOCAL const", () => {
    // Round 18 chose to skip a shorthand property outright alongside a
    // method and a colon-less computed key -- `styles.pulse` (reachable
    // only via the shorthand) had no entry at all to narrow against, no
    // matter how genuinely pulsing `pulse` itself was (Codex, PR #874
    // round 37).
    // Honest note (verified via red-on-revert, UPDATED round 37b): this
    // fixture used to NOT discriminate the shorthand fix on its own --
    // `styles.pulse` failed its precise dot-chain narrow on the unfixed
    // (round-36-and-earlier) parser (no "pulse" key in `styles.entries`
    // either way), which fell through to an unrelated per-identifier
    // fallback in `resolveMemberAccess` (the trailing property name was
    // re-matched as its own bare identifier, since `BASE_IDENT_RE` didn't
    // exclude a preceding `.`) that coincidentally resolved "pulse" against
    // this SAME file's own top-level `const pulse = "animate-pulse";` --
    // true of any `{ x }` shorthand whose value name is a real,
    // independently-resolvable identifier, since shorthand syntax requires
    // the property name and the value's name to be identical. Round 37b
    // closed that fallback (`BASE_IDENT_RE` and `resolveConstRefs`'s own
    // identifier regex now both exclude a preceding `.`/`]`, so a failed
    // member-access chain's tail is never re-matched as a bare identifier).
    // Verified via a three-way hybrid probe: `eade04db`'s original source
    // (no shorthand-entries registration at all) patched with ONLY the
    // round-37b regex anchor now makes this exact fixture FAIL (returns
    // `[]`) -- proving the coincidental path is gone and this fixture now
    // genuinely requires the round-37 `entries` registration below to pass.
    // This fixture now discriminates the presence of genuine shorthand
    // support (Codex, PR #874 round 37 x round 37b).
    const fixture =
      'const pulse = "animate-pulse";\nconst styles = { pulse };\nexport function A() { return <span className={styles.pulse}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("registers a shorthand object property introduced by destructuring a resolvable config object (round 35 x round 37)", () => {
    // Honest note (verified via red-on-revert, UPDATED round 37b): same
    // caveat as the LOCAL-const fixture above used to carry -- `alert` here
    // is also independently resolvable (it's the destructured local
    // binding's own name), so the pre-37b `BASE_IDENT_RE` fallback masked
    // whether this fixture actually exercised shorthand support. Round 37b's
    // anchor fix closes that fallback (see the LOCAL-const fixture's note
    // above for the mechanism and the hybrid-probe evidence); this fixture
    // now genuinely requires the round-37 `entries` registration to pass.
    const fixture =
      'const styles = { alert: "text-red animate-pulse" };\nconst { alert } = styles;\nconst wrapper = { alert };\nexport function A() { return <span className={wrapper.alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("registers a shorthand object property of an IMPORTED binding (round 37)", () => {
    // Same shorthand path, but `pulse` itself is a named import rather than a
    // local const -- proves the shorthand's identifier-ref resolves through
    // `resolveConstRefs`'s own imported-decl handling exactly like a
    // long-hand `{ pulse: pulse }` already does, not just a local `const`.
    // Honest note (verified via red-on-revert, UPDATED round 37b): same
    // caveat as the LOCAL-const fixture above used to carry -- `pulse` here
    // is also independently resolvable as an imported binding of the same
    // name, so the pre-37b `BASE_IDENT_RE` fallback masked whether this
    // fixture actually exercised shorthand support for the imported-binding
    // path specifically. Round 37b's anchor fix closes that fallback (see
    // the LOCAL-const fixture's note above for the mechanism and the
    // hybrid-probe evidence); this fixture now genuinely requires the
    // round-37 imported-binding shorthand path to pass.
    const baseSource = 'export const pulse = "animate-pulse";';
    const bSource =
      'import { pulse } from "@/lib/base";\nconst styles = { pulse };\nexport function A() { return <span className={styles.pulse}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/base.ts": baseSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("preserves a destructuring default when the source object genuinely lacks that key (#874 round 38 thread 2)", () => {
    // `styles` has no `alert` key at all, so before this round the default
    // was discarded and `alert` registered against the whole object's own
    // flattened literal instead ("text-green", the only string anywhere in
    // `styles`'s initializer) -- silently losing the default's own
    // "animate-pulse" entirely. Verified red on revert against d06d87a0: the
    // old parser resolves `alert` to `styles`'s flattened literal
    // ("text-green"), so `scanSourceForViolations` there returns `[]`.
    const fixture =
      'const styles = { safe: "text-green" };\nconst { alert = "animate-pulse" } = styles;\nexport function A() { return <span className={alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("preserves a RENAMED destructuring default the same way (`{ alert: cls = \"…\" }`) (round 38 thread 2)", () => {
    const fixture =
      'const styles = { safe: "text-green" };\nconst { alert: cls = "animate-pulse" } = styles;\nexport function A() { return <span className={cls}>Critical</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("still prefers the PRESENT key's own value over its default when the source object does have that key", () => {
    // The default must never override a genuinely present (even
    // non-pulsing) key -- only fill in when the key is truly absent.
    const fixture =
      'const styles = { alert: "text-green" };\nconst { alert = "animate-pulse" } = styles;\nexport function A() { return <span className={alert}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("still resolves a later, resolvable spread's own value over an earlier shorthand entry for the same key, in source order", () => {
    // Same round-34 source-order-overwrite rule, now exercised with a
    // shorthand as the EARLIER entry instead of a `key: value` pair --
    // proves the new shorthand `order.push` participates in replay exactly
    // like any other named entry.
    const fixture =
      'const pulse = "text-green";\nconst base = { pulse: "animate-pulse" };\nconst styles = { pulse, ...base };\nexport function A() { return <span className={styles.pulse}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still keeps a shorthand entry precise when it comes AFTER a resolvable spread that never touches that key", () => {
    const fixture =
      'const pulse = "text-green";\nconst base = { banner: "animate-pulse" };\nconst styles = { ...base, pulse };\nexport function A() { return <span className={styles.pulse}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not flag an unresolvable shorthand's own key, and does not let it cloud a sibling key's precise resolution either way", () => {
    // `pulse` here names no declaration anywhere in the file -- there's
    // nothing to resolve it against, so `styles.pulse` simply never matches
    // (same as any other unresolvable identifier-only reference already
    // doesn't); critically, this must stay entirely local to `pulse`'s own
    // entry and never touch `alert`, a genuinely pulsing sibling key on the
    // same object (Codex, PR #874 round 37).
    const fixture =
      'const styles = { pulse, alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles.pulse}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still flags the genuinely pulsing sibling key next to an unresolvable shorthand entry", () => {
    const fixture =
      'const styles = { pulse, alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still skips a shorthand METHOD (`{ pulse() {} }`), since it's a function body, not a value", () => {
    // Deliberately no "animate-pulse" anywhere in this object at all -- a
    // method's own body is never scanned for a shorthand-style entry, but
    // `styles.pulse` (an unregistered key) still falls back to the whole
    // object's own flattened literal same as any other unmatched precise
    // access always has (a PRE-EXISTING fallback, independent of this
    // round); with no pulse anywhere in that fallback text either, this
    // stays clean either way, proving the method itself never introduces
    // one.
    const fixture =
      'const styles = { pulse() { return "ok"; }, safe: "text-green" };\nexport function A() { return <span className={styles.pulse}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not flag a dot-chain access whose member doesn't exist, even when an unrelated top-level const shares the property's name", () => {
    // `styles` has no `alert` key -- `styles.alert`'s chain fails to narrow
    // against `styles`'s own entries and must resolve to "unresolved" (this
    // file's one fail-closed convention for an unresolvable reference:
    // leave it as unchanged, literal raw source text, exactly like
    // `resolveMemberAccess`'s own `if (!decl) continue;` and
    // `resolveConstRefs`'s replace callback `if (!decl) return id;` already
    // do for every other unresolvable identifier). Before round 37b,
    // `BASE_IDENT_RE` didn't exclude a preceding `.`, so once the chain
    // walk gave up without consuming `alert`, the SAME regex's own next
    // `.exec()` re-matched the bare trailing property name "alert" as its
    // own fresh, unrelated base-identifier candidate -- and this file's
    // unrelated top-level `const alert = "animate-pulse";` (never referred
    // to by `styles` at all) was wrongly substituted in, a false positive.
    // Verified via red-on-revert against d06d87a0 (round 37, pre-37b): this
    // exact fixture FAILS there (`scanSourceForViolations` returns a
    // non-empty violation list); after round 37b's anchor fix it correctly
    // returns `[]` (Codex, PR #874 round 37b).
    const fixture =
      'const alert = "animate-pulse";\nconst styles = { safe: "text-green" };\nexport function A() { return <span className={styles.alert}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("keeps a clean sibling key precise through OPTIONAL CHAINING (`styles?.safe`) instead of falling back to the whole object's flattened literal (#874 round 41 thread 1)", () => {
    // Before round 41, `?.` was not recognized as a chain continuation at
    // all, so the walk gave up on `styles` immediately and left it for
    // `resolveConstRefs`'s generic bare-identifier fallback, which resolves
    // the WHOLE object's flattened literal -- including the unrelated
    // pulsing `alert` key -- instead of the one precise, clean `safe` key. A
    // false positive on a genuinely clean element. Verified red on revert
    // against c8e4bc7d.
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles?.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("still flags the genuinely pulsing key through the same OPTIONAL CHAINING form", () => {
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles?.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("keeps a clean sibling key precise through OPTIONAL BRACKET ACCESS (`styles?.[\"safe\"]`) (#874 round 41 thread 1)", () => {
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles?.["safe"]}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("keeps a clean sibling key precise through a NON-NULL ASSERTION (`styles!.safe`) (#874 round 41 thread 1)", () => {
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles!.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("keeps a clean sibling key precise through a NON-NULL ASSERTION with bracket access (`styles![\"safe\"]`)", () => {
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={styles!["safe"]}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("keeps a clean sibling key precise through a PARENTHESISED base (`(styles).safe`) (#874 round 41 thread 1)", () => {
    // `isGroupingOpenParen` distinguishes this from a call like
    // `cn(styles).safe`, where `.safe` would bind to `cn`'s return value, not
    // to `styles` -- see the next fixture.
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={(styles).safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("does not treat a CALL's own closing paren as a grouping paren, even when its sole argument is a resolvable identifier (`cn(styles).safe`)", () => {
    // `cn(styles)` is a call, not a grouping paren -- `isGroupingOpenParen`
    // sees the identifier character `n` immediately before `(` and refuses
    // to unwrap, so `resolveMemberAccess` never chain-narrows `.safe`
    // against `styles`'s own `safe` key (that would be wrong: `.safe` binds
    // to `cn`'s return value here, not to `styles`). `styles` is instead left
    // for the generic bare-identifier pass, which resolves it to its own
    // flattened literal -- the SAME pre-existing, imprecise behavior any
    // other bare identifier passed as a call argument already gets (see
    // "resolves an identifier-only const alias passed through a cn() call
    // alongside a literal" above); not a new guarantee this round adds or
    // regresses, just confirming the grouping-paren unwrap doesn't
    // over-reach into it.
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nexport function A() { return <span className={cn(styles).safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("keeps a clean sibling key precise through a MIXED chain of optional-chaining and non-null assertion (`a?.mid!.safe`) (#874 round 41 thread 1)", () => {
    const fixture =
      'const a = { mid: { safe: "text-green", alert: "text-red animate-pulse" } };\nexport function A() { return <span className={a?.mid!.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("still flags the genuinely pulsing key through the same MIXED chain form", () => {
    const fixture =
      'const a = { mid: { safe: "text-green", alert: "text-red animate-pulse" } };\nexport function A() { return <span className={a?.mid!.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("resolves a class alias introduced by destructuring a resolvable config object", () => {
    // `alert` is never registered as its own declaration at all -- the
    // config-map scan never matches the combined object literal (`alert`
    // isn't a top-level `const`), and alias resolution has no declaration
    // named `alert` to resolve through either. Destructuring is now
    // registered the same way a plain `const alert = styles.alert;` would
    // be (Codex, PR #874 round 35).
    const fixture =
      'const styles = { alert: "text-red animate-pulse" };\nconst { alert } = styles;\nexport function A() { return <span className={alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a renamed destructured binding (`b: renamed`) to its source key's own entry", () => {
    const fixture =
      'const styles = { alert: "text-red animate-pulse", ok: "text-xs" };\nconst { alert: tinted } = styles;\nexport function A() { return <span className={tinted}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a destructured binding for a non-pulsing key precisely, even though a sibling key on the same object pulses", () => {
    const fixture =
      'const styles = { alert: "text-red animate-pulse", ok: "text-xs" };\nconst { ok } = styles;\nexport function A() { return <span className={ok}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves a destructured default (`c = default`) to its source key's own entry when the source key is present", () => {
    const fixture =
      'const styles = { alert: "text-red animate-pulse" };\nconst { alert = "text-xs" } = styles;\nexport function A() { return <span className={alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a nested destructured binding (`{ a: { b } }`) one level deep into the source's own nested entry", () => {
    const fixture =
      'const styles = { status: { alert: "text-red animate-pulse", ok: "text-xs" } };\nconst { status: { alert } } = styles;\nexport function A() { return <span className={alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("fails closed on a rest binding (`...others`), since it could carry any key the pattern didn't destructure by name", () => {
    const fixture =
      'const styles = { safe: "text-green", alert: "text-red animate-pulse" };\nconst { safe, ...others } = styles;\nexport function A() { return <span className={others}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still keeps today's behaviour for a destructuring source this scanner can't resolve (a call), registering nothing", () => {
    // `getStyles()` isn't a declaration `visibleDecl` can look up, so `alert`
    // is never registered at all -- same silent no-registration this scanner
    // already gave a destructuring declarator before round 35, not a new
    // false negative.
    const fixture =
      'const { alert } = getStyles();\nexport function A() { return <span className={alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still keeps today's behaviour for array destructuring, since entries are never indexed per-element", () => {
    // `ConstEntry` only ever flattens an array's own literals (round 16); it
    // never models per-index access, so `[alert]` can't be resolved
    // precisely and is left unregistered, same as before round 35.
    const fixture =
      'const styles = ["text-green", "text-red animate-pulse"];\nconst [safe, alert] = styles;\nexport function A() { return <span className={alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves an identifier-only const alias concatenated with a literal", () => {
    const fixture =
      'const pulse = "animate-pulse";\nconst classes = pulse + " text-xs";\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a let alias later reassigned to an identifier, the same union-in-reassignment rule as a literal", () => {
    const fixture =
      'const pulse = "animate-pulse";\nlet classes;\nclasses = pulse;\nexport function A() { return <span className={classes}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves an object entry whose value is an identifier alias, not just a literal body", () => {
    // `alert: pulse` used to be dropped entirely by `extractObjectEntries`:
    // an entry only registered when it had a literal string/template body of
    // its own, so `styles.alert` (an identifier-only value) had no entry to
    // resolve through at all (Codex, PR #874 round 33).
    const fixture =
      'const pulse = "animate-pulse";\nconst styles = { alert: pulse };\nexport function A() { return <span className={styles.alert}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a sibling object entry with its own plain (non-pulsing) literal, past an identifier-valued neighbor", () => {
    const fixture =
      'const pulse = "animate-pulse";\nconst styles = { alert: pulse, safe: "text-xs" };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("resolves an identifier-valued entry nested inside another object entry", () => {
    const fixture =
      'const pulse = "animate-pulse";\nconst styles = { alert: { badge: pulse } };\nexport function A() { return <span className={styles.alert.badge}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag an identifier-only const alias of a plain (non-pulsing) const", () => {
    const fixture =
      'const other = "text-xs";\nconst classes = other;\nexport function A() { return <span className={classes}>Idle</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("terminates on a self-referential/cyclic pair of identifier-only aliases instead of looping, and does not flag it", () => {
    // Neither `a` nor `b` ever reaches an actual literal -- each resolves
    // only to the other -- so the cycle guard must stop the walk rather
    // than recursing forever, and since no real class text is ever reached,
    // this is correctly not flagged (Codex, PR #874 round 29).
    const fixture =
      'const a = b;\nconst b = a;\nexport function A() { return <span className={a}>x</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not flag an identifier-only const alias built from a computed (bracket) lookup into an object-valued const, since only a precise key can be narrowed", () => {
    // `config`'s own initializer (`STATUS_CONFIG[status]`) is a *computed*
    // bracket access -- `resolveMemberAccess` only ever narrows a *precise*
    // key (`.key`/`["key"]`), so `config` reaches this decl with no
    // `entries` of its own. Folding the bare object name in as `config`'s
    // ref (instead of dropping the whole reference) would let
    // `resolveConstRefs`'s member-access-blind second pass later substitute
    // `STATUS_CONFIG`'s *entire* flattened literal -- every status's own
    // `text-*` class included -- in place of `config` wherever it's used
    // bare, with the real `.pulse` narrowing left dangling unresolved: a
    // false "tinted text" positive on a purely decorative, childless dot
    // (the real-repo shape in `DxccStatusBadge.tsx`/`OnAirBadge.tsx`,
    // Codex, PR #874 round 29 follow-up).
    const source =
      'const STATUS_CONFIG = { a: { text: "text-alert-red", pulse: true }, b: { text: "text-signal-green", pulse: false } };\n' +
      'function Dot({ status }: { status: string }) {\n' +
      '  const config = STATUS_CONFIG[status];\n' +
      '  return <span className={`w-2 h-2 ${config.pulse ? "animate-pulse" : ""}`} />;\n' +
      '}';
    expect(scanSourceForViolations(source)).toEqual([]);
  });

  it("does not fold identifiers from a nested callback block into an alias's literal, so an unrelated in-scope const's classes are never blindly pulled in through it", () => {
    // `pulseNow`'s initializer is a `useMemo(() => { ... })` call -- none of
    // the alias shapes this walk is meant to cover (bare identifier,
    // ternary, `cn()` call, dot member access, concatenation, `let`
    // reassignment) ever contain a `{...}` block, so one is treated as
    // opaque. Without that, the block's own inner (shadowed, out-of-scope-
    // at-`pulseNow`'s-own-declaration) `dangerClasses` binding would still
    // get folded in as a bare-token ref; `resolveConstRefs`'s second pass
    // would then resolve that token against the *outer*, module-level
    // `dangerClasses` (the only one actually visible at `pulseNow`'s
    // declaration site) and blindly substitute its `text-alert-red` in
    // wherever `pulseNow` is referenced -- a false "tinted text" positive on
    // a purely decorative, childless dot (the same failure mode a nested
    // block introduced in the real repo's `KioskChrome.tsx`, Codex, PR #874
    // round 29 follow-up).
    const source =
      'const dangerClasses = "text-alert-red";\n' +
      'function Dot({ level }: { level: string }) {\n' +
      '  const pulseNow = useMemo(() => {\n' +
      '    const dangerClasses = level === "critical";\n' +
      '    return dangerClasses;\n' +
      '  }, [level]);\n' +
      '  return <span className={`w-2 h-2 ${pulseNow ? "animate-pulse" : ""}`} />;\n' +
      '}';
    expect(scanSourceForViolations(source)).toEqual([]);
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

  it("finds the opening tag past an earlier attribute expression whose own quoted string contains a brace character", () => {
    // `findOpeningTag` walks backward from `className=` looking for the
    // `<` that starts its tag; an earlier `title={"}"}` attribute's own
    // `}` used to throw off a plain, quote-blind backward brace-depth
    // count (the quoted `"}"` inside it got counted as a real close),
    // leaving the walk unable to find a balanced open brace and returning
    // `null` -- silently skipping the whole element, including its real
    // pulsing/tinted `className` (Codex, PR #874 round 30).
    const fixture = '<span title={"}"} className="text-alert-red animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("<span>");
  });

  it("finds the opening tag past an earlier attribute expression whose own template literal contains a brace character", () => {
    // Same shape as above, with the quoted brace inside a template
    // literal instead of a plain string -- `findMatchingOpenBraceBackward`
    // treats a backtick-delimited span as opaque the same way it does a
    // `"`/`'` one (Codex, PR #874 round 30).
    const fixture = '<span title={`}`} className="text-alert-red animate-pulse">Loading</span>';
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

  it("still dismisses a mapping that emits self-closing elements with no text-shaped prop (nothing rendered in place)", () => {
    for (const fixture of [
      '<div className="flex gap-1 animate-pulse">{items.map((item) => <Chip key={item.id} icon={item.icon} />)}</div>',
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

  it("inspects a block-bodied arrow callback's return statement, not just an expression body", () => {
    // `i => { return … ; }` used to be skipped outright by `findArrowBodies`
    // just because it had a `{ … }` block body rather than a single
    // expression -- the returned ternary's own string branch (`"Loading"`)
    // never got examined at all (Codex, PR #874 round 34).
    const fixture =
      '<div className="animate-pulse">{items.map((i) => { return i.ready ? <span className="h-2" /> : "Loading"; })}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still dismisses a block-bodied arrow callback that only returns a decorative element", () => {
    const fixture = '<div className="animate-pulse">{items.map((i) => { return <span className="h-2" />; })}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("inspects every top-level return in a block-bodied `function` callback, not just an arrow", () => {
    // `function (i) { … }` was invisible to `findArrowBodies` twice over: it
    // isn't an arrow at all (only `=>` was ever matched), and even a
    // matching block body was skipped outright. The unbraced `if (!i) return
    // null;` adds no brace nesting of its own, so the second, text-bearing
    // `return i.label;` sits at the same depth and must still be found
    // (Codex, PR #874 round 34).
    const fixture =
      '<div className="animate-pulse">{items.map(function (i) { if (!i) return null; return i.label; })}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("parses a quoted '>' while stripping child tags, so a decorative wrapper is never falsely read as text", () => {
    const fixture =
      '<div className="animate-pulse">' +
      '<div data-formula="x > y" className="h-2" />' +
      "</div>";
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("counts text rendered by a self-closing component's text-shaped prop, mapped or direct", () => {
    // No text-color class on the wrapper itself -- otherwise it would flag
    // independently of the mapped `RadioBadge`, which is not what this
    // fixture tests; only its text-bearing children should trigger this.
    const fixture =
      '<div className="animate-pulse">{items.map((i) => <RadioBadge label={i.label} />)}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a self-closing component with no text-shaped prop", () => {
    // No text-color class on the wrapper itself -- otherwise it would flag
    // independently of `Icon`, which is not what this fixture tests.
    const fixture = '<div className="animate-pulse"><Icon className="w-4" /></div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("fails closed on a self-closing component's spread props, since any key could be text-shaped", () => {
    // No text-color class on the wrapper itself, same reason as above -- the
    // spread on `Badge` is what should trigger this, not the wrapper alone.
    const fixture = '<span className="animate-pulse"><Badge {...props} /></span>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches a labeled component pulsing on its own className, not only a decorative wrapper around one", () => {
    // The component itself (not a wrapper) carries both the pulse class and
    // a text-shaped prop -- `isTextBearingTag` used to skip every
    // capitalized tag before the pulse class was even checked, so this
    // site was invisible to the scan regardless of what `RadioBadge`
    // forwards its className onto internally (Codex, PR #874 round 21).
    const fixture = '<RadioBadge className="animate-pulse" label="TX" />';
    const violations = scanSourceForViolations(fixture);
    expect(violations).not.toEqual([]);
    expect(violations[0].description).toContain("<RadioBadge>");
  });

  it("still dismisses a pulsing component with no text-shaped prop, spread, or text-bearing children", () => {
    const fixture = '<Icon className="animate-pulse h-4 w-4" />';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not treat an ARIA/data attribute as the text-shaped prop it merely shares a suffix with (`aria-label=`/`data-label=` are not `label=`)", () => {
    // A bare `\b(label|...)=` would match "label=" inside "aria-label=" too
    // -- `\b` only requires a word/non-word transition, and `-` is
    // non-word on both sides, so it sits right before "label" the same way
    // a real prop boundary would (Codex, PR #874 round 24).
    for (const fixture of [
      '<Icon className="animate-pulse" aria-label="Loading" />',
      '<Icon className="animate-pulse" data-label="x" />',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
  });

  it("does not lose the closing tag to a same-tag token inside a JSX comment, so trailing visible text is still seen", () => {
    const fixture =
      '<div className="animate-pulse">{/* replace <div> later */}Loading</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("dismisses a decorative conditional child (`cond && <element />`) with no text-shaped prop", () => {
    const fixture = '<div className="animate-pulse">{ready && <span className="h-2" />}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still catches a conditional child that renders a text-bearing element (`cond ? <span>text</span> : null`)", () => {
    const fixture = '<div className="animate-pulse">{ready ? <span>Loading</span> : null}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches a ternary whose only JSX branch is decorative but whose other branch is a literal string (`cond ? <span /> : \"Loading\"`)", () => {
    // The only JSX in the block (`<span className="h-2" />`) is decorative,
    // but the ternary's other branch is the plain string `"Loading"`, which
    // renders as text when `ready` is false -- `isExpressionBlockTextBearing`
    // used to judge the block only by its extracted JSX elements, missing
    // this non-JSX alternative entirely (Codex, PR #874 round 21).
    const fixture =
      '<div className="animate-pulse">{ready ? <span className="h-2" /> : "Loading"}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("dismisses a ternary whose only JSX branch is decorative and whose other branch is null", () => {
    const fixture =
      '<div className="animate-pulse">{ready ? <span className="h-2" /> : null}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("dismisses a comment-only expression block, since it blanks to whitespace and renders nothing", () => {
    // `{/* skeleton */}` blanks to `{   }` (comments are blanked to
    // same-length spaces before any element-level scanning) --
    // `isExpressionBlockTextBearing`'s "no JSX-shaped content" early return
    // used to treat that whitespace the same as a real value block
    // (`{count}`), wrongly counting a decorative comment placeholder as
    // rendered text (Codex, PR #874 round 35).
    const fixture =
      '<div className="animate-pulse">{/* skeleton */}<span className="h-2" /></div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("dismisses a literal empty expression block (`{}`)", () => {
    const fixture = '<div className="animate-pulse">{}<span className="h-2" /></div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("dismisses two adjacent comment-only expression blocks", () => {
    const fixture =
      '<div className="animate-pulse">{/* a */}{/* b */}<span className="h-2" /></div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still catches a rendered-space idiom (`{\" \"}`), unaffected by the whitespace-only comment fix", () => {
    // `{" "}`'s inner text is `" "` (quote characters included) -- those
    // quotes are not JSX-shaped text and are never blanked by
    // `blankCommentsAndQuotedJsx`, so this is not whitespace-only and keeps
    // its prior fail-closed `true` (this scanner doesn't special-case a
    // whitespace-only *string literal* differently from any other string).
    const fixture = '<div className="animate-pulse">{" "}<span className="h-2" /></div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches a logical-OR fallback's left operand, since both operands of `||` render (not just the condition of `?`/left of `&&`)", () => {
    // Round 21 wrongly treated the operand before every operator (`?`,
    // `&&`, `||`, `??`) as a condition and ignored it -- but `||`/`??` are
    // not conditionals, both operands render depending on truthiness, so
    // `message` here is a value position, not a condition (Codex, PR #874
    // round 23).
    const fixture = '<div className="animate-pulse">{message || <Spinner />}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("catches a nullish-coalescing fallback's left operand, same reason as `||`", () => {
    const fixture = '<div className="animate-pulse">{message ?? <Spinner />}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still dismisses a decorative `&&` conditional's left operand (the condition, not a value)", () => {
    const fixture = '<div className="animate-pulse">{ready && <Spinner />}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches a ternary's string alternative even when the whole expression is wrapped in its own grouping parens", () => {
    // `(ready ? <span className="h-2" /> : "Loading")` -- the outer parens
    // put the ternary's `?`/`:` at depth 1, invisible to a naive depth-0
    // split; `unwrapGroupingParens` strips them first (Codex, PR #874
    // round 24).
    const fixture =
      '<div className="animate-pulse">{(ready ? <span className="h-2" /> : "Loading")}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still dismisses a decorative `&&` conditional wrapped in its own grouping parens", () => {
    const fixture =
      '<div className="animate-pulse">{(ready && <span className="h-2" />)}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still dismisses a mapping that emits a decorative self-closing element (`.map((i) => <div … />)`)", () => {
    const fixture =
      '<div className="animate-pulse">{items.map((i) => <div key={i} className="h-2" />)}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches a plain array literal mixing a decorative element with a literal string sibling (round 37)", () => {
    // `isExpressionBlockTextBearing` used to find the decorative span (one
    // JSX element, dismissed by `isJsxElementTextBearing`), blank it out,
    // and hand the remainder to `isRemainderTextBearing` -- which only knew
    // how to split a `?`/`:`/`&&`/`||`/`??` chain or an arrow-function body
    // at depth 0, neither of which an `[a, b]` array literal is, so the
    // sibling string "Loading" was invisible no matter how literally it
    // rendered (Codex, PR #874 round 37).
    const fixture =
      '<div className="animate-pulse">{[<span key="dot" className="h-2" />, "Loading"]}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("dismisses an array literal whose every element is decorative", () => {
    const fixture =
      '<div className="animate-pulse">{[<span key="a" className="h-2" />, <span key="b" className="h-2" />]}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("dismisses an array literal whose non-JSX elements are all `null`/`false` (same clean treatment `isValuePositionTextBearing` already gives those elsewhere)", () => {
    const fixture =
      '<div className="animate-pulse">{[<span key="a" className="h-2" />, null, false]}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches an array literal whose `.map()` sibling emits text-bearing JSX (`.map` spread inside the array)", () => {
    // The map's own returned element (a `<span>` WITH children, not
    // self-closing) is one of the JSX elements `extractJsxElements` already
    // finds over the whole block -- `elements.some(isJsxElementTextBearing)`
    // catches it before this round's new array-elementwise logic is even
    // reached, so this doesn't discriminate this round's fix on its own;
    // kept as coverage for "`.map` producing [JSX] inside the array" per the
    // dispatch, and to document that a map's own text-bearing return value
    // was never the gap here -- a plain, non-JSX literal SIBLING was.
    const fixture =
      '<div className="animate-pulse">{[<span key="dot" className="h-2" />, ...items.map((i) => <span key={i.id}>{i.label}</span>)]}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("dismisses an array literal whose `.map()` sibling only ever emits a decorative element (round 37)", () => {
    // Honest note (verified via red-on-revert): does NOT discriminate this
    // round's fix -- `findArrowBodies` already scans the WHOLE remainder
    // text for `=>` bodies regardless of surrounding bracket depth (it isn't
    // scoped to true top-level position), so it already finds this same
    // `.map()` arrow body and correctly judges it decorative on the UNFIXED
    // parser too, with no array-elementwise logic involved at all. Kept as
    // coverage for the dispatch's ".map producing [decorative JSX] inside
    // the array" case and to document that this shape was already clean
    // before this round, for a different, pre-existing reason.
    // The `.map()` call is one array ELEMENT among others, not the whole
    // remainder -- `isArrayElementTextBearing` has to decide it the same way
    // `isRemainderTextBearing` decides a block-level callback (by its own
    // returned JSX), not by treating its leftover call syntax
    // (`items.map(i =>            )`, once its own decorative JSX is
    // blanked) as a bare text leaf.
    const fixture =
      '<div className="animate-pulse">{[<span key="dot" className="h-2" />, ...items.map((i) => <div key={i.id} className="h-2" />)]}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches a nested array literal (`[[<span/>, \"Loading\"]]`)", () => {
    const fixture =
      '<div className="animate-pulse">{[[<span key="dot" className="h-2" />, "Loading"]]}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("dismisses a nested array literal whose every element, at every depth, is decorative", () => {
    const fixture =
      '<div className="animate-pulse">{[[<span key="a" className="h-2" />], [<span key="b" className="h-2" />]]}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("catches a single-element array whose element is a logical-AND expression (`[cond && \"x\"]`)", () => {
    // Honest note (verified via red-on-revert): does NOT discriminate this
    // round's fix -- `splitAtTopLevelOperators` never tracked `[`/`]` as a
    // depth-changing pair, so it already splits `cond && "Loading"` on the
    // UNFIXED parser exactly as if the surrounding array brackets weren't
    // there at all, and the pre-existing ternary/logical value-operand check
    // already flags the quoted string. No array-elementwise logic is
    // actually exercised by this particular shape (a single top-level
    // logical expression, not a comma-separated list of elements). Kept as
    // the dispatch's requested "[cond && \"x\"]" coverage.
    // The array's own element-split (`splitTopLevelCommaList`) isolates
    // `cond && "x"` as one element; `isArrayElementTextBearing` then runs
    // the SAME ternary/logical chain split `isRemainderTextBearing` already
    // uses at the block level, on this one element, so `&&`'s left operand
    // (`cond`) is still correctly excluded as a condition, not a value.
    const fixture = '<div className="animate-pulse">{[cond && "Loading"]}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("dismisses a single-element array whose logical-AND expression's value operand is decorative", () => {
    const fixture =
      '<div className="animate-pulse">{[cond && <span className="h-2" />]}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
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

  it("does not treat an ARIA attribute as a form control's own rendered value or placeholder (`aria-placeholder=` is not `placeholder=`)", () => {
    const fixture = '<div className="animate-pulse"><input aria-placeholder="x" /></div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still catches a descendant form control's real placeholder, unaffected by the ARIA/data prop-boundary fix", () => {
    const fixture = '<div className="animate-pulse"><input placeholder="Call" /></div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("finds a descendant form control's value past a quoted '>' in an earlier attribute", () => {
    const fixture =
      '<div className="animate-pulse"><input title="1 > 0" value="Loading" readOnly /></div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still catches a descendant form control's value attribute with whitespace around `=`", () => {
    // `VALUE_ATTR_RE` matched only an exact `value=` with no whitespace on
    // either side -- `value = "Loading"` (spaced, but syntactically
    // identical JSX) was missed entirely, unlike `TEXT_PROP_RE` and the
    // `className` attribute regex, which already tolerate it (Codex, PR
    // #874 round 36).
    const fixture = '<div className="animate-pulse"><input value = "Loading" readOnly /></div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("still catches a descendant form control's value attribute in expression form with whitespace around `=`", () => {
    // Guard, not a `VALUE_ATTR_RE`-specific regression proof: any `{…}`
    // block found anywhere in a self-closing tag's raw text -- including one
    // sitting inside an attribute, since `stripBalancedExpressions` scans
    // the whole tag's text for `{...}` blocks without knowing about
    // attribute boundaries -- already reads as a rendered child expression
    // and fails closed, regardless of the attribute name or the `=`
    // spacing. Confirmed against the pre-round-36 parser too, so this one
    // doesn't discriminate old vs. new code the way the quoted-value fixture
    // above does; kept because the dispatch explicitly asked to check this
    // shape, and it genuinely is still caught, just not through the regex
    // this round changed (Codex, PR #874 round 36).
    const fixture = '<div className="animate-pulse"><input value = {label} readOnly /></div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
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

  it("does not read a `//` line comment's illustrative markup as a real rendered site", () => {
    const fixture = '// <span className="animate-pulse">Loading</span>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not treat a URL scheme in JSX text as a line comment, so a following real site is still caught", () => {
    // `https:` immediately before `//` used to make the comment scanner
    // treat the rest of the line as a `//` comment, blanking away a real
    // pulse site sitting further along it (Codex, PR #874 round 27).
    const fixture =
      '<div>Visit https://example.com <span className="animate-pulse">Loading</span></div>';
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still blanks a real `//` comment on its own line, even when an earlier line has a URL scheme", () => {
    const fixture =
      '<p>See http://x.y/z</p>\n// <span className="animate-pulse">Loading</span>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still blanks a real trailing `//` comment after a statement", () => {
    const fixture = 'const a = 1; // <span className="animate-pulse">Loading</span>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still catches a real site immediately followed by its own trailing `//` comment", () => {
    const fixture = '<span className="animate-pulse">Loading</span> // trailing';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not read a `/* … */` block comment's (bare or `{/* … */}` JSX-style) illustrative markup as a real rendered site", () => {
    for (const fixture of [
      "/* <span className=\"animate-pulse\">Loading</span> */",
      "{/* <span className=\"animate-pulse\">Loading</span> */}",
    ]) {
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
  });

  it("does not read a doc string quoting JSX markup as a real rendered site", () => {
    // Single-quoted outer string with unescaped double quotes inside, so
    // `className="..."` appears in the raw source exactly as it would in a
    // real element -- unlike a `\"`-escaped variant, this actually fools the
    // old, non-blanking `className` attribute regex into registering it as
    // a genuine site (a `\"` breaks that regex's match for an unrelated
    // reason, so it wouldn't have discriminated old vs. new code here).
    const fixture =
      'const doc = \'Example: <span className="animate-pulse">Loading</span>\';';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still catches a real site after a line comment, at the offset the comment's own blanking leaves it at", () => {
    // The comment blanks to a run of spaces that `normalize` then collapses
    // to one -- so the real element's reported offset is *not* simply "the
    // comment's raw character count" away from where it appears in the raw
    // source. What must hold is that the violation's index and the anchor
    // matcher's coordinate space are the exact same blanked-then-normalized
    // text (Codex, PR #874 round 23) -- checked here by independently
    // recomputing that text and confirming the reported index lands right
    // on the real pulse token, not somewhere a stale/un-blanked offset
    // would have pointed.
    const fixture =
      '// see "https://example.com/x" for background\n<span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still catches a real site after an English contraction's apostrophe in JSX text, at the offset the fixed blanking leaves it at", () => {
    // An ASCII apostrophe in `Don't` used to open a "string" that ran to
    // the next apostrophe or EOF -- with none following here, it swallowed
    // everything after it, including the real pulse site (Codex, PR #874
    // round 25).
    const fixture = "<div><p>Don't wait</p><span className=\"animate-pulse\">Loading</span></div>";
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still catches a real site enclosed between a pair of apostrophes quoting JSX prose (not a JS string)", () => {
    // Unlike a single unpaired apostrophe (previous fixture), this one closes
    // -- but the old code still treated the pair as a JS string delimiter,
    // and since the *body* between them contains real markup, that whole
    // span (including the real pulse site) got blanked as if it were an
    // illustrative doc-string quoting JSX (Codex, PR #874 round 25).
    const fixture =
      '<p>\'quoted <span className="animate-pulse">Loading</span> quoted\'</p>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not mistake a regex literal ending in an escaped slash for a `//` line comment, so a following real site is still caught (#874 round 43 thread 3)", () => {
    // `/\/\//` is a regex matching a literal "//" -- its own last two
    // characters (an escaped slash's closing `/` immediately followed by the
    // regex's own closing delimiter `/`) line up into what looks exactly
    // like a `//` line-comment start once `scanJs`'s old per-character loop
    // reached them one at a time, blanking the rest of the line -- including
    // a real pulse site on the SAME line right after the regex. Consuming
    // the whole regex literal as one atomic unit (`scanRegexLiteral`) before
    // the comment check ever sees its interior fixes this.
    const fixture =
      'const separator = /\\/\\//; <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("does not mistake a regex character class containing a bare `/` for the regex's own closing delimiter", () => {
    // `[/]` -- an unescaped `/` INSIDE a character class -- doesn't close
    // the regex; only an unescaped `/` outside `[...]` does. Getting this
    // wrong would close the regex early, leaving its real closing `/` (plus
    // everything after) to be walked one character at a time by the
    // now-resumed per-character loop, right past a real site on the same
    // line.
    const fixture =
      'const isSlash = /[/]/; <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("does not mistake a regex literal's own trailing flags for anything else, and still catches a following real site", () => {
    const fixture =
      'const re = /foo-bar/gi; <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still treats `a / b` division after a value as division, not a regex, so a following real site is still caught", () => {
    // `isExpressionPosition` (reused from the `<`-vs-comparison job) is what
    // tells a division `/` apart from a regex-starting one: right after an
    // identifier/number/`)`/`]`/string, `/` is division, everywhere else in
    // this file's own convention it's a regex start. Division isn't
    // affected by round 43's regex handling at all -- it was never
    // misdetected as a comment start either -- pinned down here as a
    // non-regression companion to the regex fixtures above.
    const fixture =
      'const half = a / b; <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("does not mistake a `//` line comment for a regex literal, still blanking it (non-regression)", () => {
    // `//` immediately together can never actually be a regex (an empty
    // regex body isn't valid syntax) -- always a comment, in real JS and in
    // this scanner's own regex-start check alike (excluded up front by the
    // `source[i + 1] !== "/"` guard before `isExpressionPosition` is even
    // consulted).
    const fixture = '// <span className="animate-pulse">Loading</span>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still blanks a `/* … */` block comment starting right after an expression-position `/` would sit, still a comment not a regex (non-regression)", () => {
    // `/*` immediately together is always a block comment in real JS too (a
    // regex pattern can never start with a bare `*`) -- excluded by the same
    // `source[i + 1] !== "*"` guard.
    const fixture = 'const x = 1; /* <span className="animate-pulse">Loading</span> */';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still blanks a string literal containing `//` (a URL) unaffected by regex handling (non-regression, #874 round 27 shape)", () => {
    const fixture =
      'const url = "https://example.com//path"; <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still blanks a template literal containing `//` unaffected by regex handling (non-regression)", () => {
    const fixture =
      'const url = `https://example.com//path`; <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still blanks a block comment containing a bare `/` character unaffected by regex handling (non-regression)", () => {
    const fixture =
      'const x = 1; /* separator: / */ <span className="animate-pulse">Loading</span>';
    const violations = scanSourceForViolations(fixture);
    expect(violations, fixture).toHaveLength(1);
    const expectedNormalized = normalize(blankCommentsAndQuotedJsx(fixture));
    expect(violations[0].index).toBe(expectedNormalized.indexOf(PULSE_CLASS));
  });

  it("still blanks a real JS string in expression position even when it quotes JSX markup, unaffected by the apostrophe fix", () => {
    for (const fixture of [
      // Plain assignment (`=` is expression position).
      'const s = \'x <span className="animate-pulse">Loading</span>\';',
      // Arrow function body (the `=>` special case).
      'const f = () => \'<span className="animate-pulse">Loading</span>\';',
      // Ternary value position (`:` is expression position).
      'x ? \'a\' : \'<span className="animate-pulse">Loading</span>\'',
    ]) {
      expect(scanSourceForViolations(fixture), fixture).toEqual([]);
    }
  });

  it("still catches a real site after whitespace-preceded '//' text inside JSX (not a comment)", () => {
    // A `//` preceded by whitespace, not code, used to satisfy the old
    // preceding-character comment heuristic (`isRealLineCommentStart`),
    // reading the rest of the line -- including the real pulse site further
    // along it -- as a line comment. In real JSX text, `//` is never a
    // comment at all; the mode-machine rewrite makes this true by
    // construction rather than by another preceding-character carve-out
    // (Codex, PR #874 round 33).
    const fixture =
      '<div>Use // as a separator <span className="animate-pulse">Loading</span></div>';
    const violations = scanSourceForViolations(fixture);
    expect(violations).not.toEqual([]);
    const anchor = fixture.indexOf('<span className="animate-pulse">');
    expect(violations[0].index).toBeGreaterThanOrEqual(anchor);
  });

  it("does not let a JSX-comment idiom or a quoted literal slash swallow a following real site", () => {
    const fixture =
      '<p>{"//"} literal</p><p>{/* c */}x</p><span className="animate-pulse">Loading</span>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("does not flag a real less-than comparison followed by a commented-out site", () => {
    const fixture = 'const x = a < b; // <span className="animate-pulse">Loading</span>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not flag a block comment inside a compound boolean comparison", () => {
    const fixture =
      'if (a < b && c > d) { /* <span className="animate-pulse">L</span> */ }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not flag a comment that follows an object-literal expression sharing the same JSX expression container", () => {
    // `blankCommentsAndQuotedJsx`'s JS-mode scanner used to stop at the
    // FIRST literal `}` inside a `{...}` JSX expression container, regardless
    // of nesting -- `{format({}) /* <span className="animate-pulse">Loading
    // </span> */}` returned control to JSX-text mode right after the empty
    // object literal's own closing `}`, so the trailing block comment (and
    // the markup it quotes) was never blanked at all: JSX-text mode has no
    // comment handling of its own, so a `<` there always starts a real
    // nested element, meaning the comment's `<span>` was read as genuine
    // markup (Codex, PR #874 round 36).
    const fixture = '<div>{format({}) /* <span className="animate-pulse">Loading</span> */}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not flag a comment that follows an arrow function's block body in the same JSX expression container", () => {
    // Same root cause as the object-literal case above -- an arrow
    // function's block body is just another plain brace pair the old,
    // depth-blind scanner stopped at (Codex, PR #874 round 36).
    const fixture =
      '<div>{items.map(x => { return x; }) /* <span className="animate-pulse">Loading</span> */}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("does not miscount a template literal's own `}` (inside a string body) as part of the expression's brace depth", () => {
    // The template's `}` is consumed as a unit by `scanTemplate` before the
    // per-character loop in `scanJs` ever sees it, so it must never
    // contribute to (or accidentally satisfy) the depth counter guarding the
    // trailing comment below -- paired here with an object literal so the
    // fixture still exercises the round-36 fix itself, not just a case the
    // old code already handled (Codex, PR #874 round 36).
    const fixture = '<div>{format({}, `a}b`) /* <span className="animate-pulse">Loading</span> */}</div>';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still recognizes a real pulsing site inside a nested JSX expression within an expression (must not regress)", () => {
    // A nested JSX element inside a `{...}` expression (`{cond && <span>…
    // </span>}`) is handled by its own, separate recursive `scanJs` call with
    // an independent depth counter -- the round-36 depth-tracking fix above
    // must not disturb this existing mode-switching path.
    const fixture = '<div>{cond && <span className="animate-pulse">Loading</span>}</div>';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("resolves a JSX spread of an object binding's className (#874 round 38 thread 1)", () => {
    // `className=` never appears literally, so the primary `attrRe` pass
    // finds nothing; the config-map scanner also misses it since `className`'s
    // value isn't *exactly* the pulse class. Verified red on revert against
    // d06d87a0 (round 37b): `scanSourceForViolations` returned `[]` there.
    const fixture =
      'const props = { className: "text-alert-red animate-pulse" };\nexport function A() { return <span {...props}>Critical</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("resolves a member-chain spread's className the same way (round 38 thread 1 sweep: {...styles.alert})", () => {
    // `styles.alert` is itself an object literal value, recursed into by
    // `extractObjectEntries` the same way any other nested object is, so its
    // own `className` key narrows precisely -- `safe`'s sibling className
    // never leaks in. Verified red on revert against d06d87a0.
    const fixture =
      'const styles = { alert: { className: "text-alert-red animate-pulse" }, safe: { className: "text-green" } };\nexport function A() { return <span {...styles.alert}>Critical</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("does not flag a spread whose source is genuinely unresolvable (e.g. a forwarded function parameter) (round 38 thread 1)", () => {
    // `props` here is the component's own PARAMETER, never a `const`/`let`/
    // `var` this file's declaration scan can ever see -- the same shape as
    // the extremely common `<Child {...props} />` prop-forwarding pattern.
    // A first attempt at this round unconditionally assumed a genuinely
    // unresolvable spread on a text-bearing element MIGHT carry the pulse
    // class, mirroring `TEXT_PROP_RE`'s own spread rule literally -- but that
    // reading immediately flagged a real, non-pulsing call site in
    // `src/components/cluster/ClusterConnectionForm.tsx` (`<ClusterConnectionForm
    // {...props} link={…} />`, whose one real caller never passes a
    // className at all) as a false positive against the repo-wide census.
    // Left as this file's one general "no idea what this refers to"
    // fail-closed convention instead (unresolved raw text, contributes
    // nothing new) -- consistent with every other unresolvable reference
    // elsewhere in this file, and does not regress against the pre-round-38
    // parser either (which also returns `[]` here, since it never looked at
    // spreads at all).
    const fixture = 'export function Card(props) { return <span {...props}>Static</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("flags a spread AFTER an explicit className, since JSX applies the later source (#874 round 39 thread 1)", () => {
    // `props.className` pulses; JSX applies attributes/spreads left to
    // right, so the spread -- being LAST on the tag -- is what actually
    // renders, not the earlier explicit "text-green". The pre-round-39
    // "skip the spread entirely once any className= exists on the tag" rule
    // stopped at the first explicit source and never even looked at this
    // spread, so it stayed false-green. Verified red on revert against
    // 74bb7a0f (round 38): `scanSourceForViolations` returned `[]` there.
    const fixture =
      'const props = { className: "text-alert-red animate-pulse" };\nexport function A() { return <span className="text-green" {...props}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("does not flag an explicit className AFTER a spread when the explicit one is clean (round 39 thread 1)", () => {
    // Same `props` as above, but the explicit `className=` now comes AFTER
    // the spread, so it wins instead -- the tag really renders "text-green"
    // at runtime, never `props.className`. A scanner that resolves the
    // spread unconditionally whenever one exists on the tag (the naive fix
    // for the fixture above) would wrongly flag this one.
    const fixture =
      'const props = { className: "text-alert-red animate-pulse" };\nexport function A() { return <span {...props} className="text-green">Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("flags an explicit className AFTER a spread when the explicit one itself pulses (round 39 thread 1)", () => {
    // The LAST source wins regardless of what kind it is -- here that's an
    // explicit `className=` that pulses on its own, irrespective of
    // whatever `props` carries (deliberately given a clean className, to
    // isolate that the explicit source -- not just "any explicit source
    // exists" -- is what's being read).
    const fixture =
      'const props = { className: "text-green" };\nexport function A() { return <span {...props} className="text-alert-red animate-pulse">Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("resolves two spreads on the same tag, keeping the LAST one when only it pulses (round 39 thread 1)", () => {
    // Neither spread is a literal className=, so this also exercises that
    // `collectSpreadClassSources`/`isTopLevelAttributePosition` correctly
    // treats two independent top-level spreads on the same tag as two
    // separate ordered sources rather than merging or only ever seeing the
    // first.
    const fixture =
      'const a = { className: "text-green" };\nconst b = { className: "text-alert-red animate-pulse" };\nexport function A() { return <span {...a} {...b}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("resolves an INLINE object literal spread's own className (#874 round 40 thread 1)", () => {
    // `{...{ className: "…" }}` -- the spread's expression is neither a bare
    // identifier nor a dotted chain, so the round-38/39 `SPREAD_ATTR_RE`
    // (identifier-chain-only) never matched it at all, leaving the tag with
    // no class source whatsoever. Verified red on revert against a59fb83b
    // (round 39 head): `scanSourceForViolations` returned `[]` there.
    const fixture = 'export function A() { return <span {...{ className: "text-alert-red animate-pulse" }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("still lets an explicit className AFTER an inline-object spread win, even when the spread's own className pulses", () => {
    // Attribute order still governs: the LATER explicit `className=` here is
    // clean, so it -- not the earlier pulsing inline-object spread -- is
    // what actually renders.
    const fixture =
      'export function A() { return <span {...{ className: "text-alert-red animate-pulse" }} className="text-green">Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("resolves an inline object spread that itself spreads an identifier (`{...{ ...base, className }}`), last-wins", () => {
    // The inline object literal's OWN spread of `base` is resolved through
    // the same `resolveNestedEntrySpreads` replay `resolveInlineObjectClassName`
    // reuses -- `base.className` pulses and there's no later `className` key
    // in the inline literal to override it.
    const fixture =
      'const base = { className: "text-alert-red animate-pulse" };\nexport function A() { return <span {...{ ...base }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("fails closed (does not flag) a spread whose expression is a call, not an identifier or object literal", () => {
    // `getProps()` isn't a shape this scanner can evaluate at all -- left as
    // its own raw, unresolved text (the same "no idea what this refers to"
    // convention as an unresolvable identifier), never fabricating a
    // violation. Non-regression: the pre-round-40 parser also returned `[]`
    // here (it never matched a call expression as a spread at all).
    const fixture = 'export function A() { return <span {...getProps()}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("keeps an explicit pulsing className in force through a LATER spread whose inline object has no className key at all (#874 round 42 thread 1)", () => {
    // Before round 42, `findClassNameSites` picked the LAST source
    // unconditionally -- so this inline-object spread (which carries only
    // `title`, no `className`) still became the tag's winner, replacing
    // "text-red animate-pulse" with the object's own flattened literal
    // ("status", inert), silently erasing a real violation. Real JSX
    // renders "text-red animate-pulse" here unchanged, since `{ title:
    // "status" }` has nothing to override className WITH.
    const fixture =
      'export function A() { return <span className="text-red animate-pulse" {...{ title: "status" }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("keeps an explicit pulsing className in force through a LATER identifier spread whose resolved object has no className key", () => {
    const fixture =
      'const meta = { title: "status" };\nexport function A() { return <span className="text-red animate-pulse" {...meta}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("keeps an explicit pulsing className in force through a LATER spread whose inline object nests another spread that also lacks className", () => {
    const fixture =
      'const meta = { title: "status" };\nexport function A() { return <span className="text-red animate-pulse" {...{ ...meta }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("lets a LATER spread whose inline object sets `className: undefined` clear the explicit pulsing className (#874 round 43 thread 1, correcting round 42)", () => {
    // Round 42 thread 1 shipped this fixture asserting the OPPOSITE outcome
    // -- Codex correctly flagged it as backwards. Real JSX spread genuinely
    // sets `className` to `undefined` here, clearing "text-red animate-pulse"
    // at runtime, so the element does NOT pulse. The bug was in
    // `extractObjectEntries`: its identifier-only-value branch dropped the
    // `className` entry entirely whenever the value was made up solely of an
    // excluded keyword (`undefined`, via `IDENTIFIER_REF_KEYWORDS`), which
    // made `entries.has("className")` indistinguishable from the key being
    // fully ABSENT (`{ title: "status" }`, the previous fixture above) --
    // conflating "present but empty" with "never written at all". Round 43
    // fixes this by registering the entry regardless (with an empty
    // `literal` when nothing readable was found), so KEY PRESENCE alone now
    // drives the override, matching real JSX semantics.
    const fixture =
      'export function A() { return <span className="text-red animate-pulse" {...{ className: undefined }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("lets a LATER spread whose inline object sets `className: null` clear the explicit pulsing className (#874 round 43 thread 1)", () => {
    // Same gap as the `undefined` fixture above -- `null` is also excluded by
    // `IDENTIFIER_REF_KEYWORDS`, so before round 43 this key was dropped from
    // `entries` too. `{...{ className: null }}` clears `className` at
    // runtime exactly like `undefined` does, so the element does not pulse.
    const fixture =
      'export function A() { return <span className="text-red animate-pulse" {...{ className: null }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("lets a LATER spread whose inline object sets `className: \"\"` clear the explicit pulsing className", () => {
    // Not a round-43 regression -- an empty string literal already produces
    // a (empty) body via `extractLiteralBodies`, so `entries.has("className")`
    // was already `true` for this shape before this round; included here to
    // pin the presence-vs-value-readability distinction down for the empty-
    // string case explicitly, alongside its `undefined`/`null` siblings
    // above (Codex, PR #874 round 43 thread 1 sweep).
    const fixture =
      'export function A() { return <span className="text-red animate-pulse" {...{ className: "" }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).toEqual([]);
  });

  it("still catches the pulsing branch of a LATER spread whose inline object sets `className: cond ? \"text-red animate-pulse\" : \"text-xs\"`", () => {
    // Also not a round-43 regression -- `extractLiteralBodies` finds both
    // branches' own quoted bodies regardless of the surrounding ternary
    // syntax, so `entries.has("className")` was already `true` here too.
    // This key's resolved (imprecise, whole-ternary) literal folds BOTH
    // branches' text together, so a pulsing branch is caught the same way an
    // unconditional pulsing literal would be -- the census can't evaluate
    // `cond` at scan time, so it can't narrow to just the branch that would
    // actually render, and doesn't try to (Codex, PR #874 round 43 thread 1
    // sweep).
    const fixture =
      'export function A() { return <span className="text-green" {...{ className: cond ? "text-red animate-pulse" : "text-xs" }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture)).not.toEqual([]);
  });

  it("fails closed on an UNRESOLVABLE spread after an explicit className -- keeps the explicit class visible rather than guessing (#874 round 42 thread 1)", () => {
    // This scanner has no model at all for what a call expression
    // (`getExtraProps()`) evaluates to, so it can't rule out -- or confirm --
    // that the call's return value carries its own `className` key that
    // would override "text-red animate-pulse" at runtime. Guessing "yes, it
    // overrides" would silently erase a real violation behind ANY
    // unresolvable spread; keeping the explicit class in force instead is
    // the same fail-closed direction this file already takes for every
    // other unresolvable reference (Codex, PR #874 round 42 thread 1).
    const fixture =
      'export function A() { return <span className="text-red animate-pulse" {...getExtraProps()}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches a parenthesised ternary spread's pulsing true-branch (`{...(active ? alertProps : safeProps)}`, #874 round 43 thread 2)", () => {
    // Before round 43, `classifySpreadExpression`'s catch-all "anything
    // else" branch treated the WHOLE parenthesised ternary as an opaque,
    // unresolvable expression -- it never even tried to resolve `alertProps`
    // or `safeProps`. `classifyBranchExpression` now unwraps the grouping
    // parens, splits the ternary, resolves each identifier branch through
    // the same declaration logic a bare `{...alertProps}` already used, and
    // unions them: `alertProps` pulses, so the site is flagged regardless of
    // which branch a real render would actually take.
    const fixture =
      'const alertProps = { className: "text-alert-red animate-pulse" };\n' +
      'const safeProps = { className: "text-xs" };\n' +
      'export function A({ active }: { active: boolean }) { return <span {...(active ? alertProps : safeProps)}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches a bare (unparenthesised) ternary spread's pulsing branch, both branches inline object literals", () => {
    // `{...expr}` already accepts any AssignmentExpression -- a ternary
    // needs no wrapping parens to be valid JS here. Both branches are inline
    // object literals this time instead of identifiers, resolved through
    // `resolveInlineObjectClassName` the same way a single inline-object
    // spread already was before this round.
    const fixture =
      'export function A({ active }: { active: boolean }) { return <span {...active ? { className: "text-alert-red animate-pulse" } : { className: "text-xs" }}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches a nested ternary spread's pulsing branch (`active ? alertProps : idle ? warnProps : safeProps`)", () => {
    // The pulsing branch (`warnProps`) is chained into the FALSE side of the
    // outer ternary -- `splitTopLevelTernary`'s first split has to land on
    // the first top-level `:` (right-associative chaining), leaving `idle ?
    // warnProps : safeProps` for the recursive call on `ifFalse` to split
    // again.
    const fixture =
      'const alertProps = { className: "text-xs" };\n' +
      'const warnProps = { className: "text-caution-amber animate-pulse" };\n' +
      'const safeProps = { className: "text-xs" };\n' +
      'export function A({ active, idle }: { active: boolean; idle: boolean }) {\n' +
      '  return <span {...(active ? alertProps : idle ? warnProps : safeProps)}>Loading</span>;\n' +
      '}';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches a `cond && obj` spread's pulsing object regardless of whether `cond` itself resolves to anything", () => {
    // `active` is just a boolean prop, never declared as a class-shaped
    // const -- it isn't meant to resolve as a className source at all.
    // Spreading a falsy `&&` result (`{...false}`) is a real, valid JS
    // no-op, so `classifyBranchExpression`'s `&&` branch never requires the
    // left operand to resolve; only the right operand (`alertProps`) does.
    const fixture =
      'const alertProps = { className: "text-alert-red animate-pulse" };\n' +
      'export function A({ active }: { active: boolean }) { return <span {...(active && alertProps)}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches `cond ? obj : {}`'s pulsing true-branch against an empty-object false-branch", () => {
    // The false-branch is a genuine empty object literal (`{}`) -- resolvable
    // (an object literal's own shape is always fully known), just supplying
    // no `className` of its own, unioned with the true-branch's pulsing one.
    const fixture =
      'const alertProps = { className: "text-alert-red animate-pulse" };\n' +
      'export function A({ active }: { active: boolean }) { return <span {...(active ? alertProps : {})}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches `obj ?? fallback`'s pulsing left operand", () => {
    const fixture =
      'const alertProps = { className: "text-alert-red animate-pulse" };\n' +
      'const safeProps = { className: "text-xs" };\n' +
      'export function A({ overrideProps }: { overrideProps?: typeof alertProps }) {\n' +
      '  return <span {...(alertProps ?? safeProps)}>Loading</span>;\n' +
      '}';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("catches `a || b`'s pulsing right operand, both branches inline object literals", () => {
    const fixture =
      'export function A() { return <span {...({ className: "text-xs" } || { className: "text-alert-red animate-pulse" })}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });

  it("does not flag a ternary spread when NEITHER branch pulses (regression control for the union logic)", () => {
    const fixture =
      'const safeProps = { className: "text-xs" };\n' +
      'const idleProps = { className: "text-signal-green" };\n' +
      'export function A({ active }: { active: boolean }) { return <span {...(active ? safeProps : idleProps)}>Loading</span>; }';
    expect(scanSourceForViolations(fixture), fixture).toEqual([]);
  });

  it("fails closed on a ternary spread after an explicit className when one branch is unresolvable -- keeps the explicit class visible rather than guessing", () => {
    // `getSafeStuff()` is a call expression, the same catch-all-unresolvable
    // shape a bare `{...getExtraProps()}` already fails closed on. Both
    // branches of a ternary/`||`/`??` must resolve for the union to apply;
    // since this one doesn't, the WHOLE expression fails closed exactly like
    // any other unresolvable spread, leaving the earlier explicit
    // "text-red animate-pulse" in force rather than guessing whether
    // `getSafeStuff()`'s return value would have overridden it.
    const fixture =
      'const alertProps = { className: "text-alert-red animate-pulse" };\n' +
      'export function A({ active }: { active: boolean }) {\n' +
      '  return <span className="text-red animate-pulse" {...(active ? alertProps : getSafeStuff())}>Loading</span>;\n' +
      '}';
    expect(scanSourceForViolations(fixture), fixture).not.toEqual([]);
  });
});

describe("scanModuleForViolations resolves imported animate-pulse class bindings across modules (#874 round 28)", () => {
  // `export const alertClasses = "text-alert-red animate-pulse"` in module A
  // and `<span className={alertClasses}>Critical</span>` in module B was
  // invisible to the census: B never mentions "animate-pulse" literally (so
  // the per-file prefilter skipped it) and even without the prefilter,
  // `collectConstTemplateMap` only ever sees one file's own declarations.
  // `collectExportedPulseBindings` (pass 1) + `resolveImportedDecls` (pass 2)
  // fix this without touching single-file scanning; `scanModuleForViolations`
  // drives both against an in-memory `{path: source}` map so these fixtures
  // never touch disk.
  const aSource = 'export const alertClasses = "text-alert-red animate-pulse";';

  it("flags a named import of a pulsing exported const", () => {
    const bSource =
      'import { alertClasses } from "@/lib/a";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a renamed (`as`) named import of a pulsing exported const", () => {
    const bSource =
      'import { alertClasses as ac } from "@/lib/a";\nexport function B() { return <span className={ac}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a namespace import (`import * as ns`) member access into a pulsing export", () => {
    const bSource =
      'import * as s from "./a";\nexport function B() { return <span className={s.alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("keeps a namespace import's non-pulsing sibling member (`.safe`) clean instead of falling back to the aggregate (round 37)", () => {
    // Round 18's namespace map used to carry ONLY the source module's
    // pulsing exports -- `styles.safe` (a genuinely clean sibling) had no
    // entry of its own to narrow against, so `resolveMemberAccess` failed
    // to narrow on its first segment and `resolveConstRefs`'s separate
    // bare-identifier pass substituted the WHOLE namespace's aggregate
    // literal (which DOES carry `alert`'s pulse class) instead -- a false
    // positive on a clean member (Codex, PR #874 round 37).
    const mSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const bSource =
      'import * as styles from "./m";\nexport function B() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/m.ts": mSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags a namespace import's genuinely pulsing member (`.alert`) next to a clean sibling", () => {
    const mSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const bSource =
      'import * as styles from "./m";\nexport function B() { return <span className={styles.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/m.ts": mSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("fails OPEN (not closed) on a namespace member the module never exports at all (round 37)", () => {
    // `styles.missing` names no key in `m`'s export map at all -- same
    // pre-existing mechanic as any other unmatched precise member access on
    // any object decl (see Thread 1's shorthand-method fixture): the chain
    // never narrows on its first segment, so `resolveMemberAccess` leaves it
    // untouched, and `resolveConstRefs`'s own separate generic
    // bare-identifier pass then substitutes `styles` with the WHOLE
    // namespace decl's own flattened literal (every member's literal joined,
    // including `alert`'s `"animate-pulse"`) -- so this FAILS OPEN (flags a
    // false positive) rather than failing closed. Not something this round
    // introduces or fixes; documented here so it isn't mistaken for a gap in
    // the round-37 namespace fix itself.
    const mSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const bSource =
      'import * as styles from "./m";\nexport function B() { return <span className={styles.missing}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/m.ts": mSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("keeps a namespace import's clean sibling precise when the SOURCE module only became pulsing through an IMPORTED alias (#874 round 41 thread 2)", () => {
    // `middle.ts` never contains the pulse class literally -- it only
    // becomes pulsing by importing `pulse` from `base.ts` and re-exporting a
    // local alias of it (`export const alert = pulse;`), the round-33
    // import-alias path (stage three), not the direct-export path (stage
    // one) round 37's own `hasPulsing`-retains-every-member fix already
    // covers. Before round 41, stage three's own loop tested and kept each
    // export independently, so `safe` (clean, resolves to no pulse class)
    // was filtered out of `middle`'s copy in `byModule` entirely -- a
    // namespace import of `middle` had no `safe` entry to narrow against,
    // so `styles.safe` fell back to the namespace's aggregate literal
    // (which DOES carry `alert`'s `"animate-pulse"`) and was wrongly
    // flagged. Verified red on revert against c8e4bc7d.
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nexport const alert = pulse;\nexport const safe = "text-green";';
    const bSource =
      'import * as styles from "./middle";\nexport function B() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags the genuinely pulsing imported-alias export through the same namespace import", () => {
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nexport const alert = pulse;\nexport const safe = "text-green";';
    const bSource =
      'import * as styles from "./middle";\nexport function B() { return <span className={styles.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("carries the same fix through a LOCAL NAMED export list (`export { alert as pulseClass, safe };`), not just inline `export const` (#874 round 41 thread 2 sweep)", () => {
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nconst alert = pulse;\nconst safe = "text-green";\nexport { alert as pulseClass, safe };';
    const bSource =
      'import * as styles from "./middle";\nexport function B() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("carries the same clean-sibling fix through a NAMED BARREL re-export (`export { alert, safe } from \"./middle\";`) (#874 round 41 thread 2 sweep)", () => {
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nexport const alert = pulse;\nexport const safe = "text-green";';
    const barrelSource = 'export { alert, safe } from "./middle";';
    const bSource =
      'import * as ns from "./barrel";\nexport function B() { return <span className={ns.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/barrel.ts": barrelSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags the pulsing member through the same named-barrel re-export of an imported-alias module", () => {
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nexport const alert = pulse;\nexport const safe = "text-green";';
    const barrelSource = 'export { alert, safe } from "./middle";';
    const bSource =
      'import * as ns from "./barrel";\nexport function B() { return <span className={ns.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/barrel.ts": barrelSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("carries the same clean-sibling fix through an `export * from` BARREL of an imported-alias module (#874 round 41 thread 2 sweep)", () => {
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nexport const alert = pulse;\nexport const safe = "text-green";';
    const barrelSource = 'export * from "./middle";';
    const bSource =
      'import * as ns from "./barrel";\nexport function B() { return <span className={ns.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/barrel.ts": barrelSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("carries the same clean-sibling fix through a DEFAULT re-export alongside a named one (`export { default as pulseClass, safe } from \"./middle\";`) (#874 round 41 thread 2 sweep)", () => {
    // `middle.ts` exports a LOCAL alias of the import (`const alert = pulse;`)
    // as its DEFAULT export (not a named one) alongside a clean named `safe`
    // export -- exercising the same stage-three retention fix for the
    // `"default"` key specifically, since `collectExportedNames`'s
    // `defaultRe` and `resolveImportedDecls`'s own `pulsing.get("default")`
    // path both key off that reserved name. (`export default pulse;` --
    // re-exporting the bare IMPORTED identifier directly, with no local
    // declaration of its own -- is a separate, pre-existing gap in stage
    // three unrelated to this round: `moduleLevelByName` only ever holds
    // LOCAL `const`/`let`/`var` declarations, never a bare import, so
    // `"default"`'s own localName lookup misses entirely regardless of the
    // retention fix; using a local alias here, the same shape
    // `collectExportedPulseBindings`'s existing "resolves a local
    // identifier-only alias of an imported pulsing binding" fixture already
    // covers for a NAMED export, avoids that unrelated gap and keeps this
    // fixture discriminating for the retention fix specifically.)
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nconst alert = pulse;\nexport default alert;\nexport const safe = "text-green";';
    const barrelSource = 'export { default as pulseClass, safe } from "./middle";';
    const bSource =
      'import * as ns from "./barrel";\nexport function B() { return <span className={ns.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/barrel.ts": barrelSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags the default-exported pulsing alias through the same barrel", () => {
    const baseSource = 'export const pulse = "animate-pulse";';
    const middleSource =
      'import { pulse } from "./base";\nconst alert = pulse;\nexport default alert;\nexport const safe = "text-green";';
    const barrelSource = 'export { default as pulseClass, safe } from "./middle";';
    const bSource =
      'import * as ns from "./barrel";\nexport function B() { return <span className={ns.pulseClass}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/middle.ts": middleSource,
      "src/lib/barrel.ts": barrelSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a computed member access into an imported object-valued const (fails closed over every key, same as a local one)", () => {
    const statusSource =
      'export const STATUS = { alert: "text-alert-red animate-pulse", ok: "text-xs" };';
    const bSource =
      'import { STATUS } from "@/lib/status";\nexport function B({ level }) { return <span className={STATUS[level]}>Status</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/status.ts": statusSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("does not flag an import of a name whose export has no animate-pulse, and does not add it to the census prefilter", () => {
    const plainSource = 'export const labelClasses = "text-xs uppercase";';
    const bSource =
      'import { labelClasses } from "@/lib/a";\nexport function B() { return <span className={labelClasses}>Label</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": plainSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
    expect(resolveImportedDecls("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("flags a named import of an exported statement's second declarator, not just its first", () => {
    // `export const safe = "text-xs", alertClasses = "text-alert-red
    // animate-pulse";` used to register only `safe` in the export map --
    // `collectExportedNames`'s old regex captured just the first name after
    // `export const` (Codex, PR #874 round 35).
    const aSource = 'export const safe = "text-xs", alertClasses = "text-alert-red animate-pulse";';
    const bSource =
      'import { alertClasses } from "@/lib/a";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a named import of an `export let` statement's second declarator (same multi-declarator fix, `let` keyword)", () => {
    const aSource = 'export let safe = "text-xs", alertClasses = "text-alert-red animate-pulse";';
    const bSource =
      'import { alertClasses } from "@/lib/a";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a renamed barrel re-export of a second-position declarator", () => {
    // Combines the multi-declarator export fix with an existing barrel
    // rename: `styles.ts` only becomes a pulsing module in `collectExported
    // PulseBindings`'s pass 1 if `collectExportedNames` finds `alertClasses`
    // at all -- which it couldn't, being the second declarator, before this
    // round's fix -- so the barrel's own rename (already correct, unaffected
    // by this bug) had nothing to propagate.
    const stylesSource = 'export const safe = "text-xs", alertClasses = "text-alert-red animate-pulse";';
    const indexSource = 'export { alertClasses as ac } from "./styles";';
    const bSource =
      'import { ac } from "./index";\nexport function B() { return <span className={ac}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("does not flag a second-position declarator's name that never carries the pulse class", () => {
    const aSource = 'export const alertClasses = "text-alert-red animate-pulse", safe = "text-xs";';
    const bSource =
      'import { safe } from "@/lib/a";\nexport function B() { return <span className={safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("ignores a type-only import entirely", () => {
    const bSource =
      'import type { AlertClasses } from "@/lib/a";\nexport function B() { return <span>No pulse here</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(resolveImportedDecls("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("resolves a local identifier-only alias of an imported pulsing binding (round 29 alias fix composes with round 28 imports)", () => {
    // `classes`'s own initializer (`alertClasses`) has no literal body of
    // its own -- it only reaches one through the imported decl `resolveImportedDecls`
    // registers for `alertClasses`, exactly the same "alias with no literal
    // body" shape round 29 fixes for a purely local const (Codex, PR #874
    // round 29).
    const bSource =
      'import { alertClasses } from "@/lib/a";\nconst classes = alertClasses;\nexport function B() { return <span className={classes}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/a.ts": aSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a named import of an exported alias of a same-module pulsing const (round 29 alias resolution applied to the exporter's own decl)", () => {
    // `alertClasses`'s own initializer (`pulse`) has no literal body of its
    // own -- pass 1 used to filter on the raw, unresolved literal
    // ("pulse"), which never contains "animate-pulse", so the export was
    // dropped even though the module itself is unambiguously pulsing
    // (Codex, PR #874 round 31).
    const exporterSource = 'const pulse = "text-alert-red animate-pulse";\nexport const alertClasses = pulse;';
    const bSource =
      'import { alertClasses } from "@/lib/exporter";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/exporter.ts": exporterSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a named import of an exported member-access alias into a same-module object const", () => {
    const exporterSource =
      'const STYLES = { alert: "text-alert-red animate-pulse", ok: "text-xs" };\nexport const alertClasses = STYLES.alert;';
    const bSource =
      'import { alertClasses } from "@/lib/exporter";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/exporter.ts": exporterSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("does not flag a named import of an exported alias of a same-module non-pulsing const", () => {
    const exporterSource =
      'export const otherClasses = "text-xs";\nexport const labelClasses = otherClasses;';
    const bSource =
      'import { labelClasses } from "@/lib/exporter";\nexport function B() { return <span className={labelClasses}>Label</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/exporter.ts": exporterSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("registers a namespace import's own members when a leading default binding precedes it (`import def, * as ns from \"…\"`) (#874 round 42 thread 2)", () => {
    // Before round 42, `nsMatch`'s anchored regex only matched a clause
    // starting with `*`, so `"def, * as styles"` fell through to the
    // brace-based default path with no `{...}` to anchor on -- the WHOLE
    // clause was taken as one bogus default name, and `styles` was never
    // registered as a decl at all, leaving `styles.alert` as inert raw text.
    const stylesSource =
      'export const alert = "text-alert-red animate-pulse";\nexport const safe = "text-xs";\nexport default safe;';
    const bSource =
      'import def, * as styles from "./styles";\nexport function B() { return <span className={styles.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("also registers the split-off default binding itself, not just the namespace object, from the same combined clause", () => {
    // On the unfixed parser, `def`'s registered name was the garbled whole
    // clause text ("def, * as styles"), which no real reference in the file
    // could ever match, so a plain `{def}` use stayed unresolved too.
    const stylesSource = 'export const alert = "text-alert-red animate-pulse";\nexport default alert;';
    const bSource =
      'import def, * as styles from "./styles";\nexport function B() { return <span className={def}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("keeps a namespace import's clean sibling precise through the same combined default+namespace clause (regression guard)", () => {
    const stylesSource =
      'export const alert = "text-alert-red animate-pulse";\nexport const safe = "text-xs";\nexport default safe;';
    const bSource =
      'import def, * as styles from "./styles";\nexport function B() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("already resolves both the default and named siblings in `import def, { a, b as c } from \"…\"` (baseline already handled this shape)", () => {
    // `braceMatch` anchors on the FIRST `{` in the clause regardless of what
    // precedes it, so `clause.slice(0, braceMatch.index)` already yielded
    // exactly `"def, "` before this round -- only the namespace form (no
    // `{...}` to anchor on) needed the leading-default split.
    const stylesSource =
      'export const alert = "text-alert-red animate-pulse";\nexport const safe = "text-xs";\nexport default safe;';
    const bSource =
      'import def, { alert, safe as clean } from "./styles";\nexport function B() { return <span className={alert}>{def}<span className={clean}>Idle</span></span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("ignores a type-only namespace import entirely (`import type * as ns from \"…\"`)", () => {
    const stylesSource = 'export const alert = "text-alert-red animate-pulse";';
    const bSource =
      'import type * as styles from "./styles";\nexport function B() { return <span>No pulse here</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(resolveImportedDecls("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("never chokes on a TypeScript `import ns = require(...)` clause -- it simply has no ` from` for the tokenizer to match, so it's silently ignored", () => {
    const stylesSource = 'export const alert = "text-alert-red animate-pulse";';
    const bSource =
      'import styles = require("./styles");\nexport function B() { return <span>No pulse here</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(resolveImportedDecls("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("tolerates odd whitespace/newlines inside a combined default+namespace clause", () => {
    const stylesSource =
      'export const alert = "text-alert-red animate-pulse";\nexport const safe = "text-xs";\nexport default safe;';
    const bSource =
      'import def,\n  *   as   styles\n  from "./styles";\nexport function B() { return <span className={styles.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("resolves a plain namespace import of a module with only a default-exported pulsing class (`ns.default`)", () => {
    const onlyDefaultSource = 'export default "text-alert-red animate-pulse";';
    const bSource =
      'import * as ns from "./onlyDefault";\nexport function B() { return <span className={ns.default}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/onlyDefault.ts": onlyDefaultSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });
});

describe("resolves a spread whose source is an IMPORTED binding, regardless of replay order (#874 round 36)", () => {
  // `collectConstTemplateMap`'s own spread-merge step used to look a
  // spread's source up only against its OWN local `decls` -- never the
  // `importedDecls` its caller was separately handed -- so `const styles =
  // { safe: "text-green", ...base };` where `base` only exists as an
  // IMPORTED binding (never declared locally in this file) always fell into
  // the round-34 "unresolvable spread" fallback, no matter how genuinely
  // resolvable `base` was through the import graph. Fixed by threading
  // `importedDecls` into `collectConstTemplateMap`'s own internal
  // `visibleDecl` lookups for both the spread queue and the destructure
  // queue (Codex, PR #874 round 36).

  it("overwrites a local non-pulsing entry with an imported spread source's own value for the same key", () => {
    const baseSource = 'export const base = { safe: "animate-pulse" };';
    const bSource =
      'import { base } from "@/lib/base";\nconst styles = { safe: "text-green", ...base };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/base.ts": baseSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("does not fail closed on a precise key defined before an imported, resolvable spread that never touches that key", () => {
    // Round 34's rule: an *unresolvable* spread fails closed and marks every
    // key defined before it "open" (replaced with the whole object's own
    // flattened literal). `base` here resolves (it's a real import, pulsing
    // via its own `banner` key) and never declares `safe`/`noisy`, so
    // neither should be marked open. Before this round's fix, `base` looked
    // unresolvable purely because it's only visible through `importedDecls`
    // -- and the object's own flattened literal (which picks up "animate-
    // pulse" from the unrelated `noisy` field) would wrongly satisfy the
    // pulse check for `styles.safe` too. (`noisy`'s value is deliberately
    // `"text-red animate-pulse"`, not a bare `"animate-pulse"` field, so
    // this fixture doesn't also trip the separate config-map-mixing
    // heuristic in `findConfigMapViolations`.)
    const baseSource = 'export const base = { banner: "animate-pulse" };';
    const bSource =
      'import { base } from "@/lib/base";\nconst styles = { safe: "text-green", noisy: "text-red animate-pulse", ...base };\nexport function A() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/base.ts": baseSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("resolves a scalar export whose value comes from a member access into a spread of an imported map, through the collectExportedPulseBindings fixpoint", () => {
    // `mid.ts` never mentions "animate-pulse" literally -- it only imports
    // `base` and spreads it into a local object (`combined`), then exports a
    // member access into that spread-merged object. Pass 1's per-file
    // prefilter skips `mid.ts` outright; only the round-33 import-alias
    // fixpoint (stage 3) even looks at it, and that stage used to recompute
    // `combined`'s entries ONCE, with no imports known yet -- so `combined`'s
    // spread of `base` could never resolve no matter how many further
    // fixpoint iterations ran. Fixed by recomputing `localDecls` fresh each
    // iteration, with that iteration's own `importedDecls` passed through
    // (Codex, PR #874 round 36).
    const baseSource = 'export const base = { alert: "text-alert-red animate-pulse" };';
    const midSource =
      'import { base } from "./base";\nconst combined = { ...base };\nexport const midAlert = combined.alert;';
    const componentSource =
      'import { midAlert } from "./mid";\nexport function C() { return <span className={midAlert}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/mid.ts": midSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("resolves a JSX spread whose object binding is an IMPORTED export (round 38 thread 1 sweep)", () => {
    // Same `{...ident}` spread resolution as the plain local-binding fixture
    // above, but through the same import-aware `importedDecls` plumbing this
    // whole describe block exists to cover -- `findClassNameSites`'s new
    // spread pass is handed the exact same `constMap` (local decls +
    // `importedDecls` appended) every other resolution path in this file
    // already uses, so no separate import-awareness code was needed.
    const stylesSource = 'export const alertStyles = { className: "text-alert-red animate-pulse" };';
    const componentSource =
      'import { alertStyles } from "@/lib/alertStyles";\nexport function A() { return <span {...alertStyles}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/alertStyles.ts": stylesSource,
      "src/components/A.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/components/A.tsx", componentSource, exportsMap)).not.toEqual([]);
  });
});

describe("registers an EXPORTED destructuring declarator's own bindings in the export map (#874 round 39 thread 2)", () => {
  it("resolves a plain exported destructure (`export const { alert } = styles;`) across modules", () => {
    // Before this round, `collectExportedNames` advanced past a `{`/`[`
    // pattern after `export const/let/var` without registering any of the
    // names it introduces -- `alert` never made it into the `exported` map
    // at all, even though the plain (non-exported) destructuring machinery
    // already registered it as a normal module-level `ConstDecl` (the
    // `\b(const|let|var)\s+` scan in `collectConstTemplateMap` matches
    // "const" inside "export const" too). So a consumer's `import { alert }
    // from "./styles"` had no export entry to resolve against, no matter
    // what `styles` itself resolved to. Verified red on revert against
    // 74bb7a0f (round 38 head): `scanModuleForViolations` returned `[]`
    // there.
    const stylesSource = 'const styles = { alert: "text-alert-red animate-pulse" };\nexport const { alert } = styles;';
    const componentSource =
      'import { alert } from "@/lib/styles";\nexport function A() { return <span className={alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/components/A.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/components/A.tsx", componentSource, exportsMap), componentSource).not.toEqual(
      [],
    );
  });

  it("resolves a RENAMED exported destructure (`export const { alert: cls } = styles;`) across modules", () => {
    // Same gap, through the renamed-binding shape: the local/exported name
    // is `cls`, not `alert` -- `collectPatternLocalNames` must register the
    // LOCAL (renamed) name, since that's the only name a consumer can ever
    // import. Verified red on revert against 74bb7a0f.
    const stylesSource =
      'const styles = { alert: "text-alert-red animate-pulse" };\nexport const { alert: cls } = styles;';
    const componentSource =
      'import { cls } from "@/lib/styles";\nexport function A() { return <span className={cls}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/components/A.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/components/A.tsx", componentSource, exportsMap), componentSource).not.toEqual(
      [],
    );
  });

  it("carries round 38's destructuring-default handling through an EXPORTED destructure too", () => {
    // `styles` genuinely lacks a `cls` key, so the default itself
    // ("animate-pulse") is what has to reach the consumer through the
    // export map -- proves `collectExportedNames`'s new pattern parse reuses
    // `parseDestructuringPattern`'s existing default-literal handling
    // (`defaultLiteral`), not just the plain/renamed key path. Verified red
    // on revert against 74bb7a0f: the pattern was skipped entirely there, so
    // `cls` never resolved to anything and `scanModuleForViolations`
    // returned `[]`.
    const stylesSource =
      'const styles = { safe: "text-green" };\nexport const { cls = "animate-pulse" } = styles;';
    const componentSource =
      'import { cls } from "@/lib/styles";\nexport function A() { return <span className={cls}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/components/A.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/components/A.tsx", componentSource, exportsMap), componentSource).not.toEqual(
      [],
    );
  });

  it("does not flag a consumer of an exported destructure whose resolved value is genuinely clean", () => {
    // Precision check: the export map must carry the PRESENT key's own
    // value, not just "the pattern exists" -- `alert` here never pulses.
    const stylesSource = 'const styles = { alert: "text-green" };\nexport const { alert } = styles;';
    const componentSource =
      'import { alert } from "@/lib/styles";\nexport function A() { return <span className={alert}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/components/A.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/components/A.tsx", componentSource, exportsMap)).toEqual([]);
  });
});

describe("resolves a spread inside a NESTED object literal against an IMPORTED map (#874 round 36b)", () => {
  it("resolves a nested spread whose source is an imported binding, through a member-access chain into the consumer", () => {
    // Same gap as the local-map fixture above (`extractObjectEntries`'s
    // recursive call dropped a nested object's own `spreads`/`order`
    // entirely), but through `b.tsx`'s own IMPORTED `base` rather than a
    // local one -- exercises `resolveNestedEntrySpreads` against
    // `declsWithImports`, not just `decls` (Codex, PR #874 round 36b).
    const baseSource = 'export const base = { alert: "text-red animate-pulse" };';
    const bSource =
      'import { base } from "@/lib/base";\nconst styles = { group: { ...base, safe: "text-green" } };\nexport function A() { return <span className={styles.group.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/base.ts": baseSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("keeps the nested spread object's own precise, non-pulsing key clean past a resolvable imported spread", () => {
    const baseSource = 'export const base = { alert: "text-red animate-pulse" };';
    const bSource =
      'import { base } from "@/lib/base";\nconst styles = { group: { ...base, safe: "text-green" } };\nexport function A() { return <span className={styles.group.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({ "src/lib/base.ts": baseSource, "src/lib/b.tsx": bSource });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });
});

describe("collectExportedPulseBindings flags an object export that is pulsing only through a spread's entries (#874 round 36b)", () => {
  // `collectExportedPulseBindings`'s pulsing gate tested only the flattened
  // `decl.literal` -- an object-valued export whose entire content comes
  // from a spread (`export const mid = { ...base };`) never gets the pulse
  // class folded into that flattened literal (`extractLiteralBodies` only
  // sees quoted text physically written inside the initializer, and `{
  // ...base }` has none), so it could never be detected as pulsing by name
  // no matter how genuinely pulsing its spread source was.

  it("flags an object export that is only a spread of a LOCAL pulsing map", () => {
    // `mid.ts`'s own file DOES contain the pulse class literally (via
    // `base`, declared in the same file) so this exercises stage one's own
    // gate directly.
    const midSource =
      'const base = { alert: "text-red animate-pulse" };\nexport const mid = { ...base };';
    const componentSource =
      'import { mid } from "./mid";\nexport function C() { return <span className={mid.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mid.ts": midSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("flags the same shape through an IMPORT, where mid.ts's own file never mentions the pulse class literally", () => {
    // `mid.ts` never contains "animate-pulse" in its own text -- only
    // `base.ts` does -- so stage one's `rawSource.includes(PULSE_CLASS)`
    // prefilter skips `mid.ts` outright and its own gate never runs on it at
    // all. `mid.ts` still qualifies for stage three's independent
    // `importAliasCandidates` list (built from its own `/\bimport\b/ &&
    // /\bexport\b/` regex, with no dependency on stage one's prefilter), so
    // this exercises stage three's gate instead -- confirming stage one's
    // skip does not drop the module before stage three gets a chance at it.
    const baseSource = 'export const base = { alert: "text-red animate-pulse" };';
    const midSource = 'import { base } from "./base";\nexport const mid = { ...base };';
    const componentSource =
      'import { mid } from "./mid";\nexport function C() { return <span className={mid.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/base.ts": baseSource,
      "src/lib/mid.ts": midSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("flags a two-hop spread chain across modules (a = {...b}, b = {...c}, c pulsing)", () => {
    // Neither `a.ts` nor `b.ts` ever mentions the pulse class literally --
    // only `c.ts` does -- so this needs the entries-recursive gate to hold
    // through two full fixpoint hops (stage three re-running until `b`
    // itself resolves to pulsing via `c`'s entries, then `a` resolves via
    // `b`'s entries), bounded by the existing 10-iteration cap.
    const cSource = 'export const c = { alert: "text-red animate-pulse" };';
    const bSource = 'import { c } from "./c";\nexport const b = { ...c };';
    const aSource = 'import { b } from "./b";\nexport const a = { ...b };';
    const componentSource =
      'import { a } from "./a";\nexport function C() { return <span className={a.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/c.ts": cSource,
      "src/lib/b.ts": bSource,
      "src/lib/a.ts": aSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("does not flag a spread of a non-pulsing map as pulsing", () => {
    const plainSource = 'export const plain = { label: "text-xs uppercase" };';
    const midSource = 'import { plain } from "./plain";\nexport const mid = { ...plain };';
    const componentSource =
      'import { mid } from "./mid";\nexport function C() { return <span className={mid.label}>Label</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/plain.ts": plainSource,
      "src/lib/mid.ts": midSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).toEqual([]);
  });
});

describe("scanModuleForViolations follows class bindings through barrel re-exports (#874 round 30)", () => {
  // `styles.ts` declares `alertClasses` directly; `index.ts` never mentions
  // "animate-pulse" itself, it only forwards `styles.ts`'s export -- pass 1
  // (`collectExportedPulseBindings`) used to see no literal pulse class in
  // `index.ts` and skip it outright, so a consumer importing from the
  // barrel (a common pattern in this repo) resolved nothing.
  const stylesSource = 'export const alertClasses = "text-alert-red animate-pulse";';

  it("flags a named import from a barrel that re-exports a pulsing binding by name", () => {
    const indexSource = 'export { alertClasses } from "./styles";';
    const bSource =
      'import { alertClasses } from "./index";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a named import from a `export * from` barrel", () => {
    const indexSource = 'export * from "./styles";';
    const bSource =
      'import { alertClasses } from "./index";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags an import of a barrel's renamed (`as`) re-export", () => {
    const indexSource = 'export { alertClasses as ac } from "./styles";';
    const bSource =
      'import { ac } from "./index";\nexport function B() { return <span className={ac}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags an import through a two-level barrel chain", () => {
    // `outer.ts` re-exports from `inner.ts`, which itself only re-exports
    // from `styles.ts` -- neither barrel ever mentions the pulse class
    // literally, so the fixpoint propagation in `collectExportedPulseBindings`
    // has to run more than one pass for the binding to reach `outer.ts`.
    const innerSource = 'export { alertClasses } from "./styles";';
    const outerSource = 'export { alertClasses } from "./inner";';
    const bSource =
      'import { alertClasses } from "./outer";\nexport function B() { return <span className={alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/inner.ts": innerSource,
      "src/lib/outer.ts": outerSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("flags a namespace member access through a `export * as ns from` barrel", () => {
    // `index.ts` re-exports the whole `styles.ts` module as a single `ns`
    // namespace binding -- registered in `index.ts`'s own pulsing map as an
    // object decl whose `entries` mirror `styles.ts`'s pulsing exports, the
    // same shape a namespace *import* already builds (round 28), so
    // `ns.alertClasses` resolves through the existing dotted member-access
    // chain exactly as it would for a direct namespace import.
    const indexSource = 'export * as ns from "./styles";';
    const bSource =
      'import { ns } from "./index";\nexport function B() { return <span className={ns.alertClasses}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/styles.ts": stylesSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("does not flag an import of a barrel-re-exported binding whose export has no animate-pulse", () => {
    const plainSource = 'export const labelClasses = "text-xs uppercase";';
    const indexSource = 'export { labelClasses } from "./plain";';
    const bSource =
      'import { labelClasses } from "./index";\nexport function B() { return <span className={labelClasses}>Label</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/plain.ts": plainSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("keeps a `export { a, b as c }` barrel's renamed non-pulsing re-export clean through a namespace import of the barrel (round 37)", () => {
    // Round 37's fix isn't just about a DIRECT namespace import -- the
    // barrel's own map (`index.ts`'s entry in `byModule`) has to carry the
    // renamed clean sibling `c` too, since the `"named"` branch of the
    // barrel-propagation loop just copies whatever's in the source module's
    // map (`styles.ts`, now carrying every member per round 37) verbatim,
    // with no pulse-ness filter of its own.
    const mixedSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const indexSource = 'export { alert, safe as c } from "./mixed";';
    const bSource =
      'import * as styles from "./index";\nexport function B() { return <span className={styles.c}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mixed.ts": mixedSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags the same barrel's pulsing re-export through the same namespace import", () => {
    const mixedSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const indexSource = 'export { alert, safe as c } from "./mixed";';
    const bSource =
      'import * as styles from "./index";\nexport function B() { return <span className={styles.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mixed.ts": mixedSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("keeps a non-pulsing member clean through a namespace import of an `export * from` barrel (round 37)", () => {
    const mixedSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const indexSource = 'export * from "./mixed";';
    const bSource =
      'import * as styles from "./index";\nexport function B() { return <span className={styles.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mixed.ts": mixedSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags the pulsing member through the same `export * from` barrel's namespace import", () => {
    const mixedSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const indexSource = 'export * from "./mixed";';
    const bSource =
      'import * as styles from "./index";\nexport function B() { return <span className={styles.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mixed.ts": mixedSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });

  it("keeps a non-pulsing member clean through an `export * as ns from` barrel's own re-exported namespace (round 37)", () => {
    // Same "only pulsing" filter bug the coordinator asked to check for
    // "anywhere else" -- this `stmt.namespaceName` branch (a DIFFERENT site
    // than a direct namespace import's `nsMatch` branch) builds `ns`'s own
    // `entries` map by copying `sourcePulsing` (now carrying every member of
    // `mixed.ts`, per round 37) verbatim too.
    const mixedSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const indexSource = 'export * as ns from "./mixed";';
    const bSource =
      'import { ns } from "./index";\nexport function B() { return <span className={ns.safe}>Idle</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mixed.ts": mixedSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).toEqual([]);
  });

  it("still flags the pulsing member through the same `export * as ns from` barrel's re-exported namespace", () => {
    const mixedSource = 'export const alert = "animate-pulse";\nexport const safe = "text-green";';
    const indexSource = 'export * as ns from "./mixed";';
    const bSource =
      'import { ns } from "./index";\nexport function B() { return <span className={ns.alert}>Critical</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/mixed.ts": mixedSource,
      "src/lib/index.ts": indexSource,
      "src/lib/b.tsx": bSource,
    });
    expect(scanModuleForViolations("src/lib/b.tsx", bSource, exportsMap)).not.toEqual([]);
  });
});

describe("collectExportedPulseBindings propagates exports through a module's own imported aliases (#874 round 33)", () => {
  // `a.ts` exports `pulse` directly; `b.ts` never mentions "animate-pulse"
  // itself, it only imports `pulse` from `a.ts` and re-exports it under a
  // new name (`classes`) -- pass 1 used to resolve exports only against a
  // module's OWN declarations (or a re-export statement), so a module that
  // imports a binding and folds it into a fresh export (rather than
  // re-exporting the same name via `export { … } from`) was invisible to
  // the export map entirely (Codex, PR #874 round 33).
  const aSource = 'export const pulse = "animate-pulse";';

  it("flags a component importing a binding whose value came from an imported alias one module away", () => {
    const bSource = 'import { pulse } from "./a";\nexport const classes = pulse;';
    const componentSource =
      'import { classes } from "./b";\nexport function C() { return <span className={classes}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/a.ts": aSource,
      "src/lib/b.ts": bSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("flags a component through a three-module import-alias chain (a -> b -> c -> component)", () => {
    const bSource = 'import { pulse } from "./a";\nexport const middle = pulse;';
    const cSource = 'import { middle } from "./b";\nexport const classes = middle;';
    const componentSource =
      'import { classes } from "./c";\nexport function C() { return <span className={classes}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/a.ts": aSource,
      "src/lib/b.ts": bSource,
      "src/lib/c.ts": cSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("does not flag a component whose import-alias chain never touches a pulsing binding", () => {
    const plainSource = 'export const labelClasses = "text-xs uppercase";';
    const bSource = 'import { labelClasses } from "./plain";\nexport const classes = labelClasses;';
    const componentSource =
      'import { classes } from "./b";\nexport function C() { return <span className={classes}>Label</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/plain.ts": plainSource,
      "src/lib/b.ts": bSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).toEqual([]);
  });
});

describe("collectExportedPulseBindings resolves an inline default export (#874 round 37)", () => {
  // `export default { alert: "animate-pulse" };`/`export default
  // "animate-pulse";` used to be invisible: `collectExportedNames`'s
  // `defaultRe` only matched the bare-identifier form (`export default
  // name;`). `synthesizeInlineDefaultExports` rewrites the inline
  // expression into a separate `const` plus `export default <name>;` before
  // `collectExportedNames`/`collectConstTemplateMap` ever run, so the
  // EXISTING identifier-form machinery (unchanged) resolves it.
  it("flags a component consuming an inline OBJECT default export", () => {
    const mSource = 'export default { alert: "animate-pulse" };';
    const componentSource =
      'import Styles from "./m";\nexport function C() { return <span className={Styles.alert}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/m.ts": mSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("flags a component consuming an inline STRING default export", () => {
    const mSource = 'export default "animate-pulse";';
    const componentSource =
      'import cls from "./m";\nexport function C() { return <span className={cls}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/m.ts": mSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("flags a component consuming an inline TEMPLATE LITERAL default export with no ${}", () => {
    const mSource = "export default `animate-pulse`;";
    const componentSource =
      'import cls from "./m";\nexport function C() { return <span className={cls}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/m.ts": mSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("still flags a component consuming a bare-identifier default export (non-regression)", () => {
    const mSource = 'const pulse = "animate-pulse";\nexport default pulse;';
    const componentSource =
      'import cls from "./m";\nexport function C() { return <span className={cls}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/m.ts": mSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("flags a component consuming an inline default export that only spreads a local pulsing map", () => {
    const mSource = 'const base = { alert: "animate-pulse" };\nexport default { ...base };';
    const componentSource =
      'import Styles from "./m";\nexport function C() { return <span className={Styles.alert}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/m.ts": mSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).not.toEqual([]);
  });

  it("still ignores an `export default function`/`export default class` (known gap, unchanged by round 37)", () => {
    const mSource = 'export default function alert() { return "animate-pulse"; }';
    const componentSource =
      'import cls from "./m";\nexport function C() { return <span className={cls}>Loading</span>; }';
    const exportsMap = collectExportedPulseBindings({
      "src/lib/m.ts": mSource,
      "src/lib/component.tsx": componentSource,
    });
    expect(scanModuleForViolations("src/lib/component.tsx", componentSource, exportsMap)).toEqual([]);
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

describe("matchAnchorsToViolations pairs each anchor to at most one violation (#878 round 20)", () => {
  it("covers only the nearer of two violations when just one anchor is registered", () => {
    // Both violations sit inside the single anchor's +/-160-char window, but
    // only the nearer one (distance 50) may consume it -- the farther one
    // (distance 100) must come back uncovered, i.e. unlisted.
    const content = "anchor-one-marker" + "x".repeat(300);
    const violations: Violation[] = [
      { description: "near", index: 50 },
      { description: "far", index: 100 },
    ];
    const covered = matchAnchorsToViolations(content, ["anchor-one-marker"], violations);
    expect(covered.size).toBe(1);
    expect(covered.has(violations[0])).toBe(true);
    expect(covered.has(violations[1])).toBe(false);
  });

  it("covers both violations when each has its own nearby anchor", () => {
    const content =
      "anchor-one-marker" + "x".repeat(300) + "anchor-two-marker" + "y".repeat(300);
    const violations: Violation[] = [
      { description: "near anchor one", index: 20 },
      { description: "near anchor two", index: 320 },
    ];
    const covered = matchAnchorsToViolations(
      content,
      ["anchor-one-marker", "anchor-two-marker"],
      violations,
    );
    expect(covered.size).toBe(2);
  });

  it("finds a one-to-one assignment covering both violations even when the nearest pair alone would strand one", () => {
    // Two ten-character anchors at offsets 0 and 10. Anchor 1's window is
    // [0, 170]; anchor 2's window is [0, 180] (its own -160 clamps to 0).
    // Violation 1 (index 10) is nearest to anchor 2 (distance 0) but is
    // also inside anchor 1's window (distance 10). Violation 2 (index 171)
    // is outside anchor 1's window (171 > 170) and reachable only through
    // anchor 2. The nearest-pair-first greedy fixes violation 1 to anchor 2
    // immediately (distance 0 is the closest pair overall) and leaves
    // violation 2 stranded, even though anchor 1 -> violation 1 and
    // anchor 2 -> violation 2 is a valid one-to-one assignment covering
    // both (Codex, PR #874 round 22).
    const content = "aaaaaaaaaa" + "bbbbbbbbbb" + "x".repeat(200);
    const violations: Violation[] = [
      { description: "near anchor two, but reachable from anchor one too", index: 10 },
      { description: "reachable only from anchor two", index: 171 },
    ];
    const covered = matchAnchorsToViolations(
      content,
      ["aaaaaaaaaa", "bbbbbbbbbb"],
      violations,
    );
    expect(covered.size).toBe(2);
    expect(covered.has(violations[0])).toBe(true);
    expect(covered.has(violations[1])).toBe(true);
  });
});

describe("buildAnchorMatchingContent keeps JSX-comment anchors working after comment-blanking (#874 round 23)", () => {
  it("still covers a real pulsing element anchored on its own `{/* Marker */}` comment", () => {
    const fixture =
      "function Widget() {\n" +
      "  return (\n" +
      "    <div>\n" +
      "      {/* Marker */}\n" +
      '      <span className="animate-pulse text-alert-red">Critical</span>\n' +
      "    </div>\n" +
      "  );\n" +
      "}\n";
    const violations = scanSourceForViolations(fixture);
    expect(violations).toHaveLength(1);
    const content = buildAnchorMatchingContent(fixture, ["Marker"]);
    const covered = matchAnchorsToViolations(content, ["Marker"], violations);
    expect(covered.size).toBe(1);
  });

  it("finds zero sites (so nothing needs covering) when the only pulsing-looking markup is inside a comment", () => {
    const fixture = '{/* <span className="animate-pulse">Loading</span> */}';
    const violations = scanSourceForViolations(fixture);
    expect(violations).toEqual([]);
    const content = buildAnchorMatchingContent(fixture, ["Marker"]);
    const covered = matchAnchorsToViolations(content, ["Marker"], violations);
    expect(covered.size).toBe(0);
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
