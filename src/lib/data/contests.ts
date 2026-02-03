/**
 * Built-in Contest Definitions for Propulse
 *
 * These definitions are based on official contest rules and are intended
 * to provide accurate exchange formats and scoring for popular contests.
 *
 * Note: Contest rules may change year-to-year. Always verify with official
 * rules before submitting logs.
 */

import type { ContestDefinition } from "@/types/contest";

/**
 * Standard category templates for common contest formats
 */
const STANDARD_DX_CATEGORIES: ContestDefinition["categories"] = {
  operator: [
    "single-op",
    "multi-single",
    "multi-two",
    "multi-multi",
    "checklog",
  ],
  band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
  power: ["high", "low", "qrp"],
  mode: ["cw", "ssb", "mixed"],
  assisted: ["assisted", "non-assisted"],
};

export const STANDARD_DOMESTIC_CATEGORIES: ContestDefinition["categories"] = {
  operator: ["single-op", "multi-op", "checklog"],
  band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
  power: ["high", "low", "qrp"],
  mode: ["cw", "ssb", "mixed"],
  assisted: ["assisted", "non-assisted"],
};

/**
 * Built-in contest definitions database
 */
export const CONTEST_DATABASE: ContestDefinition[] = [
  // ============ CQ CONTESTS ============

  /**
   * CQ World Wide DX Contest - CW
   * Premier DX contest held the last full weekend of November
   * https://www.cqww.com/rules.htm
   */
  {
    id: "cqww-cw",
    name: "CQ World Wide DX Contest - CW",
    sponsor: "CQ Magazine",
    months: [11],
    durationHours: 48,
    // vNext fields
    multiplierRules: [
      { type: "CQ_ZONE", source: "exchange", perBand: true },
      { type: "DXCC", source: "callsign", perBand: true },
    ],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "CQ_ZONE",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 0, // Same country = 0 points
      diffContinent: 3, // Different continent = 3 points
      sameCountry: 0,
    },
    exchange: {
      sent: "{rst} {zone}",
      received: "{rst} {zone}",
      fields: ["rst", "zone"],
    },
    categories: STANDARD_DX_CATEGORIES,
    cabrilloId: "CQ-WW-CW",
    rulesUrl: "https://www.cqww.com/rules.htm",
    description:
      "The largest amateur radio contest in the world. Work as many stations in as many CQ zones and DXCC countries as possible.",
  },

  /**
   * CQ World Wide DX Contest - SSB
   * Premier DX contest held the last full weekend of October
   * https://www.cqww.com/rules.htm
   */
  {
    id: "cqww-ssb",
    name: "CQ World Wide DX Contest - SSB",
    sponsor: "CQ Magazine",
    months: [10],
    durationHours: 48,
    // vNext fields
    multiplierRules: [
      { type: "CQ_ZONE", source: "exchange", perBand: true },
      { type: "DXCC", source: "callsign", perBand: true },
    ],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "CQ_ZONE",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 0,
      diffContinent: 3,
      sameCountry: 0,
    },
    exchange: {
      sent: "{rst} {zone}",
      received: "{rst} {zone}",
      fields: ["rst", "zone"],
    },
    categories: STANDARD_DX_CATEGORIES,
    cabrilloId: "CQ-WW-SSB",
    rulesUrl: "https://www.cqww.com/rules.htm",
    description:
      "The largest amateur radio contest in the world. Work as many stations in as many CQ zones and DXCC countries as possible.",
  },

  /**
   * CQ WPX Contest - CW
   * Work stations with unique callsign prefixes
   * https://www.cqwpx.com/rules.htm
   */
  {
    id: "cqwpx-cw",
    name: "CQ WPX Contest - CW",
    sponsor: "CQ Magazine",
    months: [5],
    durationHours: 48,
    // vNext fields
    multiplierRules: [
      { type: "WPX_PREFIX", source: "callsign", perBand: true },
    ],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "WPX_PREFIX",
    multiplierPerBand: false,
    scoring: {
      mode: "zone",
      sameContinent: 1, // Same continent = 1 point
      diffContinent: 3, // Different continent = 3 points (on 20/15/10m)
      sameCountry: 1,
    },
    exchange: {
      sent: "{rst} {serial}",
      received: "{rst} {serial}",
      fields: ["rst", "serial"],
    },
    categories: STANDARD_DX_CATEGORIES,
    cabrilloId: "CQ-WPX-CW",
    rulesUrl: "https://www.cqwpx.com/rules.htm",
    description:
      "Work stations worldwide, collecting unique callsign prefixes as multipliers. Serial numbers are exchanged.",
  },

  /**
   * CQ WPX Contest - SSB
   * Work stations with unique callsign prefixes
   * https://www.cqwpx.com/rules.htm
   */
  {
    id: "cqwpx-ssb",
    name: "CQ WPX Contest - SSB",
    sponsor: "CQ Magazine",
    months: [3],
    durationHours: 48,
    // vNext fields
    multiplierRules: [
      { type: "WPX_PREFIX", source: "callsign", perBand: true },
    ],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "WPX_PREFIX",
    multiplierPerBand: false,
    scoring: {
      mode: "zone",
      sameContinent: 1,
      diffContinent: 3,
      sameCountry: 1,
    },
    exchange: {
      sent: "{rst} {serial}",
      received: "{rst} {serial}",
      fields: ["rst", "serial"],
    },
    categories: STANDARD_DX_CATEGORIES,
    cabrilloId: "CQ-WPX-SSB",
    rulesUrl: "https://www.cqwpx.com/rules.htm",
    description:
      "Work stations worldwide, collecting unique callsign prefixes as multipliers. Serial numbers are exchanged.",
  },

  // ============ ARRL CONTESTS ============

  /**
   * ARRL DX Contest - CW
   * Work DX stations from W/VE; DX works W/VE stations
   * https://www.arrl.org/arrl-dx
   */
  {
    id: "arrl-dx-cw",
    name: "ARRL International DX Contest - CW",
    sponsor: "ARRL",
    months: [2],
    durationHours: 48,
    // vNext fields (Note: DX stations use DXCC, W/VE use STATE - simplified to STATE)
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE", // W/VE stations count DXCC as mult; DX counts states/provinces
    multiplierPerBand: true,
    scoring: {
      mode: "fixed",
      fixedPoints: 3, // 3 points per QSO
    },
    exchange: {
      sent: "{rst} {state}", // W/VE sends state/province; DX sends power
      received: "{rst} {power}",
      fields: ["rst", "state", "power"],
    },
    categories: {
      operator: [
        "single-op",
        "multi-single",
        "multi-two",
        "multi-multi",
        "checklog",
      ],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "ARRL-DX-CW",
    rulesUrl: "https://www.arrl.org/arrl-dx",
    description:
      "W/VE stations work DX; DX stations work W/VE. W/VE sends state/province, DX sends power.",
  },

  /**
   * ARRL DX Contest - SSB
   * Work DX stations from W/VE; DX works W/VE stations
   * https://www.arrl.org/arrl-dx
   */
  {
    id: "arrl-dx-ssb",
    name: "ARRL International DX Contest - SSB",
    sponsor: "ARRL",
    months: [3],
    durationHours: 48,
    // vNext fields (Note: DX stations use DXCC, W/VE use STATE - simplified to STATE)
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: true,
    scoring: {
      mode: "fixed",
      fixedPoints: 3,
    },
    exchange: {
      sent: "{rst} {state}",
      received: "{rst} {power}",
      fields: ["rst", "state", "power"],
    },
    categories: {
      operator: [
        "single-op",
        "multi-single",
        "multi-two",
        "multi-multi",
        "checklog",
      ],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["ssb"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "ARRL-DX-SSB",
    rulesUrl: "https://www.arrl.org/arrl-dx",
    description:
      "W/VE stations work DX; DX stations work W/VE. W/VE sends state/province, DX sends power.",
  },

  /**
   * ARRL Sweepstakes - CW
   * Classic domestic contest with complex exchange
   * https://www.arrl.org/sweepstakes
   */
  {
    id: "arrl-ss-cw",
    name: "ARRL Sweepstakes - CW",
    sponsor: "ARRL",
    months: [11],
    durationHours: 24, // 24 hours of operating in 30-hour window
    // vNext fields
    multiplierRules: [{ type: "SECTION", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "SECTION",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 2, // 2 points per complete QSO
    },
    exchange: {
      sent: "{serial} {precedence} {callsign} {check} {section}",
      received: "{serial} {precedence} {callsign} {check} {section}",
      fields: ["serial", "precedence", "check", "section"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["non-assisted"], // No assisted category in SS
    },
    cabrilloId: "ARRL-SS-CW",
    rulesUrl: "https://www.arrl.org/sweepstakes",
    description:
      "Classic ARRL contest. Exchange includes serial number, precedence (Q/A/B/U/M/S), check (year licensed), and ARRL/RAC section. Goal is a 'clean sweep' of all 84 sections.",
  },

  /**
   * ARRL Sweepstakes - SSB
   * Classic domestic contest with complex exchange
   * https://www.arrl.org/sweepstakes
   */
  {
    id: "arrl-ss-ssb",
    name: "ARRL Sweepstakes - SSB",
    sponsor: "ARRL",
    months: [11],
    durationHours: 24,
    // vNext fields
    multiplierRules: [{ type: "SECTION", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "SECTION",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 2,
    },
    exchange: {
      sent: "{serial} {precedence} {callsign} {check} {section}",
      received: "{serial} {precedence} {callsign} {check} {section}",
      fields: ["serial", "precedence", "check", "section"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all"],
      power: ["high", "low", "qrp"],
      mode: ["ssb"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "ARRL-SS-SSB",
    rulesUrl: "https://www.arrl.org/sweepstakes",
    description:
      "Classic ARRL contest. Exchange includes serial number, precedence (Q/A/B/U/M/S), check (year licensed), and ARRL/RAC section. Goal is a 'clean sweep' of all 84 sections.",
  },

  /**
   * ARRL Field Day
   * Emergency preparedness exercise and contest
   * https://www.arrl.org/field-day
   */
  {
    id: "arrl-fd",
    name: "ARRL Field Day",
    sponsor: "ARRL",
    months: [6],
    durationHours: 24, // 24 hours, 4th full weekend of June
    // vNext fields
    multiplierRules: [], // No multipliers in FD scoring formula
    dupeRule: { perBand: true, perMode: true },
    scoreModel: "field_day",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "NONE",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 2, // CW and digital = 2 points
      ssbPoints: 1, // Phone = 1 point
      digitalPoints: 2,
    },
    exchange: {
      sent: "{class} {section}",
      received: "{class} {section}",
      fields: ["class", "section"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "digital", "mixed"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "ARRL-FIELD-DAY",
    rulesUrl: "https://www.arrl.org/field-day",
    description:
      "Annual emergency preparedness exercise. Exchange class (number of transmitters + category letter, e.g., '2A') and ARRL/RAC section. Bonus points available for various activities.",
  },

  // ============ IARU CONTEST ============

  /**
   * IARU HF World Championship
   * Work stations worldwide, ITU zones and HQ stations
   * https://www.arrl.org/iaru-hf-championship
   */
  {
    id: "iaru-hf",
    name: "IARU HF World Championship",
    sponsor: "IARU",
    months: [7],
    durationHours: 24,
    // vNext fields
    multiplierRules: [{ type: "ITU_ZONE", source: "exchange", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "ITU_ZONE",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 1, // Same ITU zone = 1 point
      diffContinent: 3, // Different ITU zone = 3 points (on 20/15/10m)
      sameCountry: 1,
    },
    exchange: {
      sent: "{rst} {zone}", // or HQ station sends RS(T) + abbreviation
      received: "{rst} {zone}",
      fields: ["rst", "zone"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "IARU-HF",
    rulesUrl: "https://www.arrl.org/iaru-hf-championship",
    description:
      "Second full weekend of July. Work stations in ITU zones and official IARU HQ stations. HQ stations count as multipliers and give 1 point.",
  },

  // ============ RTTY/DIGITAL CONTESTS ============

  /**
   * CQ WW RTTY DX Contest
   * Major RTTY contest with CQ zones as multipliers
   * https://www.cqwwrtty.com/rules.htm
   */
  {
    id: "cqww-rtty",
    name: "CQ WW RTTY DX Contest",
    sponsor: "CQ Magazine",
    months: [9],
    durationHours: 48,
    // vNext fields
    multiplierRules: [
      { type: "CQ_ZONE", source: "exchange", perBand: true },
      { type: "DXCC", source: "callsign", perBand: true },
    ],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "CQ_ZONE",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 0,
      diffContinent: 3,
      sameCountry: 0,
    },
    exchange: {
      sent: "{rst} {zone}",
      received: "{rst} {zone}",
      fields: ["rst", "zone"],
    },
    categories: {
      operator: [
        "single-op",
        "multi-single",
        "multi-two",
        "multi-multi",
        "checklog",
      ],
      band: ["all", "single", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low"],
      mode: ["rtty"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "CQ-WW-RTTY",
    rulesUrl: "https://www.cqwwrtty.com/rules.htm",
    description:
      "Last full weekend of September. Similar to CQ WW but for RTTY mode. CQ zones and countries are multipliers.",
  },

  /**
   * ARRL RTTY Roundup
   * Popular domestic RTTY contest
   * https://www.arrl.org/rtty-roundup
   */
  {
    id: "arrl-rtty-ru",
    name: "ARRL RTTY Roundup",
    sponsor: "ARRL",
    months: [1],
    durationHours: 24, // First full weekend of January
    // vNext fields
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 1, // 1 point per QSO with US/VE; DX = 1 point
    },
    exchange: {
      sent: "{rst} {state}", // W/VE sends state/province; DX sends serial
      received: "{rst} {state}",
      fields: ["rst", "state", "serial"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single"],
      power: ["high", "low"],
      mode: ["rtty", "digital"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "ARRL-RTTY",
    rulesUrl: "https://www.arrl.org/rtty-roundup",
    description:
      "First weekend of January. W/VE sends state/province, DX sends serial number. States, provinces, and DXCC countries are multipliers.",
  },

  // ============ OTHER MAJOR CONTESTS ============

  /**
   * North American QSO Party - CW
   * Fast-paced North American contest
   * https://www.ncjweb.com/naqp/
   */
  {
    id: "naqp-cw",
    name: "North American QSO Party - CW",
    sponsor: "NCJ",
    months: [1, 8],
    durationHours: 12,
    // vNext fields
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 1,
    },
    exchange: {
      sent: "{name} {state}",
      received: "{name} {state}",
      fields: ["name", "state"],
    },
    categories: {
      operator: ["single-op", "multi-two", "checklog"],
      band: ["all"],
      power: ["low"], // 100W max for NAQP
      mode: ["cw"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "NAQP-CW",
    rulesUrl: "https://www.ncjweb.com/naqp/",
    description:
      "Fast-paced 12-hour contest. Exchange name and state/province/country. 100W power limit. January and August.",
  },

  /**
   * North American QSO Party - SSB
   * Fast-paced North American contest
   * https://www.ncjweb.com/naqp/
   */
  {
    id: "naqp-ssb",
    name: "North American QSO Party - SSB",
    sponsor: "NCJ",
    months: [1, 8],
    durationHours: 12,
    // vNext fields
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 1,
    },
    exchange: {
      sent: "{name} {state}",
      received: "{name} {state}",
      fields: ["name", "state"],
    },
    categories: {
      operator: ["single-op", "multi-two", "checklog"],
      band: ["all"],
      power: ["low"],
      mode: ["ssb"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "NAQP-SSB",
    rulesUrl: "https://www.ncjweb.com/naqp/",
    description:
      "Fast-paced 12-hour contest. Exchange name and state/province/country. 100W power limit. January and August.",
  },

  /**
   * CQWW 160m Contest - CW
   * Low band DX contest
   * https://www.cq160.com/rules.htm
   */
  {
    id: "cqww-160-cw",
    name: "CQ 160-Meter Contest - CW",
    sponsor: "CQ Magazine",
    months: [1],
    durationHours: 42,
    // vNext fields (160m only = no band dimension)
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "zone",
      sameContinent: 2,
      diffContinent: 5,
      sameCountry: 2,
    },
    exchange: {
      sent: "{rst} {state}", // W/VE sends state/province; DX sends CQ zone
      received: "{rst} {state}",
      fields: ["rst", "state", "zone"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["160m"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "CQ-160-CW",
    rulesUrl: "https://www.cq160.com/rules.htm",
    description:
      "160-meter band only contest. W/VE sends state/province, DX sends CQ zone. Last full weekend of January.",
  },

  /**
   * CQWW 160m Contest - SSB
   * Low band DX contest
   * https://www.cq160.com/rules.htm
   */
  {
    id: "cqww-160-ssb",
    name: "CQ 160-Meter Contest - SSB",
    sponsor: "CQ Magazine",
    months: [2],
    durationHours: 42,
    // vNext fields (160m only = no band dimension)
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "zone",
      sameContinent: 2,
      diffContinent: 5,
      sameCountry: 2,
    },
    exchange: {
      sent: "{rst} {state}",
      received: "{rst} {state}",
      fields: ["rst", "state", "zone"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["160m"],
      power: ["high", "low", "qrp"],
      mode: ["ssb"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "CQ-160-SSB",
    rulesUrl: "https://www.cq160.com/rules.htm",
    description:
      "160-meter band only contest. W/VE sends state/province, DX sends CQ zone. Last full weekend of February.",
  },

  /**
   * ARRL 10-Meter Contest
   * High band activity weekend
   * https://www.arrl.org/10-meter
   */
  {
    id: "arrl-10m",
    name: "ARRL 10-Meter Contest",
    sponsor: "ARRL",
    months: [12],
    durationHours: 48,
    // vNext fields (CW and SSB can work same station = perMode: true)
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: true },
    scoreModel: "points_x_mults_total",
    // Legacy fields (kept for backward compatibility)
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 4, // CW = 4 points
      ssbPoints: 2, // Phone = 2 points
    },
    exchange: {
      sent: "{rst} {state}",
      received: "{rst} {state}",
      fields: ["rst", "state", "serial"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["10m"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "ARRL-10",
    rulesUrl: "https://www.arrl.org/10-meter",
    description:
      "Second full weekend of December. 10-meter band only. W/VE sends state/province, DX sends serial number. Great for Technician class operators.",
  },
];

/**
 * Get a contest by ID
 */
export function getContestById(id: string): ContestDefinition | undefined {
  return CONTEST_DATABASE.find((contest) => contest.id === id);
}

/**
 * Get contests by sponsor organization
 */
export function getContestsBySponsor(sponsor: string): ContestDefinition[] {
  const lowerSponsor = sponsor.toLowerCase();
  return CONTEST_DATABASE.filter((contest) =>
    contest.sponsor.toLowerCase().includes(lowerSponsor),
  );
}

/**
 * Get contests that run in a specific month
 */
export function getContestsByMonth(month: number): ContestDefinition[] {
  return CONTEST_DATABASE.filter((contest) => contest.months.includes(month));
}

/**
 * Get contests by mode
 */
export function getContestsByMode(
  mode: "cw" | "ssb" | "rtty" | "digital" | "mixed",
): ContestDefinition[] {
  return CONTEST_DATABASE.filter((contest) =>
    contest.categories.mode.includes(mode),
  );
}

/**
 * Search contests by name or description
 */
export function searchContests(query: string): ContestDefinition[] {
  const lower = query.toLowerCase();
  return CONTEST_DATABASE.filter(
    (contest) =>
      contest.name.toLowerCase().includes(lower) ||
      contest.sponsor.toLowerCase().includes(lower) ||
      (contest.description || "").toLowerCase().includes(lower) ||
      contest.cabrilloId.toLowerCase().includes(lower),
  );
}

/**
 * Get all unique sponsors
 */
export function getSponsors(): string[] {
  const sponsors = new Set<string>();
  for (const contest of CONTEST_DATABASE) {
    sponsors.add(contest.sponsor);
  }
  return Array.from(sponsors).sort();
}

/**
 * Get contests grouped by sponsor
 */
export function getContestsByGroup(): Record<string, ContestDefinition[]> {
  const grouped: Record<string, ContestDefinition[]> = {};
  for (const contest of CONTEST_DATABASE) {
    if (!grouped[contest.sponsor]) {
      grouped[contest.sponsor] = [];
    }
    grouped[contest.sponsor].push(contest);
  }
  // Sort each group by name
  for (const sponsor in grouped) {
    grouped[sponsor].sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}
