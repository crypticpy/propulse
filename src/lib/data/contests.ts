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
    offTimeRules: {
      maxOperatingHours: 42,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 60,
    },
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
    offTimeRules: {
      maxOperatingHours: 42,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 60,
    },
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
    offTimeRules: {
      maxOperatingHours: 24,
      contestDurationHours: 30,
      minOffTimePeriodMinutes: 30,
    },
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
    offTimeRules: {
      maxOperatingHours: 24,
      contestDurationHours: 30,
      minOffTimePeriodMinutes: 30,
    },
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

  // ============ WAE CONTESTS ============

  /**
   * WAE DX Contest - CW
   * Worked All Europe, unique QTC system
   * https://www.darc.de/der-club/referate/conteste/wae-dx-contest/en/
   */
  {
    id: "wae-dx-cw",
    name: "WAE DX Contest - CW",
    sponsor: "DARC",
    months: [8],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
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
    cabrilloId: "WAE-CW",
    rulesUrl:
      "https://www.darc.de/der-club/referate/conteste/wae-dx-contest/en/",
    description:
      "Worked All Europe DX Contest. EU stations can send QTCs (batches of 10 previously logged QSOs) to non-EU stations for bonus points.",
    offTimeRules: {
      maxOperatingHours: 36,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 60,
    },
  },

  /**
   * WAE DX Contest - SSB
   * Worked All Europe, unique QTC system
   * https://www.darc.de/der-club/referate/conteste/wae-dx-contest/en/
   */
  {
    id: "wae-dx-ssb",
    name: "WAE DX Contest - SSB",
    sponsor: "DARC",
    months: [9],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
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
    cabrilloId: "WAE-SSB",
    rulesUrl:
      "https://www.darc.de/der-club/referate/conteste/wae-dx-contest/en/",
    description:
      "Worked All Europe DX Contest. EU stations can send QTCs (batches of 10 previously logged QSOs) to non-EU stations for bonus points.",
    offTimeRules: {
      maxOperatingHours: 36,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 60,
    },
  },

  // ============ JIDX CONTESTS ============

  /**
   * JIDX CW Contest
   * Japan International DX Contest
   * https://jidx.org/
   */
  {
    id: "jidx-cw",
    name: "JIDX CW Contest",
    sponsor: "JIDX Committee",
    months: [4],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
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
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low"],
      mode: ["cw"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "JIDX-CW",
    rulesUrl: "https://jidx.org/",
    description:
      "Japan International DX Contest. JA stations work the world, DX works JA. DXCC countries per band are multipliers.",
    offTimeRules: {
      maxOperatingHours: 36,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 30,
    },
  },

  /**
   * JIDX SSB Contest
   * Japan International DX Contest
   * https://jidx.org/
   */
  {
    id: "jidx-ssb",
    name: "JIDX SSB Contest",
    sponsor: "JIDX Committee",
    months: [11],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
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
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low"],
      mode: ["ssb"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "JIDX-SSB",
    rulesUrl: "https://jidx.org/",
    description:
      "Japan International DX Contest. JA stations work the world, DX works JA. DXCC countries per band are multipliers.",
    offTimeRules: {
      maxOperatingHours: 36,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 30,
    },
  },

  // ============ ALL ASIAN DX CONTESTS ============

  /**
   * All Asian DX Contest - CW
   * Asian stations work the world
   * https://www.jarl.org/English/4_Library/A-4-3_Contests/all_asian.htm
   */
  {
    id: "all-asian-dx-cw",
    name: "All Asian DX Contest - CW",
    sponsor: "JARL",
    months: [6],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 1,
      diffContinent: 3,
      sameCountry: 0,
    },
    exchange: {
      sent: "{rst} {age}",
      received: "{rst} {age}",
      fields: ["rst", "age"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "ALL-ASIAN-CW",
    rulesUrl:
      "https://www.jarl.org/English/4_Library/A-4-3_Contests/all_asian.htm",
    description:
      "All Asian DX Contest. Asian stations work non-Asian; non-Asian works Asian. Exchange RST + operator age (00 for club/multi-op).",
    offTimeRules: {
      maxOperatingHours: 36,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 30,
    },
  },

  /**
   * All Asian DX Contest - SSB
   * Asian stations work the world
   * https://www.jarl.org/English/4_Library/A-4-3_Contests/all_asian.htm
   */
  {
    id: "all-asian-dx-ssb",
    name: "All Asian DX Contest - SSB",
    sponsor: "JARL",
    months: [9],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 1,
      diffContinent: 3,
      sameCountry: 0,
    },
    exchange: {
      sent: "{rst} {age}",
      received: "{rst} {age}",
      fields: ["rst", "age"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["ssb"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "ALL-ASIAN-SSB",
    rulesUrl:
      "https://www.jarl.org/English/4_Library/A-4-3_Contests/all_asian.htm",
    description:
      "All Asian DX Contest. Asian stations work non-Asian; non-Asian works Asian. Exchange RST + operator age (00 for club/multi-op).",
    offTimeRules: {
      maxOperatingHours: 36,
      contestDurationHours: 48,
      minOffTimePeriodMinutes: 30,
    },
  },

  // ============ OCEANIA DX CONTESTS ============

  /**
   * Oceania DX Contest - CW
   * https://www.oceaniadxcontest.com/
   */
  {
    id: "oceania-dx-cw",
    name: "Oceania DX Contest - CW",
    sponsor: "WIA/NZART",
    months: [10],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
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
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "OCEANIA-DX-CW",
    rulesUrl: "https://www.oceaniadxcontest.com/",
    description:
      "Oceania DX Contest. OC stations work the world, rest of world works OC. Exchange RST + serial number.",
  },

  /**
   * Oceania DX Contest - SSB
   * https://www.oceaniadxcontest.com/
   */
  {
    id: "oceania-dx-ssb",
    name: "Oceania DX Contest - SSB",
    sponsor: "WIA/NZART",
    months: [10],
    durationHours: 48,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
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
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "160m", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low", "qrp"],
      mode: ["ssb"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "OCEANIA-DX-SSB",
    rulesUrl: "https://www.oceaniadxcontest.com/",
    description:
      "Oceania DX Contest. OC stations work the world, rest of world works OC. Exchange RST + serial number.",
  },

  // ============ IOTA CONTEST ============

  /**
   * RSGB IOTA Contest
   * Islands On The Air
   * https://www.rsgbcc.org/hf/rules/2024/riota.shtml
   */
  {
    id: "rsgb-iota",
    name: "RSGB IOTA Contest",
    sponsor: "RSGB",
    months: [7],
    durationHours: 24,
    multiplierRules: [{ type: "DXCC", source: "callsign", perBand: true }],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "DXCC",
    multiplierPerBand: true,
    scoring: {
      mode: "zone",
      sameContinent: 3,
      diffContinent: 5,
      sameCountry: 3,
    },
    exchange: {
      sent: "{rst} {serial} {island_ref}",
      received: "{rst} {serial} {island_ref}",
      fields: ["rst", "serial", "island_ref"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single", "80m", "40m", "20m", "15m", "10m"],
      power: ["high", "low"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["assisted", "non-assisted"],
    },
    cabrilloId: "RSGB-IOTA",
    rulesUrl: "https://www.rsgbcc.org/hf/rules/2024/riota.shtml",
    description:
      "RSGB Islands On The Air Contest. Work island and non-island stations. Island stations send RS(T) + serial + IOTA reference (e.g., EU-005).",
  },

  // ============ STEW PERRY TOP BAND ============

  /**
   * Stew Perry Topband Distance Challenge
   * Distance-based scoring on 160m
   * https://www.kkn.net/stew/
   */
  {
    id: "stew-perry-tb",
    name: "Stew Perry Topband Distance Challenge",
    sponsor: "Boring ARC",
    months: [12],
    durationHours: 14,
    multiplierRules: [],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "distance_based",
    multiplierType: "NONE",
    multiplierPerBand: false,
    scoring: {
      mode: "distance",
    },
    exchange: {
      sent: "{grid}",
      received: "{grid}",
      fields: ["grid"],
    },
    categories: {
      operator: ["single-op", "checklog"],
      band: ["160m"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "STEW-PERRY",
    rulesUrl: "https://www.kkn.net/stew/",
    description:
      "160m CW contest with distance-based scoring. Exchange 4-character Maidenhead grid square. Points = ceil(distance_km / 500). QRP stations earn 4x points.",
  },

  // ============ NA SPRINT CONTESTS ============

  /**
   * North American Sprint - CW
   * Fast-paced sprint format
   * https://www.ncjweb.com/Sprint-Rules.php
   */
  {
    id: "na-sprint-cw",
    name: "North American Sprint Contest - CW",
    sponsor: "NCJ",
    months: [2, 9],
    durationHours: 4,
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 1,
    },
    exchange: {
      sent: "{serial} {name} {state}",
      received: "{serial} {name} {state}",
      fields: ["serial", "name", "state"],
    },
    categories: {
      operator: ["single-op", "checklog"],
      band: ["all"],
      power: ["high", "low", "qrp"],
      mode: ["cw"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "NA-SPRINT-CW",
    rulesUrl: "https://www.ncjweb.com/Sprint-Rules.php",
    description:
      "4-hour sprint format contest. Exchange serial number, operator name, and state/province/country. Must QSY after each contact when running.",
  },

  /**
   * North American Sprint - SSB
   * Fast-paced sprint format
   * https://www.ncjweb.com/Sprint-Rules.php
   */
  {
    id: "na-sprint-ssb",
    name: "North American Sprint Contest - SSB",
    sponsor: "NCJ",
    months: [3, 9],
    durationHours: 4,
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
    multiplierType: "STATE",
    multiplierPerBand: false,
    scoring: {
      mode: "fixed",
      fixedPoints: 1,
    },
    exchange: {
      sent: "{serial} {name} {state}",
      received: "{serial} {name} {state}",
      fields: ["serial", "name", "state"],
    },
    categories: {
      operator: ["single-op", "checklog"],
      band: ["all"],
      power: ["high", "low", "qrp"],
      mode: ["ssb"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "NA-SPRINT-SSB",
    rulesUrl: "https://www.ncjweb.com/Sprint-Rules.php",
    description:
      "4-hour sprint format contest. Exchange serial number, operator name, and state/province/country. Must QSY after each contact when running.",
  },

  // ============ NAQP RTTY ============

  /**
   * North American QSO Party - RTTY
   * https://www.ncjweb.com/naqp/
   */
  {
    id: "naqp-rtty",
    name: "North American QSO Party - RTTY",
    sponsor: "NCJ",
    months: [2, 7],
    durationHours: 12,
    multiplierRules: [{ type: "STATE", source: "exchange", perBand: false }],
    dupeRule: { perBand: false, perMode: false },
    scoreModel: "points_x_mults_total",
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
      mode: ["rtty"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "NAQP-RTTY",
    rulesUrl: "https://www.ncjweb.com/naqp/",
    description:
      "RTTY version of the NAQP. 12-hour contest. Exchange name and state/province/country. 100W power limit.",
  },

  // ============ CQ WW VHF ============

  /**
   * CQ World Wide VHF Contest
   * https://www.cqww-vhf.com/
   */
  {
    id: "cqww-vhf",
    name: "CQ World Wide VHF Contest",
    sponsor: "CQ Magazine",
    months: [7],
    durationHours: 27,
    multiplierRules: [
      { type: "GRID_SQUARE", source: "exchange", perBand: true },
    ],
    dupeRule: { perBand: true, perMode: false },
    scoreModel: "points_x_mults_per_band",
    multiplierType: "GRID_SQUARE",
    multiplierPerBand: true,
    scoring: {
      mode: "distance",
    },
    exchange: {
      sent: "{grid}",
      received: "{grid}",
      fields: ["grid"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "6m"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "CQ-WW-VHF",
    rulesUrl: "https://www.cqww-vhf.com/",
    description:
      "Third full weekend of July. VHF contest on 6m and 2m. Exchange 4-character Maidenhead grid square. Grid squares are multipliers.",
  },

  // ============ STATE QSO PARTIES ============

  /**
   * California QSO Party
   * https://www.cqp.org/
   */
  {
    id: "ca-qso-party",
    name: "California QSO Party",
    sponsor: "NCCC",
    months: [10],
    durationHours: 30,
    multiplierRules: [{ type: "COUNTY", source: "exchange", perBand: false }],
    dupeRule: { perBand: true, perMode: true },
    scoreModel: "points_x_mults_total",
    multiplierType: "COUNTY",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 3,
      ssbPoints: 2,
    },
    exchange: {
      sent: "{serial} {county}",
      received: "{serial} {county}",
      fields: ["serial", "county"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "CA-QSO-PARTY",
    rulesUrl: "https://www.cqp.org/",
    stateQsoParty: "CA",
    description:
      "California QSO Party. CA stations send serial + county abbreviation. Non-CA stations send serial + state/province/DX. 58 California counties are multipliers.",
  },

  /**
   * Texas QSO Party
   * https://www.txqp.net/
   */
  {
    id: "tx-qso-party",
    name: "Texas QSO Party",
    sponsor: "TDXS",
    months: [9],
    durationHours: 30,
    multiplierRules: [{ type: "COUNTY", source: "exchange", perBand: false }],
    dupeRule: { perBand: true, perMode: true },
    scoreModel: "points_x_mults_total",
    multiplierType: "COUNTY",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 3,
      ssbPoints: 2,
    },
    exchange: {
      sent: "{rst} {county}",
      received: "{rst} {county}",
      fields: ["rst", "county"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "TX-QSO-PARTY",
    rulesUrl: "https://www.txqp.net/",
    stateQsoParty: "TX",
    description:
      "Texas QSO Party. TX stations send RST + county abbreviation. Non-TX stations send RST + state/province/DX. 254 Texas counties are multipliers.",
  },

  /**
   * Pennsylvania QSO Party
   * https://paqso.org/
   */
  {
    id: "pa-qso-party",
    name: "Pennsylvania QSO Party",
    sponsor: "NARC",
    months: [10],
    durationHours: 24,
    multiplierRules: [{ type: "COUNTY", source: "exchange", perBand: false }],
    dupeRule: { perBand: true, perMode: true },
    scoreModel: "points_x_mults_total",
    multiplierType: "COUNTY",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 2,
      ssbPoints: 1,
      digitalPoints: 2,
    },
    exchange: {
      sent: "{serial} {county}",
      received: "{serial} {county}",
      fields: ["serial", "county"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed", "digital"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "PA-QSO-PARTY",
    rulesUrl: "https://paqso.org/",
    stateQsoParty: "PA",
    description:
      "Pennsylvania QSO Party. PA stations send serial + county. Non-PA stations send serial + state/province/DX. 67 Pennsylvania counties are multipliers.",
  },

  /**
   * Florida QSO Party
   * https://floridaqsoparty.org/
   */
  {
    id: "fl-qso-party",
    name: "Florida QSO Party",
    sponsor: "FCA",
    months: [4],
    durationHours: 20,
    multiplierRules: [{ type: "COUNTY", source: "exchange", perBand: false }],
    dupeRule: { perBand: true, perMode: true },
    scoreModel: "points_x_mults_total",
    multiplierType: "COUNTY",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 2,
      ssbPoints: 1,
      digitalPoints: 3,
    },
    exchange: {
      sent: "{rst} {county}",
      received: "{rst} {county}",
      fields: ["rst", "county"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed", "digital"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "FL-QSO-PARTY",
    rulesUrl: "https://floridaqsoparty.org/",
    stateQsoParty: "FL",
    description:
      "Florida QSO Party. FL stations send RST + county. Non-FL stations send RST + state/province/DX. 67 Florida counties are multipliers.",
  },

  /**
   * Ohio QSO Party
   * https://ohqp.org/
   */
  {
    id: "oh-qso-party",
    name: "Ohio QSO Party",
    sponsor: "OH QSO Party Committee",
    months: [8],
    durationHours: 12,
    multiplierRules: [{ type: "COUNTY", source: "exchange", perBand: false }],
    dupeRule: { perBand: true, perMode: true },
    scoreModel: "points_x_mults_total",
    multiplierType: "COUNTY",
    multiplierPerBand: false,
    scoring: {
      mode: "mixed",
      cwPoints: 2,
      ssbPoints: 1,
    },
    exchange: {
      sent: "{serial} {county}",
      received: "{serial} {county}",
      fields: ["serial", "county"],
    },
    categories: {
      operator: ["single-op", "multi-op", "checklog"],
      band: ["all", "single"],
      power: ["high", "low", "qrp"],
      mode: ["cw", "ssb", "mixed"],
      assisted: ["non-assisted"],
    },
    cabrilloId: "OH-QSO-PARTY",
    rulesUrl: "https://ohqp.org/",
    stateQsoParty: "OH",
    description:
      "Ohio QSO Party. OH stations send serial + county. Non-OH stations send serial + state/province/DX. 88 Ohio counties are multipliers.",
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
