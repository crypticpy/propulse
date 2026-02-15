/**
 * Contest Terminology Glossary
 *
 * A beginner-friendly reference of common ham radio contesting terms.
 * Used by GlossaryTooltip to provide inline definitions throughout
 * the Contest Explorer and contest session pages.
 *
 * @module lib/data/contestGlossary
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlossaryEntry {
  /** The term itself, properly capitalized */
  term: string;
  /** Plain-language definition — keep it beginner-friendly */
  definition: string;
  /** Optional usage example */
  example?: string;
}

// ---------------------------------------------------------------------------
// Glossary Data
// ---------------------------------------------------------------------------

/**
 * 25+ contest terms with beginner-friendly definitions.
 * Keys are lowercase/kebab for easy lookup.
 */
export const CONTEST_GLOSSARY: Record<string, GlossaryEntry> = {
  "cq-zone": {
    term: "CQ Zone",
    definition:
      "One of 40 geographic zones defined by CQ Magazine that divide the world for contest scoring. Each zone you contact counts as a multiplier.",
    example: "North America spans CQ zones 3, 4, and 5.",
  },
  "itu-zone": {
    term: "ITU Zone",
    definition:
      "One of 90 geographic zones defined by the International Telecommunication Union. Used as multipliers in the IARU HF Championship and other contests.",
    example: "The continental US covers ITU zones 6 through 8.",
  },
  exchange: {
    term: "Exchange",
    definition:
      "The information you swap with the other station during a contest contact. Every contest defines what must be exchanged. Getting it right is essential for a valid QSO.",
    example:
      "In CQ WW, you exchange a signal report (RST) and your CQ zone number, like '59 05'.",
  },
  multiplier: {
    term: "Multiplier (Mult)",
    definition:
      "A bonus factor that increases your final score. Multipliers are typically unique countries, zones, states, or prefixes you work. Your final score is usually QSO points times multipliers.",
    example:
      "Working a new DXCC country on 20m gives you a new multiplier on that band.",
  },
  rate: {
    term: "Rate",
    definition:
      "The number of QSOs you make per hour. Competitive contesters track their rate closely. Higher rates mean more points. Rates above 100/hour are considered excellent.",
    example:
      "During the first hour of CQ WW SSB, top stations can exceed 200 QSOs/hour.",
  },
  run: {
    term: "Run (Running)",
    definition:
      "Calling CQ repeatedly on a single frequency and working stations that answer you. Running is the fastest way to make QSOs if you can hold a frequency.",
    example:
      "A station running on 14.250 MHz calls 'CQ Contest' and logs each reply.",
  },
  "search-and-pounce": {
    term: "Search & Pounce (S&P)",
    definition:
      "Tuning across the band looking for stations to work, instead of calling CQ yourself. A great strategy when you cannot hold a run frequency or need specific multipliers.",
    example: "S&P across 20m to pick up new countries you haven't worked yet.",
  },
  qsy: {
    term: "QSY",
    definition:
      "To change frequency. In sprint-style contests, the caller must QSY after each contact. Also used when you move to a new band.",
    example:
      "After working a station on 40m, you QSY to 20m to catch the opening.",
  },
  qrm: {
    term: "QRM",
    definition:
      "Man-made interference from other stations on or near your frequency. During big contests, QRM can be intense, especially on popular bands.",
    example:
      "There is heavy QRM on 14.195 because two stations are calling CQ close together.",
  },
  pileup: {
    term: "Pileup",
    definition:
      "When many stations call you at the same time. If you are a rare multiplier (like a new country), you will attract a pileup. Managing pileups is a key contest skill.",
    example: "A station in a rare zone can generate a pileup of 50+ callers.",
  },
  split: {
    term: "Split",
    definition:
      "Transmitting on one frequency and listening on another. Used by DX stations to manage large pileups. You listen 'up' (or 'down') from their transmit frequency.",
    example:
      "The DX station says 'listening up 5' meaning they listen 5 kHz above their transmit frequency.",
  },
  rst: {
    term: "RST",
    definition:
      "Readability-Strength-Tone signal report. Phone (SSB) uses RS (two digits, like '59'). CW and digital use RST (three digits, like '599'). In contests, most people just send '59' or '599'.",
    example:
      "A perfect signal report on CW is '599' (readable, strong, pure tone).",
  },
  "serial-number": {
    term: "Serial Number",
    definition:
      "A sequential number included in your exchange. Each new QSO gets the next number. Your first contact is 001, second is 002, and so on.",
    example:
      "If you have made 47 QSOs, your next serial number to send is 048.",
  },
  section: {
    term: "Section (ARRL/RAC)",
    definition:
      "One of 84 geographic sections defined by ARRL and RAC for domestic contests. Sections are states, parts of states, or Canadian provinces/territories.",
    example:
      "California has multiple sections: SCV, LAX, SDG, SJV, SF, EB, SV, ORG.",
  },
  "grid-square": {
    term: "Grid Square",
    definition:
      "A 4-character Maidenhead locator (like 'FN31') that identifies your geographic location. Used as the exchange in VHF contests and some HF contests like the Stew Perry.",
    example: "New York City is in grid square FN30.",
  },
  zone: {
    term: "Zone",
    definition:
      "A numbered geographic area used for multiplier counting. Can refer to either CQ zones (1-40) or ITU zones (1-90), depending on the contest rules.",
  },
  entity: {
    term: "Entity (DXCC)",
    definition:
      "A 'country' as defined by the DXCC program. There are currently about 340 entities. Each new entity worked counts as a multiplier in many contests.",
    example:
      "Hawaii (KH6) and Alaska (KL7) are separate DXCC entities from the continental US.",
  },
  checklog: {
    term: "Checklog",
    definition:
      "A log submitted only to help verify other stations' contacts, not to compete for a score. Submitting a checklog is a great way to participate without the pressure of competing.",
    example:
      "If you only make a few contacts, submit your log as a checklog to help the contest community.",
  },
  dupe: {
    term: "Dupe (Duplicate)",
    definition:
      "A duplicate contact with a station you have already worked on the same band (and mode, if applicable). Dupes earn zero points but are NOT penalized — just log them and move on.",
    example:
      "If you already worked W1AW on 20m CW, working them again on 20m CW is a dupe.",
  },
  "off-time": {
    term: "Off-Time",
    definition:
      "Required rest periods in contests that limit operating hours. For example, ARRL Sweepstakes allows 24 hours of operating in a 30-hour window, so you must take at least 6 hours off.",
    example:
      "Plan your off-time during low-rate periods (like 0800-1200 UTC in a domestic contest).",
  },
  qrp: {
    term: "QRP",
    definition:
      "Low power operation, typically 5 watts or less. Many contests have a QRP category. Running QRP is challenging but very rewarding when you make contacts.",
    example:
      "A QRP station running 5 watts into a wire antenna can still make hundreds of QSOs.",
  },
  "low-power": {
    term: "Low Power (LP)",
    definition:
      "A contest power category, typically 100 watts or less (150W in some contests). The most popular category for home stations.",
  },
  "high-power": {
    term: "High Power (HP)",
    definition:
      "A contest power category allowing the maximum legal power limit (typically 1500W in the US). Requires an amplifier and robust antenna system.",
  },
  "clean-sweep": {
    term: "Clean Sweep",
    definition:
      "Working all possible multipliers in a contest. In ARRL Sweepstakes, a clean sweep means contacting all 84 ARRL/RAC sections. It is the ultimate achievement in that contest.",
  },
  "band-map": {
    term: "Band Map",
    definition:
      "A display showing spotted stations across a band, helping you find new multipliers and active stations. Populated by DX clusters and your own logged contacts.",
  },
  assisted: {
    term: "Assisted",
    definition:
      "A contest category where you can use DX cluster spots, skimmers, and other external data sources to find stations. Non-assisted means you find all stations yourself.",
  },
};

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up a glossary entry by key.
 * Keys should be lowercase/kebab (e.g., "cq-zone", "serial-number").
 */
export function getGlossaryTerm(key: string): GlossaryEntry | undefined {
  return CONTEST_GLOSSARY[key];
}
