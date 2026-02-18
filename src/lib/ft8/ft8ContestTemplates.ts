/**
 * FT8/FT4 contest templates module.
 *
 * Defines contest-specific exchange formats, message generators, scoring rules,
 * and Cabrillo export metadata for common FT8/FT4 digital contests.
 *
 * Each template encapsulates the full contest logic needed to:
 *   - Generate TX exchange messages
 *   - Parse received contest exchanges
 *   - Score individual QSOs
 *   - Track multipliers
 *   - Compute final contest scores
 */

// ============================================================================
// Types
// ============================================================================

/** Supported FT8 contest IDs */
export type Ft8ContestId =
  | "ARRL-FD" // ARRL Field Day
  | "WW-DIGI" // World Wide Digi DX Contest
  | "FT-ROUNDUP" // ARRL FT Roundup (formerly FT8 Roundup)
  | "CQ-WW-DIGI" // CQ World Wide Digital
  | "ARRL-INTL-DIG" // ARRL International Digital Contest
  | "GENERIC"; // Generic FT8 exchange (standard grid/report)

/** QSO record used for contest scoring */
export interface Ft8ContestQso {
  callsign: string;
  grid?: string;
  band: string;
  mode: "FT8" | "FT4";
  exchange?: string;
  serialSent?: number;
  serialReceived?: number;
  dxcc?: number;
  country?: string;
  cqZone?: number;
  continent?: string;
  /** For Field Day: class and section */
  fieldDayClass?: string;
  fieldDaySection?: string;
}

/** Parameters for generating a contest exchange message */
export interface Ft8ContestExchangeParams {
  myCallsign: string;
  myGrid: string;
  targetCall: string;
  serialNumber?: number;
  /** For Field Day: "2A", "1B", etc. */
  fieldDayClass?: string;
  /** For Field Day: ARRL section code */
  fieldDaySection?: string;
}

/** Parsed exchange from a received message */
export interface Ft8ContestExchange {
  callsign: string;
  grid?: string;
  report?: string;
  serialNumber?: number;
  fieldDayClass?: string;
  fieldDaySection?: string;
}

/** Computed contest score breakdown */
export interface Ft8ContestScore {
  totalQsos: number;
  totalPoints: number;
  uniqueMultipliers: number;
  multiplierList: string[];
  finalScore: number; // points x multipliers
  /** Per-band breakdown */
  bandBreakdown: Record<
    string,
    { qsos: number; points: number; multipliers: number }
  >;
}

/** Contest template definition */
export interface Ft8ContestTemplate {
  id: Ft8ContestId;
  name: string;
  /** Short description */
  description: string;
  /** Exchange format description (e.g. "RST + Serial#" or "Grid + Class + Section") */
  exchangeFormat: string;
  /** Whether serial numbers are used */
  usesSerialNumber: boolean;
  /** Whether grid square is sent */
  usesGrid: boolean;
  /** FT8 message modes supported */
  modes: ("FT8" | "FT4")[];
  /** Scoring function: returns points for a QSO */
  scoreQso: (qso: Ft8ContestQso) => number;
  /** Multiplier function: returns multiplier count for a QSO */
  getMultiplier: (
    qso: Ft8ContestQso,
    workedMultipliers: Set<string>,
  ) => string | null;
  /** Generate the contest exchange message text for TX */
  generateExchange: (params: Ft8ContestExchangeParams) => string;
  /** Parse a received contest exchange from decoded message */
  parseExchange: (message: string) => Ft8ContestExchange | null;
  /** Cabrillo contest name for export */
  cabrilloContestName: string;
  /** Cabrillo exchange format string */
  cabrilloExchangeFormat: string;
}

// ============================================================================
// Regex Patterns
// ============================================================================

/** Standard FT8 callsign pattern (1-2 prefix + digit + 1-3 suffix) */
const CALLSIGN_RE = /[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z]/;

/** 4-character Maidenhead grid locator */
const GRID4_RE = /^[A-R]{2}[0-9]{2}$/;

/** Field Day class: transmitter count + category letter (e.g. "2A", "1B", "15D") */
const FD_CLASS_RE = /^(\d{1,2}[A-F])$/;

/** Signal report in FT8 format: optional R prefix, +/- digits */
const REPORT_RE = /^R?[+-]\d{2}$/;

// ============================================================================
// Helper: Grid field extractor (first 2 chars of a 4-char grid)
// ============================================================================

function gridField(grid: string): string {
  return grid.slice(0, 2).toUpperCase();
}

// ============================================================================
// Contest Template Definitions
// ============================================================================

const arrlFieldDay: Ft8ContestTemplate = {
  id: "ARRL-FD",
  name: "ARRL Field Day",
  description:
    "ARRL Field Day -- exchange Field Day class and ARRL/RAC section",
  exchangeFormat: "Class + Section (e.g. 2A WMA)",
  usesSerialNumber: false,
  usesGrid: false,
  modes: ["FT8", "FT4"],
  cabrilloContestName: "ARRL-FIELD-DAY",
  cabrilloExchangeFormat: "CLASS SECTION",

  scoreQso: (_qso: Ft8ContestQso): number => {
    // Digital QSOs score 2 points each in Field Day
    return 2;
  },

  getMultiplier: (
    _qso: Ft8ContestQso,
    _workedMultipliers: Set<string>,
  ): string | null => {
    // Field Day does not use multipliers (only bonus points, not tracked here)
    return null;
  },

  generateExchange: (params: Ft8ContestExchangeParams): string => {
    const myCall = params.myCallsign.toUpperCase().trim();
    const theirCall = params.targetCall.toUpperCase().trim();
    const fdClass = (params.fieldDayClass ?? "1D").toUpperCase().trim();
    const fdSection = (params.fieldDaySection ?? "").toUpperCase().trim();

    // Field Day uses free-text messages for the exchange
    // Format: "{THEIR_CALL} {MY_CALL} {CLASS} {SECTION}"
    const msg = `${theirCall} ${myCall} ${fdClass} ${fdSection}`;
    // FT8 free-text messages are limited to 13 characters
    return msg.slice(0, 13);
  },

  parseExchange: (message: string): Ft8ContestExchange | null => {
    const parts = message.toUpperCase().trim().split(/\s+/);
    // Expect: CALL1 CALL2 CLASS SECTION (or variations)
    // We need at least a callsign and a class+section

    if (parts.length < 3) return null;

    // Look for Field Day class pattern in the message
    let callsign: string | null = null;
    let fdClass: string | null = null;
    let fdSection: string | null = null;

    for (const part of parts) {
      if (FD_CLASS_RE.test(part) && !fdClass) {
        fdClass = part;
      } else if (CALLSIGN_RE.test(part) && !callsign) {
        // Take the first callsign-like token as the remote station
        callsign = part;
      } else if (
        fdClass &&
        !fdSection &&
        /^[A-Z]{2,5}$/.test(part) &&
        !CALLSIGN_RE.test(part)
      ) {
        // After class is found, a 2-5 letter token is likely the section
        fdSection = part;
      }
    }

    if (!callsign || !fdClass) return null;

    return {
      callsign,
      fieldDayClass: fdClass,
      fieldDaySection: fdSection ?? undefined,
    };
  },
};

const wwDigi: Ft8ContestTemplate = {
  id: "WW-DIGI",
  name: "World Wide Digi DX Contest",
  description: "WW Digi DX Contest -- exchange 4-character grid square",
  exchangeFormat: "Grid (4-char)",
  usesSerialNumber: false,
  usesGrid: true,
  modes: ["FT8", "FT4"],
  cabrilloContestName: "WW-DIGI",
  cabrilloExchangeFormat: "GRID",

  scoreQso: (qso: Ft8ContestQso): number => {
    // 1 point same continent, 3 points different continent
    if (!qso.continent) return 1;
    // Without knowing the operator's continent we default to 1;
    // callers should compare continents externally when available
    return 3;
  },

  getMultiplier: (
    qso: Ft8ContestQso,
    workedMultipliers: Set<string>,
  ): string | null => {
    // Multipliers: DXCC entities + grid fields (first 2 chars of grid)
    const mults: string[] = [];

    if (qso.dxcc != null) {
      const dxccKey = `DXCC:${qso.dxcc}`;
      if (!workedMultipliers.has(dxccKey)) {
        mults.push(dxccKey);
      }
    }

    if (qso.grid && GRID4_RE.test(qso.grid.toUpperCase())) {
      const gf = gridField(qso.grid);
      const gridKey = `GRID:${gf}`;
      if (!workedMultipliers.has(gridKey)) {
        mults.push(gridKey);
      }
    }

    return mults.length > 0 ? mults[0] : null;
  },

  generateExchange: (params: Ft8ContestExchangeParams): string => {
    // Standard FT8 grid exchange: "{MY_CALL} {THEIR_CALL} {GRID}"
    const myCall = params.myCallsign.toUpperCase().trim();
    const theirCall = params.targetCall.toUpperCase().trim();
    const grid = params.myGrid.toUpperCase().trim().slice(0, 4);
    return `${myCall} ${theirCall} ${grid}`;
  },

  parseExchange: (message: string): Ft8ContestExchange | null => {
    const parts = message.toUpperCase().trim().split(/\s+/);
    if (parts.length < 2) return null;

    let callsign: string | null = null;
    let grid: string | null = null;
    let report: string | null = null;

    for (const part of parts) {
      if (part === "CQ" || part === "73" || part === "RR73" || part === "RRR") {
        continue;
      }
      if (!grid && GRID4_RE.test(part)) {
        grid = part;
      } else if (!report && REPORT_RE.test(part)) {
        report = part;
      } else if (!callsign && CALLSIGN_RE.test(part)) {
        callsign = part;
      }
    }

    if (!callsign) return null;

    return {
      callsign,
      grid: grid ?? undefined,
      report: report ?? undefined,
    };
  },
};

const ftRoundup: Ft8ContestTemplate = {
  id: "FT-ROUNDUP",
  name: "ARRL FT Roundup",
  description:
    "ARRL FT Roundup (formerly FT8 Roundup) -- exchange 4-character grid square",
  exchangeFormat: "Grid (4-char)",
  usesSerialNumber: false,
  usesGrid: true,
  modes: ["FT8", "FT4"],
  cabrilloContestName: "ARRL-FT-ROUNDUP",
  cabrilloExchangeFormat: "GRID",

  scoreQso: (_qso: Ft8ContestQso): number => {
    // 1 point per QSO
    return 1;
  },

  getMultiplier: (
    qso: Ft8ContestQso,
    workedMultipliers: Set<string>,
  ): string | null => {
    // Multipliers: US states/Canadian provinces + DXCC entities
    if (qso.dxcc != null) {
      const dxccKey = `DXCC:${qso.dxcc}`;
      if (!workedMultipliers.has(dxccKey)) {
        return dxccKey;
      }
    }

    // State/province multipliers would be derived from callsign lookup;
    // if grid is in the US/Canada, the state/province is determined externally
    return null;
  },

  generateExchange: (params: Ft8ContestExchangeParams): string => {
    const myCall = params.myCallsign.toUpperCase().trim();
    const theirCall = params.targetCall.toUpperCase().trim();
    const grid = params.myGrid.toUpperCase().trim().slice(0, 4);
    return `${myCall} ${theirCall} ${grid}`;
  },

  parseExchange: (message: string): Ft8ContestExchange | null => {
    const parts = message.toUpperCase().trim().split(/\s+/);
    if (parts.length < 2) return null;

    let callsign: string | null = null;
    let grid: string | null = null;
    let report: string | null = null;

    for (const part of parts) {
      if (part === "CQ" || part === "73" || part === "RR73" || part === "RRR") {
        continue;
      }
      if (!grid && GRID4_RE.test(part)) {
        grid = part;
      } else if (!report && REPORT_RE.test(part)) {
        report = part;
      } else if (!callsign && CALLSIGN_RE.test(part)) {
        callsign = part;
      }
    }

    if (!callsign) return null;

    return {
      callsign,
      grid: grid ?? undefined,
      report: report ?? undefined,
    };
  },
};

const cqWwDigi: Ft8ContestTemplate = {
  id: "CQ-WW-DIGI",
  name: "CQ World Wide Digital",
  description: "CQ WW Digital Contest -- exchange 4-character grid square",
  exchangeFormat: "Grid (4-char)",
  usesSerialNumber: false,
  usesGrid: true,
  modes: ["FT8", "FT4"],
  cabrilloContestName: "CQ-WW-DIGI",
  cabrilloExchangeFormat: "GRID",

  scoreQso: (qso: Ft8ContestQso): number => {
    // 1 point same country, 2 points same continent, 4 points different continent
    // Without operator context we use continent as the primary discriminator:
    //   - If no continent data, default to 1 point (same country assumed)
    //   - If continent matches operator's continent, return 2
    //   - If different continent, return 4
    // NOTE: "same country" detection requires DXCC comparison with operator's entity,
    // which should be done by the caller. We default conservatively.
    if (!qso.continent) return 1;
    // Without operator context, score as different continent (most common in contest)
    return 4;
  },

  getMultiplier: (
    qso: Ft8ContestQso,
    workedMultipliers: Set<string>,
  ): string | null => {
    // Multipliers: DXCC entities per band + CQ zones per band
    const band = qso.band.toUpperCase();

    if (qso.dxcc != null) {
      const dxccKey = `DXCC:${qso.dxcc}:${band}`;
      if (!workedMultipliers.has(dxccKey)) {
        return dxccKey;
      }
    }

    if (qso.cqZone != null) {
      const zoneKey = `CQZ:${qso.cqZone}:${band}`;
      if (!workedMultipliers.has(zoneKey)) {
        return zoneKey;
      }
    }

    return null;
  },

  generateExchange: (params: Ft8ContestExchangeParams): string => {
    const myCall = params.myCallsign.toUpperCase().trim();
    const theirCall = params.targetCall.toUpperCase().trim();
    const grid = params.myGrid.toUpperCase().trim().slice(0, 4);
    return `${myCall} ${theirCall} ${grid}`;
  },

  parseExchange: (message: string): Ft8ContestExchange | null => {
    const parts = message.toUpperCase().trim().split(/\s+/);
    if (parts.length < 2) return null;

    let callsign: string | null = null;
    let grid: string | null = null;
    let report: string | null = null;

    for (const part of parts) {
      if (part === "CQ" || part === "73" || part === "RR73" || part === "RRR") {
        continue;
      }
      if (!grid && GRID4_RE.test(part)) {
        grid = part;
      } else if (!report && REPORT_RE.test(part)) {
        report = part;
      } else if (!callsign && CALLSIGN_RE.test(part)) {
        callsign = part;
      }
    }

    if (!callsign) return null;

    return {
      callsign,
      grid: grid ?? undefined,
      report: report ?? undefined,
    };
  },
};

const arrlIntlDig: Ft8ContestTemplate = {
  id: "ARRL-INTL-DIG",
  name: "ARRL International Digital Contest",
  description:
    "ARRL International Digital Contest -- exchange 4-character grid square",
  exchangeFormat: "Grid (4-char)",
  usesSerialNumber: false,
  usesGrid: true,
  modes: ["FT8", "FT4"],
  cabrilloContestName: "ARRL-DIGI",
  cabrilloExchangeFormat: "GRID",

  scoreQso: (_qso: Ft8ContestQso): number => {
    // 1 point per QSO
    return 1;
  },

  getMultiplier: (
    qso: Ft8ContestQso,
    workedMultipliers: Set<string>,
  ): string | null => {
    // Multipliers: DXCC entities + Canadian provinces
    if (qso.dxcc != null) {
      const dxccKey = `DXCC:${qso.dxcc}`;
      if (!workedMultipliers.has(dxccKey)) {
        return dxccKey;
      }
    }

    // Canadian province multipliers are derived from callsign prefix lookup;
    // when available the caller should populate a province field
    return null;
  },

  generateExchange: (params: Ft8ContestExchangeParams): string => {
    const myCall = params.myCallsign.toUpperCase().trim();
    const theirCall = params.targetCall.toUpperCase().trim();
    const grid = params.myGrid.toUpperCase().trim().slice(0, 4);
    return `${myCall} ${theirCall} ${grid}`;
  },

  parseExchange: (message: string): Ft8ContestExchange | null => {
    const parts = message.toUpperCase().trim().split(/\s+/);
    if (parts.length < 2) return null;

    let callsign: string | null = null;
    let grid: string | null = null;
    let report: string | null = null;

    for (const part of parts) {
      if (part === "CQ" || part === "73" || part === "RR73" || part === "RRR") {
        continue;
      }
      if (!grid && GRID4_RE.test(part)) {
        grid = part;
      } else if (!report && REPORT_RE.test(part)) {
        report = part;
      } else if (!callsign && CALLSIGN_RE.test(part)) {
        callsign = part;
      }
    }

    if (!callsign) return null;

    return {
      callsign,
      grid: grid ?? undefined,
      report: report ?? undefined,
    };
  },
};

const generic: Ft8ContestTemplate = {
  id: "GENERIC",
  name: "Generic FT8 Exchange",
  description:
    "Standard FT8 exchange with grid square and signal report -- no contest rules",
  exchangeFormat: "Grid + Report (standard FT8)",
  usesSerialNumber: false,
  usesGrid: true,
  modes: ["FT8", "FT4"],
  cabrilloContestName: "GENERIC",
  cabrilloExchangeFormat: "GRID",

  scoreQso: (_qso: Ft8ContestQso): number => {
    // 1 point per QSO, no special scoring
    return 1;
  },

  getMultiplier: (
    _qso: Ft8ContestQso,
    _workedMultipliers: Set<string>,
  ): string | null => {
    // No multipliers for generic mode
    return null;
  },

  generateExchange: (params: Ft8ContestExchangeParams): string => {
    const myCall = params.myCallsign.toUpperCase().trim();
    const theirCall = params.targetCall.toUpperCase().trim();
    const grid = params.myGrid.toUpperCase().trim().slice(0, 4);
    return `${myCall} ${theirCall} ${grid}`;
  },

  parseExchange: (message: string): Ft8ContestExchange | null => {
    const parts = message.toUpperCase().trim().split(/\s+/);
    if (parts.length < 2) return null;

    let callsign: string | null = null;
    let grid: string | null = null;
    let report: string | null = null;

    for (const part of parts) {
      if (part === "CQ" || part === "73" || part === "RR73" || part === "RRR") {
        continue;
      }
      if (!grid && GRID4_RE.test(part)) {
        grid = part;
      } else if (!report && REPORT_RE.test(part)) {
        report = part;
      } else if (!callsign && CALLSIGN_RE.test(part)) {
        callsign = part;
      }
    }

    if (!callsign) return null;

    return {
      callsign,
      grid: grid ?? undefined,
      report: report ?? undefined,
    };
  },
};

// ============================================================================
// Template Registry
// ============================================================================

const TEMPLATES: readonly Ft8ContestTemplate[] = [
  arrlFieldDay,
  wwDigi,
  ftRoundup,
  cqWwDigi,
  arrlIntlDig,
  generic,
] as const;

const TEMPLATE_MAP = new Map<Ft8ContestId, Ft8ContestTemplate>(
  TEMPLATES.map((t) => [t.id, t]),
);

// ============================================================================
// Public API
// ============================================================================

/** Get all available contest templates. */
export function getContestTemplates(): Ft8ContestTemplate[] {
  return [...TEMPLATES];
}

/** Get a specific contest template by ID. */
export function getContestTemplate(
  id: Ft8ContestId,
): Ft8ContestTemplate | undefined {
  return TEMPLATE_MAP.get(id);
}

/**
 * Compute total contest score (QSO points x multipliers).
 *
 * Iterates all QSOs, scores each using the template's `scoreQso` function,
 * tracks unique multipliers via `getMultiplier`, and produces per-band
 * breakdowns and the final combined score.
 */
export function computeContestScore(
  qsos: Ft8ContestQso[],
  template: Ft8ContestTemplate,
): Ft8ContestScore {
  const workedMultipliers = new Set<string>();
  let totalPoints = 0;

  const bandBreakdown: Record<
    string,
    { qsos: number; points: number; multipliers: number }
  > = {};

  for (const qso of qsos) {
    const band = qso.band.toUpperCase();

    // Ensure band entry exists
    if (!bandBreakdown[band]) {
      bandBreakdown[band] = { qsos: 0, points: 0, multipliers: 0 };
    }

    // Score the QSO
    const points = template.scoreQso(qso);
    totalPoints += points;
    bandBreakdown[band].qsos += 1;
    bandBreakdown[band].points += points;

    // Check for new multiplier
    const mult = template.getMultiplier(qso, workedMultipliers);
    if (mult) {
      workedMultipliers.add(mult);
      bandBreakdown[band].multipliers += 1;
    }
  }

  const uniqueMultipliers = workedMultipliers.size;
  const multiplierList = Array.from(workedMultipliers).sort();

  // Final score: points x multipliers
  // For contests with no multipliers (Field Day, Generic), final = total points
  const finalScore =
    uniqueMultipliers > 0 ? totalPoints * uniqueMultipliers : totalPoints;

  return {
    totalQsos: qsos.length,
    totalPoints,
    uniqueMultipliers,
    multiplierList,
    finalScore,
    bandBreakdown,
  };
}
