/**
 * Archetype Scoring — shared computation for operator "play style" archetypes.
 *
 * Extracted from ArchetypeRadar so that both the radar chart and the
 * ProfileCard sidebar can access archetype scores without duplicating logic.
 */

import type { LogEntry } from "@/lib/db/types";

// ─── Public Types ────────────────────────────────────────────────────────────

export interface ArchetypeScore {
  key: string;
  label: string;
  shortLabel: string;
  icon: string;
  /** 0-100 */
  score: number;
}

// ─── Archetype Definitions ───────────────────────────────────────────────────

interface ArchetypeDef {
  key: string;
  label: string;
  shortLabel: string;
  icon: string;
}

export const ARCHETYPES: ArchetypeDef[] = [
  { key: "dxer", label: "DXer", shortLabel: "DXer", icon: "\u{1F30D}" },
  {
    key: "contester",
    label: "Contester",
    shortLabel: "Contest",
    icon: "\u26A1",
  },
  {
    key: "digital",
    label: "Digital Wizard",
    shortLabel: "Digital",
    icon: "\u{1F4BB}",
  },
  {
    key: "cw",
    label: "CW Traditionalist",
    shortLabel: "CW",
    icon: "\u{1F511}",
  },
  {
    key: "bandExplorer",
    label: "Band Explorer",
    shortLabel: "Bands",
    icon: "\u{1F308}",
  },
  {
    key: "ragchewer",
    label: "Ragchewer",
    shortLabel: "Ragchew",
    icon: "\u{1F399}\uFE0F",
  },
  {
    key: "nightOwl",
    label: "Night Owl",
    shortLabel: "Night",
    icon: "\u{1F319}",
  },
  { key: "qrp", label: "QRP Warrior", shortLabel: "QRP", icon: "\u{1F50B}" },
];

// ─── Digital Mode Keys ───────────────────────────────────────────────────────

const DIGITAL_MODES = new Set([
  "FT8",
  "FT4",
  "RTTY",
  "PSK31",
  "PSK63",
  "JT65",
  "JT9",
  "JS8",
  "OLIVIA",
  "MFSK",
  "CONTESTIA",
  "THOR",
  "DOMINO",
  "ROS",
  "WSPR",
  "MSK144",
  "Q65",
  "FST4",
  "FST4W",
]);

// ─── Stats Shape (matches useLogbookStats output) ────────────────────────────

export interface ArchetypeStatsInput {
  totalQSOs: number;
  uniqueCountries: number;
  qsosByMode: Record<string, number>;
  qsosByBand: Record<string, number>;
  qsosByDate: Record<string, number>;
}

// ─── Core Scoring ────────────────────────────────────────────────────────────

/**
 * Compute archetype scores from logbook statistics and raw entries.
 *
 * @param stats  Aggregate stats from `useLogbookStats()`
 * @param entries  Raw logbook entries (used for hourly distribution)
 * @returns Array of 8 `ArchetypeScore` objects matching the ARCHETYPES order
 */
export function computeArchetypeScores(
  stats: ArchetypeStatsInput,
  entries: LogEntry[],
): ArchetypeScore[] {
  const { totalQSOs, uniqueCountries, qsosByMode, qsosByBand, qsosByDate } =
    stats;

  if (totalQSOs === 0) {
    return ARCHETYPES.map((a) => ({ ...a, score: 0 }));
  }

  // Build hourly distribution from raw entries
  const hourly = new Array<number>(24).fill(0);
  for (const entry of entries) {
    if (entry.timeOn) {
      const h = parseInt(entry.timeOn.split(":")[0], 10);
      if (Number.isFinite(h) && h >= 0 && h <= 23) {
        hourly[h]++;
      }
    }
  }

  // DXer: uniqueCountries / 100 threshold, capped at 100
  const dxer = Math.min(100, Math.round((uniqueCountries / 100) * 100));

  // Contester: max QSOs in a single day / 100 threshold
  const maxDayCount = Math.max(0, ...Object.values(qsosByDate));
  const contester = Math.min(100, Math.round((maxDayCount / 100) * 100));

  // Digital Wizard: digital mode QSOs / total * 100
  let digitalCount = 0;
  for (const [mode, count] of Object.entries(qsosByMode)) {
    if (DIGITAL_MODES.has(mode.toUpperCase())) {
      digitalCount += count;
    }
  }
  const digital = Math.min(100, Math.round((digitalCount / totalQSOs) * 100));

  // CW Traditionalist: CW QSOs / total * 100
  const cwCount = qsosByMode["CW"] || 0;
  const cw = Math.min(100, Math.round((cwCount / totalQSOs) * 100));

  // Band Explorer: unique bands / 12 * 100
  const uniqueBands = Object.keys(qsosByBand).length;
  const bandExplorer = Math.min(100, Math.round((uniqueBands / 12) * 100));

  // Ragchewer: SSB/voice QSOs / total * 100
  const ssbCount =
    (qsosByMode["SSB"] || 0) +
    (qsosByMode["LSB"] || 0) +
    (qsosByMode["USB"] || 0) +
    (qsosByMode["AM"] || 0) +
    (qsosByMode["FM"] || 0);
  const ragchewer = Math.min(100, Math.round((ssbCount / totalQSOs) * 100));

  // Night Owl: QSOs between 00-06 UTC / total * 300 (amplified)
  let nightOwl = 0;
  const totalHourly = hourly.reduce((s, v) => s + v, 0);
  if (totalHourly > 0) {
    let nightCount = 0;
    for (let h = 0; h <= 6; h++) {
      nightCount += hourly[h];
    }
    nightOwl = Math.min(100, Math.round((nightCount / totalHourly) * 300));
  }

  // QRP Warrior: placeholder (no power data yet)
  const qrp = 0;

  const scoreMap: Record<string, number> = {
    dxer,
    contester,
    digital,
    cw,
    bandExplorer,
    ragchewer,
    nightOwl,
    qrp,
  };

  return ARCHETYPES.map((a) => ({
    ...a,
    score: scoreMap[a.key] ?? 0,
  }));
}

/**
 * Return the top N archetypes sorted by score descending.
 * Only includes archetypes with score > 0.
 */
export function getTopArchetypes(
  scores: ArchetypeScore[],
  count: number = 3,
): ArchetypeScore[] {
  return scores
    .filter((a) => a.score > 0)
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
