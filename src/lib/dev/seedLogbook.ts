/**
 * Logbook Seed Utility
 *
 * Populates IndexedDB with ~600 realistic QSO entries to exercise
 * achievement badges, WAS/WAZ/DXCC award tracking, and logbook UI.
 *
 * Usage (browser console):
 *   __seedLogbook()   -- add all test QSOs
 *   __clearLogbook()  -- remove all log entries
 */

import {
  addLogEntries,
  getAllLogEntries,
  clearAllLogEntries,
} from "@/lib/db/logStore";
import type { LogEntry } from "@/lib/db/types";

type QSOInput = Omit<LogEntry, "id" | "createdAt" | "updatedAt">;

// ─── Band/Mode/Frequency Reference ─────────────────────────────────────────

interface BandModeFreq {
  band: string;
  mode: string;
  frequency: number;
  rst: string;
}

const BAND_MODE_MAP: BandModeFreq[] = [
  // 160m
  { band: "160m", mode: "CW", frequency: 1810, rst: "599" },
  { band: "160m", mode: "SSB", frequency: 1850, rst: "59" },
  // 80m
  { band: "80m", mode: "SSB", frequency: 3800, rst: "59" },
  { band: "80m", mode: "CW", frequency: 3530, rst: "599" },
  { band: "80m", mode: "FT8", frequency: 3573, rst: "-12" },
  // 40m
  { band: "40m", mode: "SSB", frequency: 7200, rst: "59" },
  { band: "40m", mode: "CW", frequency: 7030, rst: "599" },
  { band: "40m", mode: "FT8", frequency: 7074, rst: "-08" },
  { band: "40m", mode: "FT4", frequency: 7047, rst: "-05" },
  // 30m (CW/digital only)
  { band: "30m", mode: "CW", frequency: 10110, rst: "599" },
  { band: "30m", mode: "FT8", frequency: 10136, rst: "-14" },
  // 20m
  { band: "20m", mode: "SSB", frequency: 14250, rst: "59" },
  { band: "20m", mode: "CW", frequency: 14030, rst: "599" },
  { band: "20m", mode: "FT8", frequency: 14074, rst: "-10" },
  { band: "20m", mode: "FT4", frequency: 14080, rst: "-06" },
  { band: "20m", mode: "RTTY", frequency: 14085, rst: "599" },
  { band: "20m", mode: "PSK31", frequency: 14070, rst: "599" },
  // 17m
  { band: "17m", mode: "SSB", frequency: 18130, rst: "59" },
  { band: "17m", mode: "CW", frequency: 18080, rst: "599" },
  { band: "17m", mode: "FT8", frequency: 18100, rst: "-11" },
  // 15m
  { band: "15m", mode: "SSB", frequency: 21300, rst: "59" },
  { band: "15m", mode: "CW", frequency: 21030, rst: "599" },
  { band: "15m", mode: "FT8", frequency: 21074, rst: "-09" },
  // 12m
  { band: "12m", mode: "SSB", frequency: 24950, rst: "59" },
  { band: "12m", mode: "CW", frequency: 24900, rst: "599" },
  { band: "12m", mode: "FT8", frequency: 24915, rst: "-13" },
  // 10m
  { band: "10m", mode: "SSB", frequency: 28400, rst: "59" },
  { band: "10m", mode: "CW", frequency: 28030, rst: "599" },
  { band: "10m", mode: "FT8", frequency: 28074, rst: "-07" },
  { band: "10m", mode: "FM", frequency: 29600, rst: "59" },
  { band: "10m", mode: "AM", frequency: 29000, rst: "57" },
  // 6m
  { band: "6m", mode: "SSB", frequency: 50125, rst: "59" },
  { band: "6m", mode: "CW", frequency: 50090, rst: "599" },
  { band: "6m", mode: "FT8", frequency: 50313, rst: "-15" },
  // 2m
  { band: "2m", mode: "SSB", frequency: 144200, rst: "59" },
  { band: "2m", mode: "FM", frequency: 146520, rst: "59" },
];

function pickBandMode(band?: string, mode?: string): BandModeFreq {
  if (band && mode) {
    const exact = BAND_MODE_MAP.find(
      (bm) => bm.band === band && bm.mode === mode,
    );
    if (exact) return exact;
  }
  if (band) {
    const options = BAND_MODE_MAP.filter((bm) => bm.band === band);
    return options[Math.floor(Math.random() * options.length)];
  }
  if (mode) {
    const options = BAND_MODE_MAP.filter((bm) => bm.mode === mode);
    return options[Math.floor(Math.random() * options.length)];
  }
  return BAND_MODE_MAP[Math.floor(Math.random() * BAND_MODE_MAP.length)];
}

// ─── Callsign / DXCC / CQ Zone Data ────────────────────────────────────────

interface DXCCPrefix {
  prefix: string;
  entity: string;
  zone: number;
  grid: string;
}

const DXCC_PREFIXES: DXCCPrefix[] = [
  // North America
  { prefix: "W1", entity: "United States", zone: 5, grid: "FN31" },
  { prefix: "W2", entity: "United States", zone: 5, grid: "FN20" },
  { prefix: "W3", entity: "United States", zone: 5, grid: "FM19" },
  { prefix: "W4", entity: "United States", zone: 5, grid: "EM73" },
  { prefix: "W5", entity: "United States", zone: 4, grid: "EM12" },
  { prefix: "W6", entity: "United States", zone: 3, grid: "CM97" },
  { prefix: "W7", entity: "United States", zone: 3, grid: "DN17" },
  { prefix: "W8", entity: "United States", zone: 4, grid: "EN81" },
  { prefix: "W9", entity: "United States", zone: 4, grid: "EN52" },
  { prefix: "W0", entity: "United States", zone: 4, grid: "DM79" },
  { prefix: "K1", entity: "United States", zone: 5, grid: "FN42" },
  { prefix: "K2", entity: "United States", zone: 5, grid: "FN30" },
  { prefix: "K3", entity: "United States", zone: 5, grid: "FM29" },
  { prefix: "K4", entity: "United States", zone: 5, grid: "EM84" },
  { prefix: "K5", entity: "United States", zone: 4, grid: "EM25" },
  { prefix: "K6", entity: "United States", zone: 3, grid: "CM87" },
  { prefix: "K7", entity: "United States", zone: 3, grid: "DN31" },
  { prefix: "K8", entity: "United States", zone: 4, grid: "EN91" },
  { prefix: "K9", entity: "United States", zone: 4, grid: "EN62" },
  { prefix: "K0", entity: "United States", zone: 4, grid: "DM89" },
  { prefix: "N1", entity: "United States", zone: 5, grid: "FN43" },
  { prefix: "N2", entity: "United States", zone: 5, grid: "FN21" },
  { prefix: "N3", entity: "United States", zone: 5, grid: "FM09" },
  { prefix: "N4", entity: "United States", zone: 5, grid: "EM95" },
  { prefix: "N5", entity: "United States", zone: 4, grid: "EM36" },
  { prefix: "N6", entity: "United States", zone: 3, grid: "DM04" },
  { prefix: "N7", entity: "United States", zone: 3, grid: "DN41" },
  { prefix: "N8", entity: "United States", zone: 4, grid: "EN72" },
  { prefix: "N9", entity: "United States", zone: 4, grid: "EN51" },
  { prefix: "N0", entity: "United States", zone: 4, grid: "DM69" },
  { prefix: "WA2", entity: "United States", zone: 5, grid: "FN20" },
  { prefix: "KA5", entity: "United States", zone: 4, grid: "EM15" },
  // Canada
  { prefix: "VE1", entity: "Canada", zone: 5, grid: "FN74" },
  { prefix: "VE2", entity: "Canada", zone: 2, grid: "FN35" },
  { prefix: "VE3", entity: "Canada", zone: 4, grid: "FN03" },
  { prefix: "VE4", entity: "Canada", zone: 4, grid: "EN19" },
  { prefix: "VE5", entity: "Canada", zone: 4, grid: "DO51" },
  { prefix: "VE6", entity: "Canada", zone: 3, grid: "DO33" },
  { prefix: "VE7", entity: "Canada", zone: 3, grid: "CN89" },
  { prefix: "VA3", entity: "Canada", zone: 4, grid: "FN04" },
  // Mexico
  { prefix: "XE1", entity: "Mexico", zone: 6, grid: "EK09" },
  { prefix: "XE2", entity: "Mexico", zone: 6, grid: "DL80" },
  { prefix: "XE3", entity: "Mexico", zone: 6, grid: "EK55" },
  // Caribbean / Central America
  { prefix: "KH6", entity: "Hawaii", zone: 31, grid: "BL01" },
  { prefix: "KL7", entity: "Alaska", zone: 1, grid: "BP51" },
  { prefix: "KP4", entity: "Puerto Rico", zone: 8, grid: "FK68" },
  { prefix: "VP5", entity: "Turks & Caicos", zone: 8, grid: "FL31" },
  { prefix: "PJ2", entity: "Curacao", zone: 9, grid: "FK52" },
  { prefix: "8P", entity: "Barbados", zone: 8, grid: "GK03" },
  { prefix: "CO2", entity: "Cuba", zone: 8, grid: "EL82" },
  { prefix: "CO6", entity: "Cuba", zone: 8, grid: "FL01" },
  // Europe
  { prefix: "G3", entity: "England", zone: 14, grid: "IO91" },
  { prefix: "G4", entity: "England", zone: 14, grid: "IO92" },
  { prefix: "M0", entity: "England", zone: 14, grid: "IO91" },
  { prefix: "M5", entity: "England", zone: 14, grid: "IO83" },
  { prefix: "2E0", entity: "England", zone: 14, grid: "IO82" },
  { prefix: "DL1", entity: "Germany", zone: 14, grid: "JO31" },
  { prefix: "DL3", entity: "Germany", zone: 14, grid: "JN49" },
  { prefix: "DL5", entity: "Germany", zone: 14, grid: "JO52" },
  { prefix: "DJ2", entity: "Germany", zone: 14, grid: "JO40" },
  { prefix: "DK7", entity: "Germany", zone: 14, grid: "JN58" },
  { prefix: "F1", entity: "France", zone: 14, grid: "JN18" },
  { prefix: "F5", entity: "France", zone: 14, grid: "IN97" },
  { prefix: "F6", entity: "France", zone: 14, grid: "JN06" },
  { prefix: "EA1", entity: "Spain", zone: 14, grid: "IN73" },
  { prefix: "EA3", entity: "Spain", zone: 14, grid: "JN11" },
  { prefix: "EA5", entity: "Spain", zone: 14, grid: "IM98" },
  { prefix: "EA7", entity: "Spain", zone: 14, grid: "IM76" },
  { prefix: "I1", entity: "Italy", zone: 15, grid: "JN35" },
  { prefix: "I2", entity: "Italy", zone: 15, grid: "JN45" },
  { prefix: "IK2", entity: "Italy", zone: 15, grid: "JN45" },
  { prefix: "IK4", entity: "Italy", zone: 15, grid: "JN54" },
  { prefix: "IK8", entity: "Italy", zone: 15, grid: "JN70" },
  { prefix: "PA0", entity: "Netherlands", zone: 14, grid: "JO22" },
  { prefix: "PA3", entity: "Netherlands", zone: 14, grid: "JO21" },
  { prefix: "SM0", entity: "Sweden", zone: 14, grid: "JO99" },
  { prefix: "SM5", entity: "Sweden", zone: 14, grid: "JO89" },
  { prefix: "SM7", entity: "Sweden", zone: 14, grid: "JO65" },
  { prefix: "SA0", entity: "Sweden", zone: 14, grid: "JP90" },
  { prefix: "OH1", entity: "Finland", zone: 18, grid: "KP01" },
  { prefix: "OH3", entity: "Finland", zone: 18, grid: "KP11" },
  { prefix: "OH6", entity: "Finland", zone: 18, grid: "KP13" },
  { prefix: "SP1", entity: "Poland", zone: 15, grid: "JO73" },
  { prefix: "SP3", entity: "Poland", zone: 15, grid: "JO72" },
  { prefix: "SP5", entity: "Poland", zone: 15, grid: "KO02" },
  { prefix: "SP9", entity: "Poland", zone: 15, grid: "KN09" },
  // Russia
  { prefix: "UA1", entity: "European Russia", zone: 16, grid: "KO59" },
  { prefix: "UA3", entity: "European Russia", zone: 16, grid: "KO85" },
  { prefix: "UA6", entity: "European Russia", zone: 16, grid: "KN95" },
  { prefix: "UA9", entity: "Asiatic Russia", zone: 17, grid: "MO06" },
  { prefix: "UA0", entity: "Asiatic Russia", zone: 19, grid: "QN17" },
  { prefix: "RW3", entity: "European Russia", zone: 16, grid: "KO86" },
  { prefix: "RX9", entity: "Asiatic Russia", zone: 17, grid: "MO07" },
  // Asia
  { prefix: "JA1", entity: "Japan", zone: 25, grid: "PM95" },
  { prefix: "JA3", entity: "Japan", zone: 25, grid: "PM74" },
  { prefix: "JA7", entity: "Japan", zone: 25, grid: "QM08" },
  { prefix: "JH1", entity: "Japan", zone: 25, grid: "PM95" },
  { prefix: "JR6", entity: "Japan", zone: 25, grid: "PL36" },
  { prefix: "VU2", entity: "India", zone: 22, grid: "MK73" },
  { prefix: "VU3", entity: "India", zone: 22, grid: "MK92" },
  { prefix: "BY1", entity: "China", zone: 23, grid: "OM89" },
  { prefix: "BY4", entity: "China", zone: 24, grid: "PM01" },
  { prefix: "BV2", entity: "Taiwan", zone: 24, grid: "PL05" },
  { prefix: "HL1", entity: "South Korea", zone: 25, grid: "PM37" },
  { prefix: "HL5", entity: "South Korea", zone: 25, grid: "PM45" },
  { prefix: "HS1", entity: "Thailand", zone: 26, grid: "OK03" },
  { prefix: "E21", entity: "Thailand", zone: 26, grid: "OK04" },
  { prefix: "YB0", entity: "Indonesia", zone: 28, grid: "OI33" },
  { prefix: "YB3", entity: "Indonesia", zone: 28, grid: "OI44" },
  // Middle East
  { prefix: "4X1", entity: "Israel", zone: 20, grid: "KM72" },
  { prefix: "4Z5", entity: "Israel", zone: 20, grid: "KM71" },
  // Oceania
  { prefix: "VK1", entity: "Australia", zone: 30, grid: "QF44" },
  { prefix: "VK2", entity: "Australia", zone: 30, grid: "QF56" },
  { prefix: "VK3", entity: "Australia", zone: 30, grid: "QF22" },
  { prefix: "VK4", entity: "Australia", zone: 30, grid: "QG62" },
  { prefix: "VK6", entity: "Australia", zone: 29, grid: "OF86" },
  { prefix: "ZL1", entity: "New Zealand", zone: 32, grid: "RF73" },
  { prefix: "ZL2", entity: "New Zealand", zone: 32, grid: "RE68" },
  { prefix: "ZL3", entity: "New Zealand", zone: 32, grid: "RE56" },
  // South America
  { prefix: "PY1", entity: "Brazil", zone: 11, grid: "GG87" },
  { prefix: "PY2", entity: "Brazil", zone: 11, grid: "GG66" },
  { prefix: "PY5", entity: "Brazil", zone: 11, grid: "GG54" },
  { prefix: "PP5", entity: "Brazil", zone: 11, grid: "GG55" },
  { prefix: "PT7", entity: "Brazil", zone: 11, grid: "HI22" },
  { prefix: "LU1", entity: "Argentina", zone: 13, grid: "GF05" },
  { prefix: "LU4", entity: "Argentina", zone: 13, grid: "FF97" },
  { prefix: "LU7", entity: "Argentina", zone: 13, grid: "FF88" },
  { prefix: "CE1", entity: "Chile", zone: 12, grid: "FF46" },
  { prefix: "CE3", entity: "Chile", zone: 12, grid: "FF46" },
  // Africa
  { prefix: "ZS1", entity: "South Africa", zone: 38, grid: "JF96" },
  { prefix: "ZS6", entity: "South Africa", zone: 38, grid: "KG44" },
  { prefix: "CN8", entity: "Morocco", zone: 33, grid: "IM63" },
  { prefix: "SU1", entity: "Egypt", zone: 34, grid: "KL30" },
  { prefix: "5Z4", entity: "Kenya", zone: 37, grid: "KI88" },
  { prefix: "5N3", entity: "Nigeria", zone: 35, grid: "JJ17" },
];

// ─── US State Data for WAS ──────────────────────────────────────────────────

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "OH",
  "OK",
  "OR",
  "PA",
  "SC",
  "TN",
  "TX",
  "UT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

// Map call areas to typical states
const CALL_AREA_STATES: Record<string, string[]> = {
  "1": ["CT", "ME", "MA", "NH", "VT"],
  "2": ["NJ", "NY"],
  "3": ["PA", "MD"],
  "4": ["AL", "FL", "GA", "KY", "NC", "SC", "TN", "VA"],
  "5": ["AR", "LA", "MS", "NM", "OK", "TX"],
  "6": ["CA"],
  "7": ["AZ", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
  "8": ["MI", "OH", "WV"],
  "9": ["IL", "IN", "WI"],
  "0": ["CO", "IA", "KS", "MN", "MO", "NE"],
};

// ─── Operator Names ─────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Jim",
  "Bob",
  "Tom",
  "Bill",
  "Joe",
  "Mike",
  "Dave",
  "Steve",
  "John",
  "Paul",
  "Gary",
  "Larry",
  "Rich",
  "Ken",
  "Don",
  "Dan",
  "Mark",
  "Pete",
  "Ray",
  "Ed",
  "Frank",
  "Al",
  "Rick",
  "Fred",
  "Walt",
  "Bruce",
  "Phil",
  "Ron",
  "Ted",
  "Hal",
  "Chris",
  "Jack",
  "Lee",
  "Sam",
  "Art",
  "Ben",
  "Carl",
  "Dean",
  "Earl",
  "Herb",
  "Ivan",
  "Jeff",
  "Kirk",
  "Lou",
  "Norm",
  "Oscar",
  "Pat",
  "Rudy",
  "Skip",
  "Vern",
  "Yuri",
  "Hans",
  "Pierre",
  "Mika",
  "Taro",
  "Carlos",
  "Marco",
  "Sven",
  "Piotr",
  "Ahmed",
];

// ─── Helper Utilities ───────────────────────────────────────────────────────

/** Deterministic pseudo-random from seed (Mulberry32) */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function padTwo(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`;
}

function randomTimeUTC(): string {
  return `${padTwo(randInt(6, 23))}:${padTwo(randInt(0, 59))}`;
}

function nightTimeUTC(): string {
  return `${padTwo(randInt(0, 5))}:${padTwo(randInt(0, 59))}`;
}

function generateSuffix(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const len = randInt(2, 3);
  let s = "";
  for (let i = 0; i < len; i++) {
    s += letters[Math.floor(rand() * 26)];
  }
  return s;
}

let callsignCounter = 0;
const usedCallsigns = new Set<string>();

function makeCallsign(prefix: string): string {
  // Ensure uniqueness
  let call: string;
  let attempts = 0;
  do {
    call = `${prefix}${generateSuffix()}`;
    attempts++;
    if (attempts > 20) {
      // Fallback: append counter
      call = `${prefix}${generateSuffix()}${callsignCounter++}`;
    }
  } while (usedCallsigns.has(call));
  usedCallsigns.add(call);
  return call;
}

// ─── QSO Factory ────────────────────────────────────────────────────────────

function makeQSO(params: {
  callsign: string;
  date: string;
  timeOn?: string;
  band?: string;
  mode?: string;
  frequency?: number;
  qth?: string;
  name?: string;
  grid?: string;
  rstSent?: string;
  rstRcvd?: string;
  lotw?: boolean;
  eqsl?: boolean;
  qslRcvd?: "Y" | "N" | "R" | "I";
  notes?: string;
}): QSOInput {
  const bm = pickBandMode(params.band, params.mode);
  return {
    callsign: params.callsign,
    frequency: params.frequency ?? bm.frequency,
    mode: params.mode ?? bm.mode,
    band: params.band ?? bm.band,
    date: params.date,
    timeOn: params.timeOn ?? randomTimeUTC(),
    rstSent: params.rstSent ?? bm.rst,
    rstRcvd: params.rstRcvd ?? bm.rst,
    qth: params.qth,
    name: params.name ?? pick(FIRST_NAMES),
    grid: params.grid,
    lotw: params.lotw,
    eqsl: params.eqsl,
    qslRcvd: params.qslRcvd,
    notes: params.notes,
  };
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

/** Base date range: 2025-11-01 to 2026-01-15 */
const DATE_START = new Date("2025-11-01");
const DATE_END = new Date("2026-01-15");

/** 35-day streak: 2025-12-01 to 2026-01-04 */
const STREAK_START = new Date("2025-12-01");
/** Marathon day */
const MARATHON_DATE = "2025-12-15";

function randomDateInRange(): string {
  const range = DATE_END.getTime() - DATE_START.getTime();
  const d = new Date(DATE_START.getTime() + rand() * range);
  return formatDate(d);
}

function dateForStreak(dayOffset: number): string {
  const d = new Date(STREAK_START.getTime() + dayOffset * 86400000);
  return formatDate(d);
}

function getAllDatesInRange(): string[] {
  const dates: string[] = [];
  const d = new Date(DATE_START);
  while (d <= DATE_END) {
    dates.push(formatDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ─── QSO Generators ────────────────────────────────────────────────────────

/**
 * Generate US QSOs covering 45 states for WAS tracking.
 * Each state gets 2-4 QSOs. ~60% lotw confirmed, ~30% qslRcvd="Y".
 */
function generateUSQSOs(): QSOInput[] {
  const qsos: QSOInput[] = [];
  const usCallPrefixes = ["W", "K", "N"];
  const usDxccPrefixes = DXCC_PREFIXES.filter(
    (p) => p.entity === "United States",
  );

  for (const state of US_STATES) {
    // Find a call area that maps to this state
    let callArea = "1";
    for (const [area, states] of Object.entries(CALL_AREA_STATES)) {
      if (states.includes(state)) {
        callArea = area;
        break;
      }
    }

    const qsoCount = randInt(2, 4);
    for (let i = 0; i < qsoCount; i++) {
      const prefix = pick(usCallPrefixes) + callArea;
      const callsign = makeCallsign(prefix);
      const dxccEntry =
        usDxccPrefixes.find((p) => p.prefix === prefix) ?? pick(usDxccPrefixes);
      const isLotw = rand() < 0.6;
      const isQslRcvd = rand() < 0.3;
      const bands = ["20m", "40m", "15m", "10m", "80m"];

      qsos.push(
        makeQSO({
          callsign,
          date: randomDateInRange(),
          band: pick(bands),
          qth: state,
          grid: dxccEntry.grid,
          lotw: isLotw,
          eqsl: rand() < 0.4,
          qslRcvd: isQslRcvd ? "Y" : rand() < 0.1 ? "R" : "N",
        }),
      );
    }
  }

  return qsos;
}

/**
 * Generate international DX QSOs for DXCC/WAZ diversity.
 * Uses all non-US DXCC prefixes, 2-4 QSOs per entity.
 */
function generateDXQSOs(): QSOInput[] {
  const qsos: QSOInput[] = [];
  const dxPrefixes = DXCC_PREFIXES.filter((p) => p.entity !== "United States");

  // Group by entity to avoid too many of same entity
  const byEntity = new Map<string, DXCCPrefix[]>();
  for (const p of dxPrefixes) {
    const arr = byEntity.get(p.entity) ?? [];
    arr.push(p);
    byEntity.set(p.entity, arr);
  }

  for (const [, prefixes] of byEntity) {
    const qsoCount = randInt(1, 3);
    for (let i = 0; i < qsoCount; i++) {
      const dxcc = pick(prefixes);
      const callsign = makeCallsign(dxcc.prefix);
      const isLotw = rand() < 0.6;
      const isQslRcvd = rand() < 0.3;
      const allBands = [
        "160m",
        "80m",
        "40m",
        "30m",
        "20m",
        "17m",
        "15m",
        "12m",
        "10m",
        "6m",
        "2m",
      ];

      qsos.push(
        makeQSO({
          callsign,
          date: randomDateInRange(),
          band: pick(allBands),
          grid: dxcc.grid,
          lotw: isLotw,
          eqsl: rand() < 0.4,
          qslRcvd: isQslRcvd ? "Y" : "N",
          name: pick(FIRST_NAMES),
        }),
      );
    }
  }

  return qsos;
}

/**
 * Generate 35+ QSOs on the marathon day (2025-12-15).
 * Mix of modes and bands for realism.
 */
function generateMarathonDay(): QSOInput[] {
  const qsos: QSOInput[] = [];
  const count = 38; // Exceeds bronze (25) threshold
  const modes = ["SSB", "CW", "FT8", "FT4", "RTTY"];
  const bands = ["20m", "40m", "15m", "10m", "80m", "17m"];

  for (let i = 0; i < count; i++) {
    const hour = 6 + Math.floor((i / count) * 18); // Spread across 06:00-23:59
    const minute = randInt(0, 59);
    const band = pick(bands);
    const mode = pick(modes);
    const dxcc = pick(DXCC_PREFIXES);
    const callsign = makeCallsign(dxcc.prefix);

    qsos.push(
      makeQSO({
        callsign,
        date: MARATHON_DATE,
        timeOn: `${padTwo(hour)}:${padTwo(minute)}`,
        band,
        mode,
        grid: dxcc.grid,
        lotw: rand() < 0.6,
        qslRcvd: rand() < 0.3 ? "Y" : "N",
        notes:
          i === 0
            ? "Contest marathon start"
            : i === count - 1
              ? "Marathon day complete!"
              : undefined,
      }),
    );
  }

  return qsos;
}

/**
 * Fill gaps in the 35-day streak (2025-12-01 to 2026-01-04).
 * Ensures every day in the streak has at least 1 QSO.
 */
function generateStreakFiller(existingDates: Set<string>): QSOInput[] {
  const qsos: QSOInput[] = [];
  const streakDays = 35; // Dec 1 to Jan 4 inclusive

  for (let day = 0; day < streakDays; day++) {
    const date = dateForStreak(day);
    if (!existingDates.has(date)) {
      // Add 1-3 QSOs to fill the gap
      const count = randInt(1, 3);
      for (let i = 0; i < count; i++) {
        const dxcc = pick(DXCC_PREFIXES);
        const callsign = makeCallsign(dxcc.prefix);
        const bands = ["20m", "40m", "15m", "80m", "10m"];

        qsos.push(
          makeQSO({
            callsign,
            date,
            band: pick(bands),
            grid: dxcc.grid,
            lotw: rand() < 0.6,
            qslRcvd: rand() < 0.3 ? "Y" : "N",
          }),
        );
      }
    }
  }

  return qsos;
}

/**
 * Generate night-owl QSOs (timeOn between 00:00-05:59 UTC).
 * At least 15 entries scattered across the date range.
 */
function generateNightQSOs(): QSOInput[] {
  const qsos: QSOInput[] = [];
  const count = 18;

  for (let i = 0; i < count; i++) {
    const dxcc = pick(DXCC_PREFIXES);
    const callsign = makeCallsign(dxcc.prefix);
    // Night owl contacts are often on lower bands
    const bands = ["160m", "80m", "40m", "30m", "20m"];

    qsos.push(
      makeQSO({
        callsign,
        date: randomDateInRange(),
        timeOn: nightTimeUTC(),
        band: pick(bands),
        grid: dxcc.grid,
        lotw: rand() < 0.6,
        qslRcvd: rand() < 0.3 ? "Y" : "N",
        notes: "Late night DX",
      }),
    );
  }

  return qsos;
}

/**
 * Generate QSOs to ensure all 8 modes are represented.
 * Fills any modes not yet represented by the other generators.
 */
function generateModeCoverage(existingModes: Set<string>): QSOInput[] {
  const qsos: QSOInput[] = [];
  const requiredModes = [
    "SSB",
    "CW",
    "FT8",
    "FT4",
    "RTTY",
    "PSK31",
    "AM",
    "FM",
  ];

  for (const mode of requiredModes) {
    if (!existingModes.has(mode)) {
      // Add 3-5 QSOs for the missing mode
      const count = randInt(3, 5);
      for (let i = 0; i < count; i++) {
        const dxcc = pick(DXCC_PREFIXES);
        const callsign = makeCallsign(dxcc.prefix);

        qsos.push(
          makeQSO({
            callsign,
            date: randomDateInRange(),
            mode,
            grid: dxcc.grid,
            lotw: rand() < 0.6,
            qslRcvd: rand() < 0.3 ? "Y" : "N",
          }),
        );
      }
    }
  }

  return qsos;
}

/**
 * Generate QSOs to ensure all 11 bands are represented.
 * Fills any bands not yet represented by the other generators.
 */
function generateBandCoverage(existingBands: Set<string>): QSOInput[] {
  const qsos: QSOInput[] = [];
  const requiredBands = [
    "160m",
    "80m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
    "6m",
    "2m",
  ];

  for (const band of requiredBands) {
    if (!existingBands.has(band)) {
      const count = randInt(3, 6);
      for (let i = 0; i < count; i++) {
        const dxcc = pick(DXCC_PREFIXES);
        const callsign = makeCallsign(dxcc.prefix);

        qsos.push(
          makeQSO({
            callsign,
            date: randomDateInRange(),
            band,
            grid: dxcc.grid,
            lotw: rand() < 0.6,
            qslRcvd: rand() < 0.3 ? "Y" : "N",
          }),
        );
      }
    }
  }

  return qsos;
}

/**
 * Generate general filler QSOs to reach the ~600 target.
 * Distributed across bands and modes, with date spread.
 */
function generateFillerQSOs(
  currentCount: number,
  targetCount: number,
): QSOInput[] {
  const qsos: QSOInput[] = [];
  const needed = targetCount - currentCount;
  if (needed <= 0) return qsos;

  // Get all dates and distribute evenly
  const allDates = getAllDatesInRange();
  const popularBands = ["20m", "40m", "15m", "10m", "80m", "17m", "6m"];
  const popularModes = ["SSB", "CW", "FT8", "FT4"];

  for (let i = 0; i < needed; i++) {
    const dxcc = pick(DXCC_PREFIXES);
    const callsign = makeCallsign(dxcc.prefix);
    const band = pick(popularBands);
    const mode = pick(popularModes);
    const date = pick(allDates);

    // For US callsigns, add state info
    let qth: string | undefined;
    if (dxcc.entity === "United States") {
      const area = dxcc.prefix.replace(/^[WKN]/, "");
      const states = CALL_AREA_STATES[area];
      if (states) {
        qth = pick(states);
      }
    }

    qsos.push(
      makeQSO({
        callsign,
        date,
        band,
        mode,
        grid: dxcc.grid,
        qth,
        lotw: rand() < 0.6,
        eqsl: rand() < 0.3,
        qslRcvd: rand() < 0.3 ? "Y" : "N",
      }),
    );
  }

  return qsos;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Seed the logbook with ~600 realistic QSO entries.
 *
 * Skips if the logbook already has > 50 entries (already seeded).
 * Returns the number of QSOs inserted.
 */
export async function seedTestLogbook(): Promise<{ count: number }> {
  // Check if already seeded
  const existing = await getAllLogEntries();
  if (existing.length > 50) {
    console.log(
      `[dev] Logbook already has ${existing.length} entries, skipping seed.`,
    );
    return { count: 0 };
  }

  // Reset deterministic state
  callsignCounter = 0;
  usedCallsigns.clear();

  // Phase 1: Core generators
  const usQSOs = generateUSQSOs();
  const dxQSOs = generateDXQSOs();
  const marathonQSOs = generateMarathonDay();
  const nightQSOs = generateNightQSOs();

  // Collect all QSOs so far
  let allQSOs = [...usQSOs, ...dxQSOs, ...marathonQSOs, ...nightQSOs];

  // Phase 2: Streak filler — ensure every day in the 35-day streak has at least 1 QSO
  const existingDates = new Set(allQSOs.map((q) => q.date));
  const streakQSOs = generateStreakFiller(existingDates);
  allQSOs = [...allQSOs, ...streakQSOs];

  // Phase 3: Mode coverage — ensure all 8 modes are present
  const existingModes = new Set(allQSOs.map((q) => q.mode));
  const modeQSOs = generateModeCoverage(existingModes);
  allQSOs = [...allQSOs, ...modeQSOs];

  // Phase 4: Band coverage — ensure all 11 bands are present
  const existingBands = new Set(allQSOs.map((q) => q.band));
  const bandQSOs = generateBandCoverage(existingBands);
  allQSOs = [...allQSOs, ...bandQSOs];

  // Phase 5: Filler to reach target count (~620 to comfortably exceed 600)
  const fillerQSOs = generateFillerQSOs(allQSOs.length, 620);
  allQSOs = [...allQSOs, ...fillerQSOs];

  // Batch insert
  await addLogEntries(allQSOs);

  console.log(
    `[dev] Seeded logbook with ${allQSOs.length} QSOs across ` +
      `${new Set(allQSOs.map((q) => q.band)).size} bands, ` +
      `${new Set(allQSOs.map((q) => q.mode)).size} modes, ` +
      `${new Set(allQSOs.map((q) => q.callsign)).size} unique callsigns, ` +
      `${new Set(allQSOs.map((q) => q.date)).size} unique dates`,
  );

  return { count: allQSOs.length };
}

/**
 * Clear all log entries from IndexedDB.
 * WARNING: This permanently removes all logbook data.
 */
export async function clearTestLogbook(): Promise<void> {
  await clearAllLogEntries();
  console.log("[dev] Cleared all logbook entries.");
}
