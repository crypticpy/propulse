import { BAND_ORDER, BAND_RANGES } from "@/lib/data/bandRanges";
import { latLonToGrid } from "@/lib/utils/grid";
import {
  bandPlannerHrefForTarget,
  buildWizardSearchParams,
} from "@/lib/dxwizard";
import type { WizardMode, WizardPathMode } from "@/lib/dxwizard";
import { pathAlmanac } from "./almanac";
import { nearbySpots } from "./nearbySpots";
import { samplePathMuf } from "./pathMuf";
import type { DXSpot } from "@/types/dxcluster";
import type {
  DecisionReport,
  DecisionTone,
  DecisionVerdict,
  PathMufSample,
  NearbySpotsResult,
} from "./types";

const LOW_BANDS = new Set(["160m", "80m", "40m"]);

export interface NowCastHint {
  band: string;
  issueTime: string | null;
  fetchedAt: string | null;
}

export interface BuildDecisionInput {
  qth: { lat: number; lon: number; grid?: string };
  target: { lat: number; lon: number; name?: string; grid?: string };
  date: Date;
  pathMode: "short" | "long";
  sfi: number | null;
  sfiObservedAt?: string | null;
  sfiFetchedAt?: string | null;
  kp: number;
  txPowerWatts: number;
  mode: "SSB" | "CW" | "FT8";
  spots: DXSpot[];
  spotsObservedAt?: number | null;
  spotsFetchedAt?: number | null;
  radiusKm: number;
  nowCast?: NowCastHint | null;
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

/** Highest HF band whose lower edge is still below `mufMHz`. */
export function highestBandBelow(mufMHz: number): string | null {
  for (let i = BAND_ORDER.length - 1; i >= 0; i--) {
    const band = BAND_ORDER[i];
    const range = BAND_RANGES[band];
    if (range && range.startKHz / 1000 < mufMHz) {
      return band;
    }
  }
  return null;
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

function buildLine(args: {
  tone: DecisionTone;
  band: string | null;
  pathMuf: PathMufSample | null;
  nearby: NearbySpotsResult;
  greylineLabel: string;
  greylineActive: boolean;
  nowCastBand: string | null;
}): string {
  const { tone, band, pathMuf, nearby, greylineLabel, greylineActive, nowCastBand } =
    args;
  const mufBit = pathMuf ? `path MUF ${pathMuf.muf.toFixed(1)} MHz` : "no path MUF";
  const spotBit =
    nearby.count === 0
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
  const nowCastBit =
    nowCastBand && band && nowCastBand !== band
      ? `; NowCast favors ${nowCastBand}`
      : nowCastBand
        ? `; NowCast agrees`
        : "";
  const greyBit = greylineActive ? `; ${greylineLabel}` : "";
  return `Workable now on ${band} (${mufBit}; ${spotBit}${nowCastBit}${greyBit}).`;
}

export function buildVerdict(
  input: BuildDecisionInput,
  pathMuf: PathMufSample | null,
  nearby: NearbySpotsResult,
  greyline: { active: boolean; label: string },
): DecisionVerdict {
  const links = hrefs(input.target, input.mode, input.pathMode);
  const nowCastBand = input.nowCast?.band ?? null;
  const fotBand = pathMuf ? highestBandBelow(pathMuf.fot) : null;
  const mufBand = pathMuf ? highestBandBelow(pathMuf.muf) : null;
  const spottedBand = topNearbyBand(nearby);

  let tone: DecisionTone = "unknown";
  let bestBand: string | null = null;

  const greylineUpcoming =
    !greyline.active &&
    greyline.label.startsWith("Mutual grey-line") &&
    !greyline.label.startsWith("No mutual");

  if (pathMuf) {
    bestBand = fotBand ?? mufBand;
    if (!bestBand || pathMuf.muf < 3.5) {
      tone = "closed";
      bestBand = null;
    } else if (bestBand && LOW_BANDS.has(bestBand) && greylineUpcoming) {
      tone = "window";
    } else {
      tone = "open";
    }
  } else if (nearby.count > 0 && spottedBand) {
    tone = "open";
    bestBand = spottedBand;
  }

  if (nowCastBand && tone === "open") {
    const nowCastUnderMuf =
      !pathMuf ||
      (BAND_RANGES[nowCastBand] &&
        BAND_RANGES[nowCastBand].startKHz / 1000 < pathMuf.muf);
    if (nowCastUnderMuf) {
      bestBand = nowCastBand;
    }
  }

  if (spottedBand && tone === "open" && !nowCastBand) {
    const spottedUnderMuf =
      !pathMuf ||
      (BAND_RANGES[spottedBand] &&
        BAND_RANGES[spottedBand].startKHz / 1000 < pathMuf.muf);
    if (spottedUnderMuf) {
      bestBand = spottedBand;
    }
  }

  const parts: string[] = [];
  if (pathMuf) parts.push(pathMuf.evidence.basis);
  else parts.push("physics unavailable (no SFI)");
  if (nowCastBand) {
    parts.push(
      `NowCast ${nowCastBand}${input.nowCast?.issueTime ? ` issue ${input.nowCast.issueTime}` : ""}`,
    );
  }
  parts.push(nearby.evidence.basis);

  const observedAt =
    pathMuf?.evidence.observedAt ??
    nearby.evidence.observedAt ??
    input.nowCast?.issueTime ??
    null;
  const fetchedAt =
    pathMuf?.evidence.fetchedAt ??
    nearby.evidence.fetchedAt ??
    input.nowCast?.fetchedAt ??
    input.date.toISOString();

  return {
    line: buildLine({
      tone,
      band: bestBand,
      pathMuf,
      nearby,
      greylineLabel: greyline.label,
      greylineActive: greyline.active,
      nowCastBand,
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
  const almanac = pathAlmanac(input.qth, input.target, input.date);
  const sfiAssumed = input.sfi == null;
  const pathMuf = samplePathMuf({
    startLat: input.qth.lat,
    startLon: input.qth.lon,
    endLat: input.target.lat,
    endLon: input.target.lon,
    date: input.date,
    sfi: input.sfi ?? 100,
    kp: input.kp,
    txPowerWatts: input.txPowerWatts,
    mode: input.mode,
    pathMode: input.pathMode,
    sfiObservedAt: input.sfiObservedAt,
    sfiFetchedAt: input.sfiFetchedAt,
    sfiAssumed,
  });
  const nearby = nearbySpots({
    targetLat: input.target.lat,
    targetLon: input.target.lon,
    spots: input.spots,
    radiusKm: input.radiusKm,
    now: input.date,
    spotsObservedAt: input.spotsObservedAt,
    spotsFetchedAt: input.spotsFetchedAt,
  });
  const verdict = buildVerdict(input, pathMuf, nearby, almanac.greyline);
  return {
    generatedAt: input.date.toISOString(),
    almanac,
    pathMuf,
    nearby,
    verdict,
  };
}
