import { BAND_ORDER, BAND_RANGES } from "@/lib/data/bandRanges";
import { latLonToGrid } from "@/lib/utils/grid";
import {
  bandPlannerHrefForTarget,
  buildWizardSearchParams,
} from "@/lib/dxwizard";
import type { WizardMode, WizardPathMode } from "@/lib/dxwizard";
import { isValidClock, pathAlmanac } from "./almanac";
import { nearbySpots } from "./nearbySpots";
import { samplePathMuf } from "./pathMuf";
import type { DXSpot } from "@/types/dxcluster";
import type {
  DecisionReport,
  DecisionTone,
  DecisionVerdict,
  GreylineSummary,
  NearbySpotsResult,
  PathMufSample,
} from "./types";

const LOW_BANDS = new Set(["160m", "80m", "40m"]);
export const MIN_NOWCAST_SCORE = 0.35;
const GREYLINE_HORIZON_MS = 2 * 60 * 60 * 1000;

export const SPOTS_EXCLUDED_TIME_SHIFT =
  "spots excluded (time shift)" as const;

const EXCLUDED_NEARBY_EVIDENCE_BASIS =
  "Live spot evidence excluded (time shift)";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip the time-shift spot disclaimer for compact PathAnalysis display. */
export function stripTimeShiftFromVerdictLine(line: string): {
  hasTimeShift: boolean;
  body: string;
} {
  if (!line.includes(SPOTS_EXCLUDED_TIME_SHIFT)) {
    return { hasTimeShift: false, body: line };
  }
  const label = escapeRegExp(SPOTS_EXCLUDED_TIME_SHIFT);
  const body = line
    .replace(new RegExp(`;\\s*${label}`, "g"), "")
    .replace(new RegExp(`\\s*\\(\\s*${label}\\s*\\)\\s*`, "g"), "")
    .trim();
  return { hasTimeShift: true, body };
}

export interface NowCastHint {
  band: string;
  issueTime: string | null;
  fetchedAt: string | null;
}

export interface NowCastPredictionSlice {
  band: string;
  profile: string;
  personalized_probability: number;
  core_probability: number;
  issue_time: string;
}

export interface BuildDecisionInput {
  qth: { lat: number; lon: number; grid?: string };
  target: { lat: number; lon: number; name?: string; grid?: string };
  date: Date;
  /** Wall-clock of this computation. Modeled ionosphere/almanac still use `date`. */
  computedAt?: Date;
  pathMode: "short" | "long";
  sfi: number | null;
  sfiObservedAt?: string | null;
  sfiFetchedAt?: string | null;
  kp: number | null;
  txPowerWatts: number;
  mode: "SSB" | "CW" | "FT8";
  spots: DXSpot[];
  spotsObservedAt?: number | null;
  spotsFetchedAt?: number | null;
  radiusKm: number;
  nowCast?: NowCastHint | null;
  /** When false, live spot evidence was excluded (e.g. time-control replay). */
  evidenceLive?: boolean;
}

function wizardMode(mode: "SSB" | "CW" | "FT8"): WizardMode {
  return mode;
}

function hrefs(
  target: BuildDecisionInput["target"],
  mode: "SSB" | "CW" | "FT8",
  pathMode: "short" | "long",
): { wizardHref: string; plannerHref: string } {
  const grid =
    target.grid && target.grid.length >= 4
      ? target.grid.toUpperCase()
      : latLonToGrid(target.lat, target.lon, 4);
  const wizardPath: WizardPathMode = pathMode === "long" ? "long" : "short";
  const params = buildWizardSearchParams({
    target: {
      label: target.name || grid,
      grid,
      lat: target.lat,
      lon: target.lon,
      source: "map",
    },
    mode: wizardMode(mode),
    pathMode: wizardPath,
  });
  return {
    wizardHref: `/dx?${params.toString()}`,
    plannerHref: bandPlannerHrefForTarget(grid),
  };
}

function isoStamp(date: Date): string | null {
  return isValidClock(date) ? date.toISOString() : null;
}

/** True when any frequency in the band lies strictly inside (luf, muf). */
export function bandIntersectsWindow(
  band: string,
  lufMHz: number,
  mufMHz: number,
): boolean {
  if (!(lufMHz < mufMHz)) return false;
  const range = BAND_RANGES[band];
  if (!range) return false;
  return range.startKHz / 1000 < mufMHz && range.endKHz / 1000 > lufMHz;
}

/** Highest HF band that intersects the open (LUF, MUF) window. */
export function highestBandInWindow(
  lufMHz: number,
  mufMHz: number,
): string | null {
  for (let i = BAND_ORDER.length - 1; i >= 0; i--) {
    const band = BAND_ORDER[i];
    if (bandIntersectsWindow(band, lufMHz, mufMHz)) return band;
  }
  return null;
}

/**
 * Best NowCast band: `profile === "nowcast"` only, score at least `minScore`.
 * Physics fallback rows are ignored.
 */
export function favoredNowCastHint(
  nowcastBands: readonly string[],
  predictions: ReadonlyMap<string, NowCastPredictionSlice>,
  minScore = MIN_NOWCAST_SCORE,
): NowCastHint | null {
  let best: NowCastHint | null = null;
  let bestScore = -1;
  for (const band of nowcastBands) {
    const pred = predictions.get(band);
    if (!pred || pred.profile !== "nowcast") continue;
    const score = pred.personalized_probability ?? pred.core_probability;
    if (score < minScore) continue;
    if (score > bestScore) {
      bestScore = score;
      best = {
        band: pred.band,
        issueTime: pred.issue_time,
        fetchedAt: pred.issue_time,
      };
    }
  }
  return best;
}

function topNearbyBand(nearby: NearbySpotsResult): string | null {
  let best: string | null = null;
  let count = 0;
  for (const [band, n] of Object.entries(nearby.byBand)) {
    if (band === "unknown") continue;
    if (n > count) {
      best = band;
      count = n;
    }
  }
  return best;
}

function greylineWithinHorizon(
  greyline: GreylineSummary,
  date: Date,
): boolean {
  if (greyline.active) return false;
  if (!greyline.start || !isValidClock(date)) return false;
  const start = Date.parse(greyline.start);
  if (!Number.isFinite(start)) return false;
  const delta = start - date.getTime();
  return delta >= 0 && delta <= GREYLINE_HORIZON_MS;
}

function nowCastPhrase(args: {
  physicsBand: string | null;
  nowCastBand: string | null;
  bestBand: string | null;
  nowCastInWindow: boolean;
}): string {
  const { physicsBand, nowCastBand, bestBand, nowCastInWindow } = args;
  if (!nowCastBand) return "";
  if (nowCastBand === physicsBand) return "; NowCast agrees";
  if (nowCastInWindow && bestBand === nowCastBand) {
    return `; NowCast favors ${nowCastBand}`;
  }
  if (!nowCastInWindow) {
    return `; NowCast names ${nowCastBand} (outside LUF–MUF)`;
  }
  return "";
}

function buildLine(args: {
  tone: DecisionTone;
  band: string | null;
  pathMuf: PathMufSample | null;
  nearby: NearbySpotsResult;
  greylineLabel: string;
  greylineActive: boolean;
  physicsBand: string | null;
  nowCastBand: string | null;
  nowCastInWindow: boolean;
  evidenceLive: boolean;
  spottedNotModeled: boolean;
}): string {
  const {
    tone,
    band,
    pathMuf,
    nearby,
    greylineLabel,
    greylineActive,
    physicsBand,
    nowCastBand,
    nowCastInWindow,
    evidenceLive,
    spottedNotModeled,
  } = args;
  const mufBit = pathMuf ? `path MUF ${pathMuf.muf.toFixed(1)} MHz` : "no path MUF";
  const spotBit = !evidenceLive
    ? SPOTS_EXCLUDED_TIME_SHIFT
    : nearby.count === 0
      ? "no nearby spots"
      : `${nearby.count} spot${nearby.count === 1 ? "" : "s"} within ${nearby.radiusKm} km`;

  if (tone === "unknown") {
    return `Need solar flux to judge this path (${spotBit}).`;
  }
  if (tone === "closed") {
    return `Closed now (${mufBit}; ${spotBit}).`;
  }
  if (tone === "window") {
    const bandBit = band ? `try ${band}` : "low bands";
    return `${greylineLabel} — ${bandBit} (${mufBit}; ${spotBit}).`;
  }
  const nowCastBit = nowCastPhrase({
    physicsBand,
    nowCastBand,
    bestBand: band,
    nowCastInWindow,
  });
  const greyBit = greylineActive ? `; ${greylineLabel}` : "";
  const spottedBit =
    spottedNotModeled && band && physicsBand
      ? `; ${band} spotted, not modeled (physics: ${physicsBand})`
      : "";
  return `Workable now on ${band} (${mufBit}; ${spotBit}${nowCastBit}${spottedBit}${greyBit}).`;
}

export function buildVerdict(
  input: BuildDecisionInput,
  pathMuf: PathMufSample | null,
  nearby: NearbySpotsResult,
  greyline: GreylineSummary,
): DecisionVerdict {
  const links = hrefs(input.target, input.mode, input.pathMode);
  const nowCastBand = input.nowCast?.band ?? null;
  const physicsBand = pathMuf
    ? highestBandInWindow(pathMuf.luf, pathMuf.muf)
    : null;
  const spottedBand = topNearbyBand(nearby);
  const nowCastInWindow = Boolean(
    nowCastBand &&
      pathMuf &&
      bandIntersectsWindow(nowCastBand, pathMuf.luf, pathMuf.muf),
  );
  const spottedInWindow = Boolean(
    spottedBand &&
      pathMuf &&
      bandIntersectsWindow(spottedBand, pathMuf.luf, pathMuf.muf),
  );

  const evidenceLive = input.evidenceLive ?? true;

  let tone: DecisionTone = "unknown";
  let bestBand: string | null = null;
  let spottedNotModeled = false;

  if (pathMuf) {
    bestBand = physicsBand;
    if (!bestBand) {
      tone = "closed";
    } else if (
      LOW_BANDS.has(bestBand) &&
      greylineWithinHorizon(greyline, input.date)
    ) {
      tone = "window";
    } else {
      tone = "open";
    }
  }

  if (tone === "open") {
    if (nowCastInWindow && nowCastBand) {
      bestBand = nowCastBand;
    } else if (
      evidenceLive &&
      spottedInWindow &&
      spottedBand &&
      !nowCastBand
    ) {
      if (spottedBand !== physicsBand) {
        spottedNotModeled = true;
      }
      bestBand = spottedBand;
    }
  }

  const computedAt = input.computedAt ?? new Date();
  const parts: string[] = [];
  if (pathMuf) parts.push(pathMuf.evidence.basis);
  else parts.push("physics unavailable (no SFI)");
  if (nowCastBand) {
    parts.push(
      `NowCast ${nowCastBand}${input.nowCast?.issueTime ? ` issue ${input.nowCast.issueTime}` : ""}`,
    );
  }
  parts.push(
    evidenceLive ? nearby.evidence.basis : EXCLUDED_NEARBY_EVIDENCE_BASIS,
  );

  const observedAt =
    pathMuf?.evidence.observedAt ??
    (evidenceLive ? nearby.evidence.observedAt : null) ??
    input.nowCast?.issueTime ??
    null;
  const fetchedAt =
    pathMuf?.evidence.fetchedAt ??
    nearby.evidence.fetchedAt ??
    input.nowCast?.fetchedAt ??
    isoStamp(computedAt);

  return {
    line: buildLine({
      tone,
      band: bestBand,
      pathMuf,
      nearby,
      greylineLabel: greyline.label,
      greylineActive: greyline.active,
      physicsBand,
      nowCastBand,
      nowCastInWindow,
      evidenceLive,
      spottedNotModeled,
    }),
    tone,
    bestBand,
    wizardHref: links.wizardHref,
    plannerHref: links.plannerHref,
    evidence: {
      basis: parts.join(" · "),
      observedAt,
      fetchedAt,
    },
  };
}

export function buildDecisionReport(input: BuildDecisionInput): DecisionReport {
  const computedAt =
    input.computedAt && isValidClock(input.computedAt)
      ? input.computedAt
      : new Date();
  const almanac = pathAlmanac(input.qth, input.target, input.date, computedAt);
  const pathMuf =
    input.sfi == null || !isValidClock(input.date)
      ? null
      : samplePathMuf({
          startLat: input.qth.lat,
          startLon: input.qth.lon,
          endLat: input.target.lat,
          endLon: input.target.lon,
          date: input.date,
          sfi: input.sfi,
          kp: input.kp ?? 0,
          kpAssumed: input.kp == null,
          txPowerWatts: input.txPowerWatts,
          mode: input.mode,
          pathMode: input.pathMode,
          sfiObservedAt: input.sfiObservedAt,
          sfiFetchedAt: input.sfiFetchedAt,
          computedAt,
        });
  const nearby = nearbySpots({
    targetLat: input.target.lat,
    targetLon: input.target.lon,
    spots: input.spots,
    radiusKm: input.radiusKm,
    now: computedAt,
    spotsObservedAt: input.spotsObservedAt,
    spotsFetchedAt: input.spotsFetchedAt,
  });
  const verdict = buildVerdict(input, pathMuf, nearby, almanac.greyline);
  return {
    generatedAt: computedAt.toISOString(),
    almanac,
    pathMuf,
    nearby,
    verdict,
  };
}
