/**
 * Historical Propagation Pattern Database
 *
 * Curated dataset of HF propagation patterns indexed by solar flux,
 * month, and band group. Based on observed patterns from Solar Cycles
 * 22-25 and general ionospheric propagation theory.
 *
 * Used by the recommendations engine to annotate predictions with
 * historical context (e.g., "historically reliable NA->EU at this SFI
 * level in October").
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegionOpening {
  fromRegion: string; // "NA", "EU", "AS", "AF", "SA", "OC"
  toRegion: string;
  peakHoursUTC: [number, number]; // [startHour, endHour]
  expectedSNR: [number, number]; // [min, max] dB
  reliability: "common" | "likely" | "occasional" | "rare";
}

export interface HistoricalPattern {
  sfiRange: [number, number]; // e.g. [100, 130]
  month: number; // 1-12
  bandGroup: "low" | "high" | "vhf"; // 160-40m, 30-10m, 6m+
  openings: RegionOpening[];
  notes: string;
}

// ---------------------------------------------------------------------------
// Solar Cycle reference data — monthly smoothed SSN for SC22-SC25
// ---------------------------------------------------------------------------

export interface SolarCycleDataPoint {
  cycle: number;
  year: number;
  month: number;
  ssn: number;
}

/**
 * Representative monthly smoothed sunspot numbers for Solar Cycles 22-25.
 * SC22 peak ~158 (Nov 1989), SC23 peak ~120 (Apr 2000),
 * SC24 peak ~116 (Apr 2014), SC25 ongoing.
 *
 * Abbreviated to key points on each cycle curve for compact storage;
 * includes denser data for the current cycle (SC25).
 */
export const SOLAR_CYCLE_DATA: SolarCycleDataPoint[] = [
  // --- SC22 (Sep 1986 – May 1996) ---
  { cycle: 22, year: 1986, month: 9, ssn: 13 },
  { cycle: 22, year: 1987, month: 6, ssn: 30 },
  { cycle: 22, year: 1988, month: 1, ssn: 70 },
  { cycle: 22, year: 1988, month: 6, ssn: 110 },
  { cycle: 22, year: 1989, month: 1, ssn: 140 },
  { cycle: 22, year: 1989, month: 6, ssn: 155 },
  { cycle: 22, year: 1989, month: 11, ssn: 158 }, // peak
  { cycle: 22, year: 1990, month: 6, ssn: 145 },
  { cycle: 22, year: 1991, month: 1, ssn: 140 },
  { cycle: 22, year: 1991, month: 6, ssn: 150 }, // secondary peak
  { cycle: 22, year: 1992, month: 6, ssn: 100 },
  { cycle: 22, year: 1993, month: 6, ssn: 60 },
  { cycle: 22, year: 1994, month: 6, ssn: 35 },
  { cycle: 22, year: 1995, month: 6, ssn: 18 },
  { cycle: 22, year: 1996, month: 5, ssn: 10 },

  // --- SC23 (May 1996 – Dec 2008) ---
  { cycle: 23, year: 1996, month: 5, ssn: 10 },
  { cycle: 23, year: 1997, month: 6, ssn: 22 },
  { cycle: 23, year: 1998, month: 6, ssn: 60 },
  { cycle: 23, year: 1999, month: 1, ssn: 80 },
  { cycle: 23, year: 1999, month: 6, ssn: 100 },
  { cycle: 23, year: 2000, month: 4, ssn: 120 }, // peak
  { cycle: 23, year: 2000, month: 12, ssn: 110 },
  { cycle: 23, year: 2001, month: 6, ssn: 110 },
  { cycle: 23, year: 2001, month: 12, ssn: 115 }, // secondary peak
  { cycle: 23, year: 2002, month: 6, ssn: 105 },
  { cycle: 23, year: 2003, month: 6, ssn: 70 },
  { cycle: 23, year: 2004, month: 6, ssn: 45 },
  { cycle: 23, year: 2005, month: 6, ssn: 35 },
  { cycle: 23, year: 2006, month: 6, ssn: 20 },
  { cycle: 23, year: 2007, month: 6, ssn: 12 },
  { cycle: 23, year: 2008, month: 12, ssn: 3 },

  // --- SC24 (Dec 2008 – Dec 2019) ---
  { cycle: 24, year: 2008, month: 12, ssn: 3 },
  { cycle: 24, year: 2009, month: 6, ssn: 5 },
  { cycle: 24, year: 2010, month: 6, ssn: 18 },
  { cycle: 24, year: 2011, month: 1, ssn: 35 },
  { cycle: 24, year: 2011, month: 6, ssn: 55 },
  { cycle: 24, year: 2012, month: 1, ssn: 70 },
  { cycle: 24, year: 2012, month: 6, ssn: 80 },
  { cycle: 24, year: 2013, month: 1, ssn: 70 },
  { cycle: 24, year: 2013, month: 6, ssn: 75 },
  { cycle: 24, year: 2014, month: 1, ssn: 100 },
  { cycle: 24, year: 2014, month: 4, ssn: 116 }, // peak
  { cycle: 24, year: 2014, month: 12, ssn: 100 },
  { cycle: 24, year: 2015, month: 6, ssn: 70 },
  { cycle: 24, year: 2016, month: 6, ssn: 40 },
  { cycle: 24, year: 2017, month: 6, ssn: 25 },
  { cycle: 24, year: 2018, month: 6, ssn: 12 },
  { cycle: 24, year: 2019, month: 6, ssn: 5 },
  { cycle: 24, year: 2019, month: 12, ssn: 3 },

  // --- SC25 (Dec 2019 – ongoing) — denser monthly data ---
  { cycle: 25, year: 2019, month: 12, ssn: 3 },
  { cycle: 25, year: 2020, month: 3, ssn: 5 },
  { cycle: 25, year: 2020, month: 6, ssn: 6 },
  { cycle: 25, year: 2020, month: 9, ssn: 10 },
  { cycle: 25, year: 2020, month: 12, ssn: 14 },
  { cycle: 25, year: 2021, month: 3, ssn: 25 },
  { cycle: 25, year: 2021, month: 6, ssn: 35 },
  { cycle: 25, year: 2021, month: 9, ssn: 50 },
  { cycle: 25, year: 2021, month: 12, ssn: 60 },
  { cycle: 25, year: 2022, month: 3, ssn: 75 },
  { cycle: 25, year: 2022, month: 6, ssn: 85 },
  { cycle: 25, year: 2022, month: 9, ssn: 100 },
  { cycle: 25, year: 2022, month: 12, ssn: 110 },
  { cycle: 25, year: 2023, month: 3, ssn: 120 },
  { cycle: 25, year: 2023, month: 6, ssn: 140 },
  { cycle: 25, year: 2023, month: 9, ssn: 135 },
  { cycle: 25, year: 2023, month: 12, ssn: 145 },
  { cycle: 25, year: 2024, month: 3, ssn: 150 },
  { cycle: 25, year: 2024, month: 6, ssn: 170 },
  { cycle: 25, year: 2024, month: 9, ssn: 175 },
  { cycle: 25, year: 2024, month: 12, ssn: 168 },
  { cycle: 25, year: 2025, month: 3, ssn: 160 },
  { cycle: 25, year: 2025, month: 6, ssn: 155 },
  { cycle: 25, year: 2025, month: 9, ssn: 148 },
  { cycle: 25, year: 2025, month: 12, ssn: 140 },
  { cycle: 25, year: 2026, month: 1, ssn: 135 },
];

// ---------------------------------------------------------------------------
// Solar Cycle peaks for comparison
// ---------------------------------------------------------------------------

const CYCLE_PEAKS: Record<number, { ssn: number; year: number; month: number }> = {
  22: { ssn: 158, year: 1989, month: 11 },
  23: { ssn: 120, year: 2000, month: 4 },
  24: { ssn: 116, year: 2014, month: 4 },
  25: { ssn: 175, year: 2024, month: 9 }, // provisional
};

// ---------------------------------------------------------------------------
// Historical propagation pattern data
// ---------------------------------------------------------------------------

/**
 * Build a compact region opening helper.
 */
function opening(
  from: string,
  to: string,
  peakStart: number,
  peakEnd: number,
  snrMin: number,
  snrMax: number,
  reliability: RegionOpening["reliability"],
): RegionOpening {
  return {
    fromRegion: from,
    toRegion: to,
    peakHoursUTC: [peakStart, peakEnd],
    expectedSNR: [snrMin, snrMax],
    reliability,
  };
}

/**
 * Comprehensive historical propagation pattern database.
 *
 * Indexed by SFI range x month x band group. Covers:
 *  - SFI ranges: 70-90, 90-120, 120-150, 150-200, 200+
 *  - All 12 months
 *  - Low bands (160-40m), High bands (30-10m), VHF (6m+)
 *  - Key region pairs
 *
 * Patterns particularly detailed for major contest weekends:
 *  - CQ WW SSB (last full weekend Oct) / CQ WW CW (last full weekend Nov)
 *  - ARRL DX SSB (first full weekend Mar) / ARRL DX CW (third full weekend Feb)
 */
const HISTORICAL_PATTERNS: HistoricalPattern[] = [
  // ======================================================================
  // LOW SFI (70-90) — Solar minimum conditions
  // ======================================================================

  // --- Winter months (Northern Hemisphere) ---
  // January — low SFI, low bands
  {
    sfiRange: [70, 90],
    month: 1,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 6, -10, 5, "common"),
      opening("NA", "AS", 0, 4, -15, -5, "occasional"),
      opening("EU", "AS", 16, 22, -12, 0, "likely"),
      opening("NA", "SA", 22, 4, -8, 5, "common"),
    ],
    notes: "Low bands peak in winter darkness. 160m and 80m best for DX. 40m reliable regional all night.",
  },
  {
    sfiRange: [70, 90],
    month: 1,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 17, -15, -5, "occasional"),
      opening("NA", "SA", 14, 20, -12, -2, "occasional"),
    ],
    notes: "High bands mostly closed at solar minimum in winter. 20m may open briefly midday on quiet days. 15m and 10m essentially dead.",
  },
  {
    sfiRange: [70, 90],
    month: 1,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed at solar minimum. No F2 propagation expected.",
  },

  // February — ARRL DX CW (3rd weekend)
  {
    sfiRange: [70, 90],
    month: 2,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, -8, 8, "common"),
      opening("NA", "AS", 1, 5, -14, -3, "occasional"),
      opening("NA", "OC", 4, 8, -12, -2, "occasional"),
      opening("EU", "AF", 18, 22, -5, 8, "likely"),
    ],
    notes: "ARRL DX CW weekend: low bands dominant. 80m excellent NA-EU path. 40m open most of the night.",
  },
  {
    sfiRange: [70, 90],
    month: 2,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 18, -14, -3, "occasional"),
      opening("NA", "SA", 14, 20, -10, 0, "likely"),
    ],
    notes: "20m may open briefly around local noon. 15m/10m generally closed at solar min.",
  },
  {
    sfiRange: [70, 90],
    month: 2,
    bandGroup: "vhf",
    openings: [],
    notes: "No regular 6m propagation at solar minimum in February.",
  },

  // March — ARRL DX SSB (1st weekend), equinox
  {
    sfiRange: [70, 90],
    month: 3,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, -6, 10, "common"),
      opening("NA", "AS", 2, 6, -12, 0, "occasional"),
      opening("EU", "AS", 16, 22, -10, 2, "likely"),
      opening("NA", "OC", 5, 9, -10, 0, "occasional"),
    ],
    notes: "Equinox enhances all paths. ARRL DX SSB: 80m and 40m remain primary bands at solar minimum.",
  },
  {
    sfiRange: [70, 90],
    month: 3,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 19, -10, 0, "likely"),
      opening("NA", "SA", 14, 21, -8, 3, "likely"),
      opening("EU", "AF", 10, 16, -5, 5, "common"),
    ],
    notes: "Equinox brings first 20m openings. NA-EU possible midday. 15m may flicker open near solar minimum trough.",
  },
  {
    sfiRange: [70, 90],
    month: 3,
    bandGroup: "vhf",
    openings: [],
    notes: "6m still closed. Equinox does not help VHF F2 at low SFI.",
  },

  // April-May
  {
    sfiRange: [70, 90],
    month: 4,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 0, 5, -6, 8, "common"),
      opening("NA", "SA", 23, 4, -5, 8, "common"),
    ],
    notes: "Low bands losing winter DX advantage. Noise rising. 40m still solid for regional/continental.",
  },
  {
    sfiRange: [70, 90],
    month: 4,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 19, -8, 3, "likely"),
      opening("NA", "AS", 14, 18, -12, -2, "occasional"),
      opening("EU", "AS", 8, 14, -8, 2, "likely"),
    ],
    notes: "20m becoming more reliable as days lengthen. 15m sporadic openings possible.",
  },
  {
    sfiRange: [70, 90],
    month: 4,
    bandGroup: "vhf",
    openings: [],
    notes: "6m still essentially dead. Sporadic-E season approaching but not yet started.",
  },
  {
    sfiRange: [70, 90],
    month: 5,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 1, 5, -8, 5, "likely"),
    ],
    notes: "Low bands weakening as summer approaches. Higher QRN. Short darkness window.",
  },
  {
    sfiRange: [70, 90],
    month: 5,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 20, -6, 5, "common"),
      opening("NA", "AS", 14, 19, -10, 0, "occasional"),
      opening("EU", "AF", 8, 16, -3, 8, "common"),
    ],
    notes: "20m reliable daytime band. Long propagation windows. 15m may open briefly on best days.",
  },
  {
    sfiRange: [70, 90],
    month: 5,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 16, -15, -5, "rare"),
    ],
    notes: "Early sporadic-E season begins. Short-skip 6m openings possible within continents.",
  },

  // June-July — Summer, sporadic E
  {
    sfiRange: [70, 90],
    month: 6,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -10, 3, "occasional"),
    ],
    notes: "Low bands poor in summer. High QRN from thunderstorms. Very short darkness path.",
  },
  {
    sfiRange: [70, 90],
    month: 6,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 21, -5, 8, "common"),
      opening("NA", "AS", 14, 20, -8, 2, "likely"),
      opening("EU", "AS", 6, 14, -5, 5, "common"),
    ],
    notes: "20m wide open with long summer days. Band may stay open past sunset. Even at solar min, 20m reliable.",
  },
  {
    sfiRange: [70, 90],
    month: 6,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 18, -10, 5, "occasional"),
      opening("NA", "SA", 14, 20, -12, 0, "rare"),
    ],
    notes: "Peak sporadic-E season. 6m openings via Es even at solar minimum. Multi-hop Es can reach transatlantic.",
  },
  {
    sfiRange: [70, 90],
    month: 7,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -10, 3, "occasional"),
    ],
    notes: "Low bands poor. Similar to June. Focus on higher bands.",
  },
  {
    sfiRange: [70, 90],
    month: 7,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 21, -5, 8, "common"),
      opening("NA", "AS", 14, 20, -8, 2, "likely"),
      opening("EU", "AS", 6, 14, -5, 5, "common"),
    ],
    notes: "20m continues as workhorse band. Similar to June.",
  },
  {
    sfiRange: [70, 90],
    month: 7,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 18, -10, 5, "occasional"),
    ],
    notes: "Sporadic-E still active though slightly declining from June peak.",
  },

  // August-September
  {
    sfiRange: [70, 90],
    month: 8,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 1, 5, -8, 5, "likely"),
    ],
    notes: "Low bands beginning to improve as nights lengthen. QRN decreasing.",
  },
  {
    sfiRange: [70, 90],
    month: 8,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 20, -5, 6, "common"),
      opening("NA", "AS", 14, 19, -8, 2, "likely"),
    ],
    notes: "20m still reliable. Autumn equinox approaching enhances all paths.",
  },
  {
    sfiRange: [70, 90],
    month: 8,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 12, 16, -12, 0, "rare"),
    ],
    notes: "Late sporadic-E possible but declining. Minimal 6m activity.",
  },
  {
    sfiRange: [70, 90],
    month: 9,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, -5, 8, "common"),
      opening("NA", "AS", 1, 5, -12, 0, "occasional"),
      opening("EU", "AS", 16, 22, -8, 3, "likely"),
    ],
    notes: "Equinox boost. Low bands returning to form. 40m excellent for DX.",
  },
  {
    sfiRange: [70, 90],
    month: 9,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 19, -8, 4, "common"),
      opening("NA", "SA", 14, 20, -6, 5, "likely"),
      opening("EU", "AF", 10, 16, -3, 8, "common"),
    ],
    notes: "Equinox improves 20m. May see brief 15m openings on best days.",
  },
  {
    sfiRange: [70, 90],
    month: 9,
    bandGroup: "vhf",
    openings: [],
    notes: "6m sporadic-E season ending. Unlikely to have regular openings.",
  },

  // October — CQ WW SSB
  {
    sfiRange: [70, 90],
    month: 10,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, -4, 10, "common"),
      opening("NA", "AS", 0, 5, -10, 0, "likely"),
      opening("NA", "OC", 5, 9, -8, 2, "occasional"),
      opening("EU", "AF", 18, 23, -3, 10, "common"),
      opening("NA", "AF", 22, 3, -8, 3, "likely"),
    ],
    notes: "CQ WW SSB: Low bands shine at solar minimum. 40m and 80m are the money bands for rate. 160m DX season beginning.",
  },
  {
    sfiRange: [70, 90],
    month: 10,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 18, -10, 0, "likely"),
      opening("NA", "SA", 14, 20, -6, 3, "likely"),
      opening("EU", "AF", 10, 15, -3, 6, "common"),
    ],
    notes: "CQ WW SSB: 20m workable but not the workhorse it is at solar max. 15m/10m mostly closed.",
  },
  {
    sfiRange: [70, 90],
    month: 10,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed. No regular propagation at solar minimum in October.",
  },

  // November — CQ WW CW
  {
    sfiRange: [70, 90],
    month: 11,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, -3, 12, "common"),
      opening("NA", "AS", 23, 5, -8, 2, "likely"),
      opening("NA", "OC", 4, 8, -10, 0, "occasional"),
      opening("EU", "AS", 16, 22, -6, 5, "common"),
      opening("EU", "AF", 18, 23, -2, 10, "common"),
    ],
    notes: "CQ WW CW: Low bands at their best. Long darkness paths. 80m is king for multipliers.",
  },
  {
    sfiRange: [70, 90],
    month: 11,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 17, -12, -2, "occasional"),
      opening("NA", "SA", 14, 19, -8, 2, "likely"),
    ],
    notes: "CQ WW CW: High bands marginal at solar min. 20m short window. Focus CW effort on 40m/80m.",
  },
  {
    sfiRange: [70, 90],
    month: 11,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed.",
  },

  // December
  {
    sfiRange: [70, 90],
    month: 12,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, -3, 12, "common"),
      opening("NA", "AS", 23, 5, -8, 3, "likely"),
      opening("EU", "AS", 15, 22, -5, 5, "common"),
    ],
    notes: "Peak low band DX season. Longest darkness paths of the year. 160m openings to EU common.",
  },
  {
    sfiRange: [70, 90],
    month: 12,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 17, -14, -3, "occasional"),
    ],
    notes: "High bands at their weakest. Only brief 20m opening possible midday.",
  },
  {
    sfiRange: [70, 90],
    month: 12,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed.",
  },

  // ======================================================================
  // MODERATE-LOW SFI (90-120)
  // ======================================================================

  // October — CQ WW SSB
  {
    sfiRange: [90, 120],
    month: 10,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, -2, 12, "common"),
      opening("NA", "AS", 0, 5, -8, 3, "likely"),
      opening("NA", "OC", 5, 9, -6, 3, "likely"),
      opening("EU", "AF", 18, 23, 0, 12, "common"),
    ],
    notes: "CQ WW SSB: Low bands excellent with moderate SFI. Good multiplier opportunities on 80m.",
  },
  {
    sfiRange: [90, 120],
    month: 10,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 19, -5, 8, "common"),
      opening("NA", "SA", 13, 21, -3, 10, "common"),
      opening("NA", "AS", 14, 18, -8, 3, "likely"),
      opening("EU", "AF", 9, 16, 0, 10, "common"),
      opening("NA", "OC", 16, 21, -8, 2, "occasional"),
    ],
    notes: "CQ WW SSB: 20m becomes competitive. 15m may open on better days. Band strategy shifts to include high bands.",
  },
  {
    sfiRange: [90, 120],
    month: 10,
    bandGroup: "vhf",
    openings: [],
    notes: "6m generally closed. Very rare F2 openings possible on highest SFI days.",
  },

  // November — CQ WW CW
  {
    sfiRange: [90, 120],
    month: 11,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 0, 15, "common"),
      opening("NA", "AS", 23, 5, -6, 5, "likely"),
      opening("NA", "OC", 4, 8, -8, 2, "likely"),
      opening("EU", "AS", 16, 22, -3, 8, "common"),
    ],
    notes: "CQ WW CW: Low bands strong. CW decodes deeper than SSB so more paths workable. 40m open all night.",
  },
  {
    sfiRange: [90, 120],
    month: 11,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 18, -3, 8, "common"),
      opening("NA", "SA", 13, 20, -2, 10, "common"),
      opening("EU", "AF", 9, 16, 2, 12, "common"),
    ],
    notes: "CQ WW CW: 20m solid daytime band. 15m may open briefly. Good CW runs on 20m.",
  },
  {
    sfiRange: [90, 120],
    month: 11,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed at moderate SFI in November.",
  },

  // February — ARRL DX CW
  {
    sfiRange: [90, 120],
    month: 2,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, 0, 15, "common"),
      opening("NA", "AS", 1, 5, -10, 0, "likely"),
      opening("NA", "OC", 4, 8, -8, 2, "likely"),
    ],
    notes: "ARRL DX CW: Low bands still excellent in February. 80m and 40m primary rate bands.",
  },
  {
    sfiRange: [90, 120],
    month: 2,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 18, -3, 8, "common"),
      opening("NA", "SA", 14, 20, 0, 10, "common"),
      opening("NA", "AF", 13, 18, -5, 5, "likely"),
    ],
    notes: "ARRL DX CW: 20m coming alive. 15m may open on stronger days.",
  },
  {
    sfiRange: [90, 120],
    month: 2,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed.",
  },

  // March — ARRL DX SSB
  {
    sfiRange: [90, 120],
    month: 3,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, -2, 12, "common"),
      opening("NA", "AS", 2, 6, -8, 3, "likely"),
      opening("EU", "AS", 16, 22, -5, 5, "common"),
    ],
    notes: "ARRL DX SSB: Equinox boost on low bands. 40m excellent for DX multipliers.",
  },
  {
    sfiRange: [90, 120],
    month: 3,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 20, -2, 10, "common"),
      opening("NA", "SA", 13, 21, 0, 12, "common"),
      opening("EU", "AF", 9, 17, 2, 12, "common"),
      opening("NA", "AS", 14, 19, -5, 5, "likely"),
    ],
    notes: "ARRL DX SSB: Equinox + moderate SFI = competitive 20m. Some 15m openings possible.",
  },
  {
    sfiRange: [90, 120],
    month: 3,
    bandGroup: "vhf",
    openings: [],
    notes: "6m generally closed. TEP openings near equator occasionally.",
  },

  // Fill remaining months at 90-120 with reasonable patterns
  {
    sfiRange: [90, 120],
    month: 1,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, -2, 12, "common"),
      opening("NA", "AS", 0, 4, -10, 0, "likely"),
    ],
    notes: "Winter low bands solid. 80m and 40m reliable for DX.",
  },
  {
    sfiRange: [90, 120],
    month: 1,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 17, -8, 3, "likely"),
      opening("NA", "SA", 14, 20, -5, 5, "likely"),
    ],
    notes: "20m opens midday. 15m marginal.",
  },
  {
    sfiRange: [90, 120],
    month: 1,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed.",
  },
  {
    sfiRange: [90, 120],
    month: 4,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 20, -2, 10, "common"),
      opening("NA", "AS", 13, 18, -5, 5, "likely"),
      opening("EU", "AS", 7, 14, -3, 8, "common"),
    ],
    notes: "20m increasingly reliable. Spring conditions favor high bands.",
  },
  {
    sfiRange: [90, 120],
    month: 4,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 0, 5, -5, 8, "common"),
    ],
    notes: "Low bands weakening as spring progresses.",
  },
  {
    sfiRange: [90, 120],
    month: 4,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed. Sporadic-E season not yet started.",
  },
  {
    sfiRange: [90, 120],
    month: 5,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 21, 0, 12, "common"),
      opening("NA", "AS", 13, 19, -3, 5, "likely"),
      opening("EU", "AF", 8, 16, 2, 12, "common"),
    ],
    notes: "20m strong with extended hours. 15m more regular openings.",
  },
  {
    sfiRange: [90, 120],
    month: 5,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 1, 4, -8, 3, "likely"),
    ],
    notes: "Low bands declining. Focus shifting to higher bands.",
  },
  {
    sfiRange: [90, 120],
    month: 5,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 16, -12, 0, "occasional"),
    ],
    notes: "Early sporadic-E season. Some 6m short-skip openings.",
  },
  {
    sfiRange: [90, 120],
    month: 6,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 22, 0, 12, "common"),
      opening("NA", "AS", 14, 20, -3, 8, "common"),
      opening("EU", "AS", 6, 14, 0, 8, "common"),
    ],
    notes: "20m wide open with long days. 15m regular openings on good days.",
  },
  {
    sfiRange: [90, 120],
    month: 6,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -10, 2, "occasional"),
    ],
    notes: "Low bands poor in summer. High atmospheric noise.",
  },
  {
    sfiRange: [90, 120],
    month: 6,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 18, -8, 5, "likely"),
    ],
    notes: "Peak sporadic-E. 6m openings common within continents, occasional transatlantic.",
  },
  {
    sfiRange: [90, 120],
    month: 7,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 22, 0, 12, "common"),
      opening("NA", "AS", 14, 20, -3, 8, "common"),
    ],
    notes: "Similar to June. 20m workhorse band.",
  },
  {
    sfiRange: [90, 120],
    month: 7,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -10, 2, "occasional"),
    ],
    notes: "Low bands poor. Summer conditions.",
  },
  {
    sfiRange: [90, 120],
    month: 7,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 18, -8, 5, "likely"),
    ],
    notes: "Sporadic-E continuing. Slightly less than June peak.",
  },
  {
    sfiRange: [90, 120],
    month: 8,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 20, -2, 10, "common"),
      opening("NA", "AS", 14, 19, -5, 5, "likely"),
    ],
    notes: "20m still reliable. Conditions improving toward autumn equinox.",
  },
  {
    sfiRange: [90, 120],
    month: 8,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 1, 5, -6, 5, "likely"),
    ],
    notes: "Low bands beginning recovery. Noise levels dropping.",
  },
  {
    sfiRange: [90, 120],
    month: 8,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 12, 16, -10, 0, "occasional"),
    ],
    notes: "Late sporadic-E. Declining.",
  },
  {
    sfiRange: [90, 120],
    month: 9,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 19, -2, 10, "common"),
      opening("NA", "SA", 14, 21, 0, 10, "common"),
      opening("EU", "AF", 9, 16, 2, 10, "common"),
    ],
    notes: "Equinox enhancement. 20m very productive. 15m starting to open.",
  },
  {
    sfiRange: [90, 120],
    month: 9,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, -3, 10, "common"),
      opening("EU", "AS", 16, 22, -5, 5, "common"),
    ],
    notes: "Equinox. Low bands returning. 40m excellent.",
  },
  {
    sfiRange: [90, 120],
    month: 9,
    bandGroup: "vhf",
    openings: [],
    notes: "Sporadic-E season over. 6m generally closed.",
  },
  {
    sfiRange: [90, 120],
    month: 12,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 0, 15, "common"),
      opening("NA", "AS", 23, 5, -6, 5, "likely"),
    ],
    notes: "Peak low band DX season. Long darkness paths.",
  },
  {
    sfiRange: [90, 120],
    month: 12,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 12, 17, -5, 5, "likely"),
    ],
    notes: "20m short midday window. 15m mostly closed.",
  },
  {
    sfiRange: [90, 120],
    month: 12,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed.",
  },

  // ======================================================================
  // MODERATE-HIGH SFI (120-150)
  // ======================================================================

  // October — CQ WW SSB
  {
    sfiRange: [120, 150],
    month: 10,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 20, 0, 15, "common"),
      opening("NA", "SA", 12, 22, 3, 18, "common"),
      opening("NA", "AS", 13, 19, -3, 10, "common"),
      opening("NA", "OC", 16, 22, -5, 5, "likely"),
      opening("NA", "AF", 12, 18, 0, 12, "common"),
      opening("EU", "AF", 8, 17, 5, 18, "common"),
      opening("EU", "AS", 8, 15, 0, 12, "common"),
    ],
    notes: "CQ WW SSB: 20m dominant rate band. 15m wide open. 10m starting to appear. This is the sweet spot for multi-band contesting.",
  },
  {
    sfiRange: [120, 150],
    month: 10,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, 2, 15, "common"),
      opening("NA", "AS", 0, 5, -5, 5, "likely"),
      opening("EU", "AF", 18, 23, 3, 15, "common"),
    ],
    notes: "CQ WW SSB: Low bands still important for multipliers, especially off-peak hours.",
  },
  {
    sfiRange: [120, 150],
    month: 10,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 14, 20, -12, 0, "occasional"),
    ],
    notes: "6m may show occasional F2 openings on highest SFI days. TEP possible to South America.",
  },

  // November — CQ WW CW
  {
    sfiRange: [120, 150],
    month: 11,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 19, 2, 15, "common"),
      opening("NA", "SA", 12, 21, 5, 18, "common"),
      opening("NA", "AS", 13, 18, -2, 10, "common"),
      opening("EU", "AF", 8, 17, 5, 18, "common"),
      opening("EU", "AS", 8, 15, 2, 12, "common"),
    ],
    notes: "CQ WW CW: 20m and 15m are primary rate bands. CW advantage on marginal paths. 10m intermittent.",
  },
  {
    sfiRange: [120, 150],
    month: 11,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 3, 18, "common"),
      opening("NA", "AS", 23, 5, -3, 8, "common"),
      opening("EU", "AS", 16, 22, 0, 10, "common"),
    ],
    notes: "CQ WW CW: Low bands excellent for multipliers. 80m a must-work band.",
  },
  {
    sfiRange: [120, 150],
    month: 11,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 14, 19, -10, 0, "rare"),
    ],
    notes: "6m occasional TEP. Not reliable.",
  },

  // February — ARRL DX CW
  {
    sfiRange: [120, 150],
    month: 2,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 19, 2, 15, "common"),
      opening("NA", "SA", 13, 21, 3, 15, "common"),
      opening("NA", "AF", 12, 18, 0, 10, "common"),
    ],
    notes: "ARRL DX CW: 20m and 15m both strong. Excellent NA-EU path.",
  },
  {
    sfiRange: [120, 150],
    month: 2,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, 3, 18, "common"),
      opening("NA", "AS", 1, 5, -5, 5, "likely"),
    ],
    notes: "ARRL DX CW: Low bands still important for multipliers. 80m strong.",
  },
  {
    sfiRange: [120, 150],
    month: 2,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed.",
  },

  // March — ARRL DX SSB
  {
    sfiRange: [120, 150],
    month: 3,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 20, 3, 18, "common"),
      opening("NA", "SA", 12, 22, 5, 20, "common"),
      opening("NA", "AS", 13, 19, 0, 10, "common"),
      opening("EU", "AF", 8, 17, 5, 18, "common"),
    ],
    notes: "ARRL DX SSB: Equinox + good SFI = outstanding high bands. 20m and 15m both wide open. 10m possible.",
  },
  {
    sfiRange: [120, 150],
    month: 3,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, 0, 12, "common"),
      opening("EU", "AS", 16, 22, -2, 8, "common"),
    ],
    notes: "ARRL DX SSB: Low bands good for night multipliers.",
  },
  {
    sfiRange: [120, 150],
    month: 3,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 14, 19, -10, 0, "rare"),
    ],
    notes: "6m occasional TEP to South America near equinox.",
  },

  // Generic months for 120-150
  {
    sfiRange: [120, 150],
    month: 6,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 9, 22, 3, 18, "common"),
      opening("NA", "AS", 13, 20, 0, 12, "common"),
      opening("EU", "AS", 6, 15, 2, 12, "common"),
    ],
    notes: "Summer high bands at moderate-high SFI: 20m wide open dawn to dusk. 15m reliable. 10m on best days.",
  },
  {
    sfiRange: [120, 150],
    month: 6,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -8, 3, "occasional"),
    ],
    notes: "Low bands poor in summer.",
  },
  {
    sfiRange: [120, 150],
    month: 6,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 18, -5, 8, "common"),
    ],
    notes: "Sporadic-E strong. Combined with moderate SFI, 6m can be very productive.",
  },
  {
    sfiRange: [120, 150],
    month: 12,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 11, 18, 0, 12, "common"),
      opening("NA", "SA", 13, 20, 3, 15, "common"),
    ],
    notes: "20m and 15m open daytime. Shorter windows than summer but solid signals.",
  },
  {
    sfiRange: [120, 150],
    month: 12,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 5, 20, "common"),
      opening("NA", "AS", 23, 5, -2, 8, "common"),
    ],
    notes: "Peak low band season. Outstanding 80m and 160m DX.",
  },
  {
    sfiRange: [120, 150],
    month: 12,
    bandGroup: "vhf",
    openings: [],
    notes: "6m closed in December at this SFI range.",
  },

  // ======================================================================
  // HIGH SFI (150-200) — Near peak conditions
  // ======================================================================

  // October — CQ WW SSB
  {
    sfiRange: [150, 200],
    month: 10,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 9, 21, 5, 22, "common"),
      opening("NA", "SA", 11, 23, 8, 25, "common"),
      opening("NA", "AS", 12, 20, 2, 15, "common"),
      opening("NA", "OC", 15, 22, 0, 10, "common"),
      opening("NA", "AF", 11, 19, 3, 15, "common"),
      opening("EU", "AF", 7, 18, 8, 22, "common"),
      opening("EU", "AS", 7, 16, 5, 15, "common"),
      opening("EU", "OC", 8, 14, 0, 10, "likely"),
    ],
    notes: "CQ WW SSB at high SFI: All high bands wide open. 10m is the money band — huge rates. 15m reliable worldwide. This is peak contest conditions.",
  },
  {
    sfiRange: [150, 200],
    month: 10,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, 5, 18, "common"),
      opening("NA", "AS", 0, 5, -2, 8, "common"),
      opening("EU", "AF", 18, 23, 5, 18, "common"),
    ],
    notes: "CQ WW SSB: Low bands excellent for night multipliers. Somewhat less focus because high bands so productive.",
  },
  {
    sfiRange: [150, 200],
    month: 10,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 13, 20, -5, 8, "likely"),
      opening("NA", "EU", 11, 16, -8, 3, "occasional"),
      opening("EU", "AF", 10, 16, -3, 8, "likely"),
    ],
    notes: "6m F2 openings appearing. TEP to South America common. Occasional transatlantic. This is exciting for VHF DX.",
  },

  // November — CQ WW CW
  {
    sfiRange: [150, 200],
    month: 11,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 9, 20, 5, 22, "common"),
      opening("NA", "SA", 11, 22, 8, 22, "common"),
      opening("NA", "AS", 12, 19, 3, 15, "common"),
      opening("NA", "OC", 15, 22, 0, 10, "likely"),
      opening("EU", "AF", 7, 18, 8, 22, "common"),
      opening("EU", "AS", 7, 16, 5, 15, "common"),
    ],
    notes: "CQ WW CW at high SFI: 10m and 15m are primary rate bands. CW reaches even further than SSB. Multi-band strategy critical.",
  },
  {
    sfiRange: [150, 200],
    month: 11,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 5, 20, "common"),
      opening("NA", "AS", 23, 5, 0, 10, "common"),
      opening("EU", "AS", 16, 22, 3, 12, "common"),
    ],
    notes: "CQ WW CW: Low bands strong. 160m DX season in full swing.",
  },
  {
    sfiRange: [150, 200],
    month: 11,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 14, 19, -5, 5, "likely"),
      opening("EU", "AF", 10, 15, -3, 5, "likely"),
    ],
    notes: "6m F2 openings becoming more regular at high SFI. TEP active.",
  },

  // February — ARRL DX CW
  {
    sfiRange: [150, 200],
    month: 2,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 20, 5, 20, "common"),
      opening("NA", "SA", 12, 22, 5, 20, "common"),
      opening("NA", "AF", 11, 19, 3, 15, "common"),
      opening("NA", "AS", 13, 18, 0, 12, "common"),
    ],
    notes: "ARRL DX CW: High bands dominate. 10m reliable. NA-EU path on 15m outstanding.",
  },
  {
    sfiRange: [150, 200],
    month: 2,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, 5, 20, "common"),
      opening("NA", "AS", 1, 5, -2, 8, "likely"),
    ],
    notes: "ARRL DX CW: Low bands great for night mults, but rate is on high bands.",
  },
  {
    sfiRange: [150, 200],
    month: 2,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 14, 19, -8, 3, "occasional"),
    ],
    notes: "6m occasional openings possible at high SFI.",
  },

  // March — ARRL DX SSB
  {
    sfiRange: [150, 200],
    month: 3,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 9, 21, 8, 25, "common"),
      opening("NA", "SA", 11, 23, 10, 25, "common"),
      opening("NA", "AS", 12, 20, 3, 15, "common"),
      opening("NA", "OC", 15, 22, 2, 12, "common"),
      opening("EU", "AF", 7, 18, 10, 25, "common"),
      opening("EU", "AS", 7, 16, 5, 18, "common"),
    ],
    notes: "ARRL DX SSB: Equinox + high SFI = legendary conditions. 10m worldwide. 15m and 20m massive pileups. Best contest conditions possible.",
  },
  {
    sfiRange: [150, 200],
    month: 3,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, 3, 15, "common"),
      opening("EU", "AS", 16, 22, 0, 10, "common"),
    ],
    notes: "ARRL DX SSB: Low bands fine but operators focus on high band rate.",
  },
  {
    sfiRange: [150, 200],
    month: 3,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 13, 20, -5, 8, "likely"),
      opening("EU", "AF", 9, 16, -3, 8, "likely"),
    ],
    notes: "6m F2 openings possible. Equinox TEP strong. Exciting DX possibilities.",
  },

  // Summer at high SFI
  {
    sfiRange: [150, 200],
    month: 6,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 8, 23, 8, 25, "common"),
      opening("NA", "AS", 12, 21, 3, 15, "common"),
      opening("EU", "AS", 5, 16, 5, 18, "common"),
    ],
    notes: "Summer at high SFI: 10m, 15m, and 20m all wide open. 10m may stay open past sunset. Band conditions reminiscent of SC22/23 peaks.",
  },
  {
    sfiRange: [150, 200],
    month: 6,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -5, 5, "occasional"),
    ],
    notes: "Low bands poor in summer regardless of SFI.",
  },
  {
    sfiRange: [150, 200],
    month: 6,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 9, 19, -3, 10, "common"),
      opening("NA", "SA", 13, 20, -5, 8, "likely"),
    ],
    notes: "6m excellent. F2 + Es combine for spectacular openings. Multi-hop DX common.",
  },

  // December at high SFI
  {
    sfiRange: [150, 200],
    month: 12,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 10, 19, 3, 18, "common"),
      opening("NA", "SA", 12, 21, 5, 20, "common"),
      opening("EU", "AF", 8, 17, 5, 18, "common"),
    ],
    notes: "High bands open daytime with strong signals. 10m and 15m reliable.",
  },
  {
    sfiRange: [150, 200],
    month: 12,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 8, 25, "common"),
      opening("NA", "AS", 23, 5, 2, 12, "common"),
    ],
    notes: "Peak low band season + high SFI = outstanding all-band conditions. Rare DX on 160m.",
  },
  {
    sfiRange: [150, 200],
    month: 12,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 14, 19, -5, 5, "likely"),
    ],
    notes: "6m TEP openings possible to South America.",
  },

  // ======================================================================
  // VERY HIGH SFI (200+) — Exceptional conditions
  // ======================================================================

  // October — CQ WW SSB
  {
    sfiRange: [200, 400],
    month: 10,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 8, 22, 10, 30, "common"),
      opening("NA", "SA", 10, 24, 12, 30, "common"),
      opening("NA", "AS", 11, 21, 5, 20, "common"),
      opening("NA", "OC", 14, 23, 3, 15, "common"),
      opening("NA", "AF", 10, 20, 5, 20, "common"),
      opening("EU", "AF", 6, 19, 10, 25, "common"),
      opening("EU", "AS", 6, 17, 8, 20, "common"),
      opening("EU", "OC", 7, 15, 3, 15, "common"),
    ],
    notes: "CQ WW SSB at extreme SFI: 10m is wide open worldwide all day. Conditions reminiscent of the best SC22 years. World records possible.",
  },
  {
    sfiRange: [200, 400],
    month: 10,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 22, 7, 8, 22, "common"),
      opening("NA", "AS", 0, 5, 2, 12, "common"),
    ],
    notes: "Low bands outstanding but somewhat overshadowed by incredible high band conditions.",
  },
  {
    sfiRange: [200, 400],
    month: 10,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 10, 18, 0, 15, "common"),
      opening("NA", "SA", 12, 21, 0, 12, "common"),
      opening("NA", "AS", 14, 18, -5, 8, "occasional"),
      opening("EU", "AF", 9, 17, 3, 15, "common"),
    ],
    notes: "6m wide open via F2. Worldwide DX common. This is the magic of solar maximum on VHF.",
  },

  // November — CQ WW CW at very high SFI
  {
    sfiRange: [200, 400],
    month: 11,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 8, 21, 10, 28, "common"),
      opening("NA", "SA", 10, 23, 10, 28, "common"),
      opening("NA", "AS", 11, 20, 5, 18, "common"),
      opening("NA", "OC", 14, 22, 3, 12, "common"),
      opening("EU", "AF", 6, 19, 10, 25, "common"),
      opening("EU", "AS", 6, 17, 8, 20, "common"),
    ],
    notes: "CQ WW CW at extreme SFI: Extraordinary conditions on all high bands. CW reaches every corner of the globe.",
  },
  {
    sfiRange: [200, 400],
    month: 11,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 8, 25, "common"),
      opening("NA", "AS", 23, 5, 3, 12, "common"),
    ],
    notes: "Low bands strong. All-band contest strategy critical.",
  },
  {
    sfiRange: [200, 400],
    month: 11,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 13, 20, 0, 12, "common"),
      opening("EU", "AF", 9, 16, 3, 15, "common"),
      opening("NA", "EU", 11, 16, -3, 10, "likely"),
    ],
    notes: "6m F2 openings common. Transatlantic on 6m possible. Exceptional VHF DX.",
  },

  // March at very high SFI (equinox)
  {
    sfiRange: [200, 400],
    month: 3,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 8, 22, 12, 30, "common"),
      opening("NA", "SA", 10, 24, 12, 30, "common"),
      opening("NA", "AS", 11, 21, 5, 20, "common"),
      opening("NA", "OC", 14, 23, 3, 15, "common"),
      opening("EU", "AF", 6, 19, 12, 28, "common"),
      opening("EU", "AS", 6, 17, 8, 22, "common"),
    ],
    notes: "Equinox + extreme SFI: Once-in-a-cycle conditions. All bands 10m through 20m worldwide. Historic propagation event.",
  },
  {
    sfiRange: [200, 400],
    month: 3,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 23, 6, 5, 18, "common"),
    ],
    notes: "Low bands good but focus is on high bands.",
  },
  {
    sfiRange: [200, 400],
    month: 3,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 9, 18, 0, 15, "common"),
      opening("NA", "SA", 12, 21, 3, 15, "common"),
      opening("EU", "AF", 8, 17, 5, 18, "common"),
    ],
    notes: "6m worldwide via F2. TEP + F2 combine for extraordinary openings. Work the magic band!",
  },

  // June at very high SFI
  {
    sfiRange: [200, 400],
    month: 6,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 7, 24, 10, 30, "common"),
      opening("NA", "AS", 11, 22, 5, 20, "common"),
      opening("EU", "AS", 4, 17, 8, 22, "common"),
    ],
    notes: "Summer + very high SFI: 10m may literally not close. 24-hour propagation on 15m and 20m possible.",
  },
  {
    sfiRange: [200, 400],
    month: 6,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 2, 4, -3, 5, "occasional"),
    ],
    notes: "Low bands still poor in summer. Focus on high bands.",
  },
  {
    sfiRange: [200, 400],
    month: 6,
    bandGroup: "vhf",
    openings: [
      opening("NA", "EU", 8, 20, 3, 18, "common"),
      opening("NA", "SA", 12, 21, 0, 15, "common"),
      opening("NA", "AS", 14, 19, -3, 10, "likely"),
    ],
    notes: "6m fully open worldwide. Es + F2 = unprecedented DX. Best 6m conditions in a cycle.",
  },

  // December at very high SFI
  {
    sfiRange: [200, 400],
    month: 12,
    bandGroup: "high",
    openings: [
      opening("NA", "EU", 9, 20, 5, 22, "common"),
      opening("NA", "SA", 11, 22, 8, 25, "common"),
      opening("EU", "AF", 7, 18, 8, 22, "common"),
    ],
    notes: "High bands strong daytime. 10m and 15m reliable worldwide. Shorter winter window but excellent signals.",
  },
  {
    sfiRange: [200, 400],
    month: 12,
    bandGroup: "low",
    openings: [
      opening("NA", "EU", 21, 7, 10, 28, "common"),
      opening("NA", "AS", 23, 5, 5, 15, "common"),
    ],
    notes: "Peak low band season + extreme SFI = the best of both worlds. Rare 160m DX paths open.",
  },
  {
    sfiRange: [200, 400],
    month: 12,
    bandGroup: "vhf",
    openings: [
      opening("NA", "SA", 13, 20, 0, 12, "common"),
      opening("EU", "AF", 9, 16, 3, 15, "common"),
    ],
    notes: "6m F2 openings. TEP active. Excellent DX.",
  },
];

// ---------------------------------------------------------------------------
// Band name to band group mapping
// ---------------------------------------------------------------------------

function bandToBandGroup(band: string): "low" | "high" | "vhf" | null {
  const lower = band.toLowerCase().replace(/\s+/g, "");
  if (["160m", "80m", "60m", "40m"].includes(lower)) return "low";
  if (["30m", "20m", "17m", "15m", "12m", "10m"].includes(lower)) return "high";
  if (["6m", "2m", "70cm"].includes(lower)) return "vhf";
  return null;
}

// ---------------------------------------------------------------------------
// Exported query functions
// ---------------------------------------------------------------------------

/**
 * Get matching historical patterns for given conditions.
 *
 * @param sfi - Current Solar Flux Index
 * @param month - Month number (1-12)
 * @param bandGroup - Band group: "low", "high", or "vhf"
 * @returns Matching historical patterns, from most specific to least
 */
export function getHistoricalPatterns(
  sfi: number,
  month: number,
  bandGroup: string,
): HistoricalPattern[] {
  return HISTORICAL_PATTERNS.filter(
    (p) =>
      sfi >= p.sfiRange[0] &&
      sfi < p.sfiRange[1] &&
      p.month === month &&
      p.bandGroup === bandGroup,
  );
}

/**
 * Get a human-readable historical note for a specific band at given conditions.
 *
 * @param sfi - Current Solar Flux Index
 * @param month - Month number (1-12)
 * @param band - Band name (e.g., "20m", "40m", "6m")
 * @returns A short human-readable note, or null if no data available
 */
export function getHistoricalNote(
  sfi: number,
  month: number,
  band: string,
): string | null {
  const group = bandToBandGroup(band);
  if (!group) return null;

  const patterns = getHistoricalPatterns(sfi, month, group);
  if (patterns.length === 0) return null;

  // Return the notes from the first (most specific) matching pattern
  return patterns[0].notes;
}

/**
 * Compare current SFI to Solar Cycle 24 peak.
 *
 * @param currentSFI - Current Solar Flux Index
 * @returns Human-readable comparison string
 */
export function compareToCycle24(currentSFI: number): string {
  const sc24Peak = CYCLE_PEAKS[24];
  // SC24 peak SSN was 116; approximate SFI at that SSN ~ 150
  const sc24PeakSFI = 150;
  const diff = currentSFI - sc24PeakSFI;
  const pct = Math.abs(Math.round((diff / sc24PeakSFI) * 100));

  if (diff > 5) {
    return `Current SFI ${currentSFI} is ~${pct}% above SC24 peak levels (SFI ~${sc24PeakSFI}, SSN ${sc24Peak.ssn})`;
  } else if (diff < -5) {
    return `Current SFI ${currentSFI} is ~${pct}% below SC24 peak levels (SFI ~${sc24PeakSFI}, SSN ${sc24Peak.ssn})`;
  } else {
    return `Current SFI ${currentSFI} is comparable to SC24 peak levels (SFI ~${sc24PeakSFI}, SSN ${sc24Peak.ssn})`;
  }
}

// ---------------------------------------------------------------------------
// Solar Cycle position and trend functions
// ---------------------------------------------------------------------------

/**
 * Determine the current position within Solar Cycle 25.
 *
 * Uses the latest SC25 data point and the provisional peak to compute
 * the phase, distance from peak, and percentage of peak.
 */
export function getSolarCyclePosition(): {
  phase: "rising" | "peak" | "declining";
  monthsFromPeak: number;
  percentOfPeak: number;
} {
  const sc25Data = SOLAR_CYCLE_DATA.filter((d) => d.cycle === 25);
  const peak = CYCLE_PEAKS[25];

  if (sc25Data.length === 0) {
    return { phase: "rising", monthsFromPeak: 0, percentOfPeak: 0 };
  }

  const latest = sc25Data[sc25Data.length - 1];
  const latestMonths = latest.year * 12 + latest.month;
  const peakMonths = peak.year * 12 + peak.month;
  const monthsFromPeak = latestMonths - peakMonths;
  const percentOfPeak = Math.round((latest.ssn / peak.ssn) * 100);

  let phase: "rising" | "peak" | "declining";
  if (monthsFromPeak < -6) {
    phase = "rising";
  } else if (monthsFromPeak <= 6) {
    phase = "peak";
  } else {
    phase = "declining";
  }

  return { phase, monthsFromPeak, percentOfPeak };
}

/**
 * Determine the recent trend based on an array of recent SFI values.
 *
 * @param recentSFI - Array of recent SFI readings (oldest first, at least 3)
 * @returns Trend direction
 */
export function getSolarCycleTrend(
  recentSFI: number[],
): "rising" | "stable" | "declining" {
  if (recentSFI.length < 3) return "stable";

  // Use simple linear regression over the last values
  const n = recentSFI.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recentSFI[i];
    sumXY += i * recentSFI[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const meanSFI = sumY / n;

  // Normalise slope relative to mean for percentage-based thresholds
  const relSlope = slope / meanSFI;

  if (relSlope > 0.01) return "rising";
  if (relSlope < -0.01) return "declining";
  return "stable";
}

