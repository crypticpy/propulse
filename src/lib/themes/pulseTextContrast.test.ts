/**
 * animate-pulse on measured/tinted text (#847, follow-up to #827)
 *
 * Tailwind's `animate-pulse` fades the WHOLE element it is applied to down
 * to 50% opacity at the trough. On a decorative dot that is harmless; on an
 * element that also carries the text a user reads, it halves that text's
 * contrast against its background for half of every animation cycle -- the
 * exact defect #827 found on `Badge`'s `storm` variant (2.3-3.4:1 measured,
 * see `statusTintContrast.test.ts`) and this issue's census found repeated
 * at ~130 `animate-pulse` sites across `src/`.
 *
 * Census (every `animate-pulse`/`animate-pulse-glow` hit under `src/`,
 * traced to its render site):
 *
 *   - Decorative, no text (status dots, skeleton blocks, glow rings, the
 *     bottom marquee bars on toasts, `LoadingDots`, `ProfileSkeleton`, the
 *     SVG dot in `SolarFluxModal`): left alone. This is the majority of the
 *     ~130 hits.
 *   - Plain body/muted text with no tint ("Loading...", "Analyzing
 *     propagation...", "Waiting for decodes...", the export-feedback toast
 *     in `RegionPresetManager`, the storm-risk line in `SolarSnapshot`, the
 *     share-status lines in `ShareCard`/`QRCodeModal`): not measured or
 *     fixed this round -- flagged for a follow-up census slice, since the
 *     15-file budget goes to tinted text first per the issue.
 *   - `animate-pulse-glow` (custom keyframe, `pulseGlow` in
 *     `tailwind.config.js`, opacity floor 0.8 not Tailwind's 0.5): a
 *     different animation than the one this issue scopes; the trough is far
 *     shallower. Out of scope (`Header.tsx`, `AlertBanner.tsx`,
 *     `CheckinPhase.tsx`).
 *   - Text on a status/accent tint, pulsing the whole element (the
 *     violation): fixed below, 14 files. `BandConditionsPanel.tsx`'s GL/Es/
 *     OPEN badges were the issue's named suspicion and are confirmed here.
 *
 * Fix pattern used per site:
 *   - Where a decorative dot/icon sibling already existed next to the text
 *     (`ContestCalendar`'s `LIVE` badge, `DxccStatusBadge`'s status pill),
 *     the pulse moved onto that sibling instead of the text.
 *   - Where no sibling existed, the pulse was removed outright -- the same
 *     resolution #827 chose for `Badge`'s `storm` variant rather than
 *     inventing new decorative markup with no design mandate (see that
 *     file's history). An always-legible static badge beats one that is
 *     illegible for half of every second.
 *
 * This guard is content-keyed (a substring of the class string), not
 * line-number-keyed, so it survives unrelated reformatting/reordering
 * elsewhere in the file -- same convention as
 * `src/components/map/subTextSizeFloor.test.ts`. Whitespace is collapsed
 * before matching so multi-line template-literal class strings don't need
 * an exact indentation match.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

interface FixedSite {
  file: string;
  what: string;
  /** Substring (whitespace-insensitive) that must NOT reappear -- the
   * violating text-plus-pulse pairing this session removed. */
  before: string;
  /** Substring (whitespace-insensitive) that must still be present -- proves
   * the site wasn't just deleted, so this guard can't pass on a stale
   * entry. */
  after: string;
}

const FIXED_SITES: FixedSite[] = [
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "greyline GL badge (the issue's named suspicion)",
    before: "bg-amber-500/20 text-amber-400 animate-pulse",
    after: "bg-amber-500/20 text-amber-400",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "sporadic-E Es badge (the issue's named suspicion)",
    before: "bg-purple-500/20 text-purple-400 animate-pulse",
    after: "bg-purple-500/20 text-purple-400",
  },
  {
    file: "src/components/map/BandConditionsPanel.tsx",
    what: "band-opening OPEN badge (the issue's named suspicion)",
    before: "bg-signal-green/20 text-signal-green animate-pulse",
    after: "bg-signal-green/20 text-signal-green",
  },
  {
    file: "src/components/atmos/WeatherAlertToast.tsx",
    what: "CRITICAL badge",
    before: "text-alert-red bg-alert-red/20 flex-shrink-0 animate-pulse",
    after: "text-alert-red bg-alert-red/20 flex-shrink-0",
  },
  {
    file: "src/components/alerts/SpotAlertToast.tsx",
    what: "NEW DXCC badge",
    before: "bg-alert-red/20 text-alert-red animate-pulse",
    after: "bg-alert-red/20 text-alert-red",
  },
  {
    file: "src/components/alerts/AlertToast.tsx",
    what: "CRITICAL badge",
    before: "${colors.bg} ${colors.text} flex-shrink-0 animate-pulse",
    after: "${colors.bg} ${colors.text} flex-shrink-0",
  },
  {
    file: "src/components/dx/DXSpotList/DXSpotList.tsx",
    what: "alert-match-count badge",
    before:
      "bg-alert-red/20 text-alert-red border border-alert-red/30 animate-pulse",
    after: "bg-alert-red/20 text-alert-red border border-alert-red/30",
  },
  {
    file: "src/components/contest/ContestCalendar.tsx",
    what: "LIVE badge (pulse moved to the existing dot, not the text)",
    before:
      "bg-signal-green/20 text-signal-green border border-signal-green/40 animate-pulse",
    after: "w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse",
  },
  {
    file: "src/components/qso/DxccStatusBadge.tsx",
    what: "status pill (pulse moved to the existing status dot, not the label)",
    before:
      '${config.bg} ${config.text} ${config.border} ${config.pulse ? "animate-pulse" : ""}',
    after: '${status === "dupe" ? "bg-su-line" : ""} ${config.pulse ? "animate-pulse" : ""}',
  },
  {
    file: "src/components/dx/SpotBadge.tsx",
    what: "ATNO badge",
    before: 'borderColor: "border-amber-400/60", animate: "animate-pulse",',
    after: 'borderColor: "border-amber-400/60",',
  },
  {
    file: "src/components/dx/SpotBadge.tsx",
    what: "ALERT badge",
    before: 'borderColor: "border-alert-red/50", animate: "animate-pulse",',
    after: 'borderColor: "border-alert-red/50",',
  },
  {
    file: "src/components/sdr/primitives/RadioBadge.tsx",
    what: "TX/RX/etc label pulse prop (now a documented no-op)",
    before: 'pulse ? "animate-pulse" : ""',
    after: "pulse: _pulse = false",
  },
  {
    file: "src/components/qso/ConflictBadge.tsx",
    what: "sync-conflict count badge",
    before: "text-caution-amber animate-pulse transition-colors",
    after: "text-caution-amber transition-colors",
  },
  {
    file: "src/components/qso/LotwSyncButton.tsx",
    what: "processing button label",
    before: "border-plasma-orange/30 animate-pulse",
    after: "border-plasma-orange/30",
  },
  {
    file: "src/components/contest/DupeIndicator.tsx",
    what: "DUPE badge",
    before:
      "text-alert-red font-bold text-sm uppercase tracking-wider animate-pulse high-contrast:border-alert-red high-contrast:bg-alert-red/30",
    after:
      "text-alert-red font-bold text-sm uppercase tracking-wider high-contrast:border-alert-red high-contrast:bg-alert-red/30",
  },
  {
    file: "src/components/contest/RigStatusBar.tsx",
    what: "TX badge",
    before: "bg-alert-red/20 border border-alert-red/50 text-alert-red animate-pulse",
    after: "bg-alert-red/20 border border-alert-red/50 text-alert-red",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "countdown text (compact and full displays)",
    before: "text-alert-red animate-pulse",
    after: "text-alert-red",
  },
  {
    file: "src/components/contest/ContestTimer.tsx",
    what: "off-time warning badge",
    before:
      "bg-alert-red/20 border border-alert-red/50 text-alert-red animate-pulse",
    after: "bg-alert-red/20 border border-alert-red/50 text-alert-red",
  },
];

/** Collapse all whitespace runs to a single space so a multi-line
 * template-literal class string matches regardless of indentation. */
function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const fileCache = new Map<string, string>();

function readNormalized(file: string): string {
  const cached = fileCache.get(file);
  if (cached !== undefined) return cached;
  const raw = readFileSync(resolve(REPO_ROOT, file), "utf8");
  const normalized = normalize(raw);
  fileCache.set(file, normalized);
  return normalized;
}

describe("animate-pulse does not ship on tinted/measured text (#847)", () => {
  it("has no reintroduced pulse-on-text at the audited sites", () => {
    const violations: string[] = [];
    for (const site of FIXED_SITES) {
      const content = readNormalized(site.file);
      if (content.includes(normalize(site.before))) {
        violations.push(
          `${site.file}: ${site.what} pulses the measured/tinted text again`,
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("every fixed site still exists in the audited files", () => {
    // Proves the table isn't stale: if a site was deleted (or its markup
    // changed enough that the anchor no longer matches) without updating
    // this entry, that's a silent gap in coverage, not a pass.
    for (const site of FIXED_SITES) {
      const content = readNormalized(site.file);
      expect(
        content.includes(normalize(site.after)),
        `${site.file}: "${site.what}" anchor not found -- update or remove this entry`,
      ).toBe(true);
    }
  });
});
