/**
 * Static Contest Calendar — 2026 Edition
 *
 * Concrete schedule data for 30 major ham radio contests with exact UTC
 * start/end times for the 2026 calendar year. This dataset is the
 * foundation of the Contest Awareness system.
 *
 * This is SEPARATE from CONTEST_DATABASE in `contests.ts` which holds
 * scoring rules and exchange formats. Where overlap exists, the
 * `definitionId` field links a calendar entry to its CONTEST_DATABASE
 * counterpart.
 *
 * Date conventions used:
 * - "Full weekend" 48h contests: 0000Z Saturday - 2359Z Sunday
 * - "Full weekend" 24h contests: 2100Z Saturday - 2100Z Sunday (or per rules)
 * - 12h sprints: 1800Z Saturday - 0559Z Sunday (typical NA times)
 * - 4h NA Sprints: 0000Z Sunday - 0400Z Sunday
 * - All times verified against well-known contest scheduling conventions
 *
 * @module lib/data/contestCalendar
 */

import type { ContestCalendarEntry } from "@/lib/contest/contestCalendarTypes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WARC bands — always exempt from contests by gentleman's agreement */
export const WARC_BANDS = ["30m", "17m", "12m"] as const;

/** Standard HF contest bands (non-WARC) */
export const HF_CONTEST_BANDS = [
  "160m",
  "80m",
  "40m",
  "20m",
  "15m",
  "10m",
] as const;

/** All HF bands including WARC */
export const ALL_HF_BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
] as const;

// ---------------------------------------------------------------------------
// 2026 Contest Calendar Data (30 entries)
// ---------------------------------------------------------------------------

export const CONTEST_CALENDAR_2026: ContestCalendarEntry[] = [
  // =========================================================================
  // JANUARY 2026
  // =========================================================================

  {
    id: "arrl-rtty-ru-2026",
    name: "ARRL RTTY Roundup",
    sponsor: "ARRL",
    // 1st full weekend of January: Sat Jan 3 - Sun Jan 4
    startUtc: "2026-01-03T18:00:00Z",
    endUtc: "2026-01-04T23:59:00Z",
    bands: ["80m", "40m", "20m", "15m", "10m"],
    modes: ["RTTY", "Digital"],
    exchange: "RST + State/Province (W/VE) or RST + Serial (DX)",
    description:
      "Popular digital contest to kick off the new year. W/VE stations exchange state or province, DX stations exchange a serial number. States, provinces, and DXCC countries are multipliers.",
    difficulty: "beginner",
    estimatedParticipants: 3000,
    tags: ["digital", "rtty", "domestic"],
    rulesUrl: "https://www.arrl.org/rtty-roundup",
    definitionId: "arrl-rtty-ru",
    warcExempt: true,
  },

  {
    id: "naqp-cw-2026-jan",
    name: "North American QSO Party - CW",
    sponsor: "NCJ",
    // 2nd full weekend of January: Sat Jan 10 18Z - Sun Jan 11 06Z
    startUtc: "2026-01-10T18:00:00Z",
    endUtc: "2026-01-11T05:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "Name + State/Province/Country",
    description:
      "Fast-paced 12-hour CW contest with a 100W power limit. Exchange your first name and US state, Canadian province, or DXCC country. Great for building CW speed.",
    difficulty: "beginner",
    estimatedParticipants: 3500,
    tags: ["cw", "domestic", "sprint-style"],
    rulesUrl: "https://www.ncjweb.com/naqp/",
    definitionId: "naqp-cw",
    warcExempt: true,
  },

  {
    id: "naqp-ssb-2026-jan",
    name: "North American QSO Party - SSB",
    sponsor: "NCJ",
    // 3rd full weekend of January: Sat Jan 17 18Z - Sun Jan 18 06Z
    startUtc: "2026-01-17T18:00:00Z",
    endUtc: "2026-01-18T05:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "Name + State/Province/Country",
    description:
      "Fast-paced 12-hour phone contest with a 100W power limit. Exchange your first name and US state, Canadian province, or DXCC country. Beginner-friendly with lots of activity.",
    difficulty: "beginner",
    estimatedParticipants: 3500,
    tags: ["ssb", "domestic", "sprint-style"],
    rulesUrl: "https://www.ncjweb.com/naqp/",
    definitionId: "naqp-ssb",
    warcExempt: true,
  },

  {
    id: "arrl-vhf-2026-jan",
    name: "ARRL January VHF Contest",
    sponsor: "ARRL",
    // 3rd full weekend of January: Sat Jan 17 19Z - Sun Jan 18 03:59Z (33h)
    startUtc: "2026-01-17T19:00:00Z",
    endUtc: "2026-01-19T03:59:00Z",
    bands: ["50MHz", "144MHz", "222MHz", "432MHz", "902MHz", "1296MHz"],
    modes: ["CW", "SSB", "FM", "Digital"],
    exchange: "Grid square (4-character Maidenhead)",
    description:
      "VHF and above contest encouraging activity on 50 MHz and higher bands. Exchange 4-character Maidenhead grid squares. A great way to explore VHF propagation modes like troposcatter and meteor scatter.",
    difficulty: "intermediate",
    estimatedParticipants: 3000,
    tags: ["vhf", "all-mode", "grid-squares"],
    rulesUrl: "https://www.arrl.org/january-vhf",
    warcExempt: true,
  },

  {
    id: "cq-160-cw-2026",
    name: "CQ 160-Meter Contest - CW",
    sponsor: "CQ Magazine",
    // Last full weekend of January: Fri Jan 23 22Z - Sun Jan 25 16Z (42h)
    startUtc: "2026-01-23T22:00:00Z",
    endUtc: "2026-01-25T15:59:00Z",
    bands: ["160m"],
    modes: ["CW"],
    exchange: "RST + State/Province (W/VE) or RST + CQ Zone (DX)",
    description:
      "The premier 160-meter CW contest. Challenging low-band DXing with long winter nights. W/VE stations send state or province, DX stations send CQ zone number.",
    difficulty: "intermediate",
    estimatedParticipants: 2000,
    tags: ["cw", "topband", "dx"],
    rulesUrl: "https://www.cq160.com/rules.htm",
    definitionId: "cqww-160-cw",
    warcExempt: true,
  },

  // =========================================================================
  // FEBRUARY 2026
  // =========================================================================

  {
    id: "arrl-dx-cw-2026",
    name: "ARRL International DX Contest - CW",
    sponsor: "ARRL",
    // 3rd full weekend of February: Sat Feb 21 00Z - Sun Feb 22 24Z
    startUtc: "2026-02-21T00:00:00Z",
    endUtc: "2026-02-22T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + State/Province (W/VE) or RST + Power (DX)",
    description:
      "Major international DX contest on CW. US and Canadian stations work the world while sending their state or province. DX stations send power output. A highlight of the winter contest season.",
    difficulty: "intermediate",
    estimatedParticipants: 8000,
    tags: ["cw", "dx", "major"],
    rulesUrl: "https://www.arrl.org/arrl-dx",
    definitionId: "arrl-dx-cw",
    warcExempt: true,
  },

  // =========================================================================
  // MARCH 2026
  // =========================================================================

  {
    id: "arrl-dx-ssb-2026",
    name: "ARRL International DX Contest - SSB",
    sponsor: "ARRL",
    // 1st full weekend of March: Sat Mar 7 00Z - Sun Mar 8 24Z
    startUtc: "2026-03-07T00:00:00Z",
    endUtc: "2026-03-08T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "RST + State/Province (W/VE) or RST + Power (DX)",
    description:
      "Major international DX contest on phone. US and Canadian stations work the world while sending their state or province. DX stations send power output. Huge activity across all HF bands.",
    difficulty: "beginner",
    estimatedParticipants: 10000,
    tags: ["ssb", "dx", "major"],
    rulesUrl: "https://www.arrl.org/arrl-dx",
    definitionId: "arrl-dx-ssb",
    warcExempt: true,
  },

  {
    id: "cqwpx-ssb-2026",
    name: "CQ WPX Contest - SSB",
    sponsor: "CQ Magazine",
    // Last full weekend of March: Sat Mar 28 00Z - Sun Mar 29 24Z
    startUtc: "2026-03-28T00:00:00Z",
    endUtc: "2026-03-29T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "RST + Serial number",
    description:
      "Major worldwide SSB contest where unique callsign prefixes are the multipliers. Exchange RST and a serial number. Collect as many different prefixes as possible across all bands.",
    difficulty: "beginner",
    estimatedParticipants: 8000,
    tags: ["ssb", "dx", "major", "prefix"],
    rulesUrl: "https://www.cqwpx.com/rules.htm",
    definitionId: "cqwpx-ssb",
    warcExempt: true,
  },

  // =========================================================================
  // APRIL 2026
  // =========================================================================

  {
    id: "jidx-cw-2026",
    name: "JIDX CW Contest",
    sponsor: "JIDX Committee",
    // 2nd full weekend of April: Sat Apr 11 07Z - Sun Apr 12 07Z (48h window)
    startUtc: "2026-04-11T07:00:00Z",
    endUtc: "2026-04-13T06:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + Serial number",
    description:
      "Japan International DX Contest on CW. Japanese stations work the world, and DX stations work Japan. DXCC countries per band are multipliers. Good opportunity for JA contacts.",
    difficulty: "intermediate",
    estimatedParticipants: 2000,
    tags: ["cw", "dx", "japan"],
    rulesUrl: "https://jidx.org/",
    definitionId: "jidx-cw",
    warcExempt: true,
  },

  {
    id: "cqmm-dx-2026",
    name: "CQMM DX Contest",
    sponsor: "CQMM",
    // 3rd full weekend of April: Sat Apr 18 00Z - Sun Apr 19 24Z
    startUtc: "2026-04-18T00:00:00Z",
    endUtc: "2026-04-19T23:59:00Z",
    bands: ["80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + CQ Zone",
    description:
      "CQ Manchester Mineira DX Contest. A 48-hour CW contest focusing on DX contacts across HF bands. CQ zones and DXCC countries serve as multipliers.",
    difficulty: "intermediate",
    estimatedParticipants: 1500,
    tags: ["cw", "dx"],
    rulesUrl: "https://www.cqmm.com.br/",
    warcExempt: true,
  },

  // =========================================================================
  // MAY 2026
  // =========================================================================

  {
    id: "cqwpx-cw-2026",
    name: "CQ WPX Contest - CW",
    sponsor: "CQ Magazine",
    // Last full weekend of May: Sat May 30 00Z - Sun May 31 24Z
    startUtc: "2026-05-30T00:00:00Z",
    endUtc: "2026-05-31T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + Serial number",
    description:
      "Major worldwide CW contest where unique callsign prefixes are the multipliers. Exchange RST and a serial number. Outstanding high-band propagation in late May makes this exciting for DX.",
    difficulty: "intermediate",
    estimatedParticipants: 7000,
    tags: ["cw", "dx", "major", "prefix"],
    rulesUrl: "https://www.cqwpx.com/rules.htm",
    definitionId: "cqwpx-cw",
    warcExempt: true,
  },

  // =========================================================================
  // JUNE 2026
  // =========================================================================

  {
    id: "arrl-ss-digital-2026",
    name: "ARRL June VHF / SS Digital",
    sponsor: "ARRL",
    // 1st weekend of June: Sat Jun 6 00Z - Sun Jun 7 24Z
    startUtc: "2026-06-06T00:00:00Z",
    endUtc: "2026-06-07T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m", "6m"],
    modes: ["FT8", "FT4", "Digital"],
    exchange: "Grid square or State",
    description:
      "Digital-mode contest featuring FT8 and FT4. Great entry point for operators new to digital contesting. Activity spans HF through 6 meters with grid squares or state/province exchanges.",
    difficulty: "beginner",
    estimatedParticipants: 2000,
    tags: ["digital", "ft8", "beginner-friendly"],
    rulesUrl: "https://www.arrl.org/arrl-digital-contest",
    warcExempt: true,
  },

  {
    id: "all-asian-dx-cw-2026",
    name: "All Asian DX Contest - CW",
    sponsor: "JARL",
    // 3rd full weekend of June: Sat Jun 20 00Z - Sun Jun 21 24Z
    startUtc: "2026-06-20T00:00:00Z",
    endUtc: "2026-06-21T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + Operator age (00 for club)",
    description:
      "All Asian DX Contest on CW. Asian stations work non-Asian, and non-Asian stations work Asian. The unique exchange of RST plus operator age makes this contest distinctive.",
    difficulty: "intermediate",
    estimatedParticipants: 2500,
    tags: ["cw", "dx", "asia"],
    rulesUrl:
      "https://www.jarl.org/English/4_Library/A-4-3_Contests/all_asian.htm",
    definitionId: "all-asian-dx-cw",
    warcExempt: true,
  },

  {
    id: "arrl-fd-2026",
    name: "ARRL Field Day",
    sponsor: "ARRL",
    // 4th full weekend of June: Sat Jun 27 18Z - Sun Jun 28 21Z (27h)
    startUtc: "2026-06-27T18:00:00Z",
    endUtc: "2026-06-28T20:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m", "6m"],
    modes: ["CW", "SSB", "Digital"],
    exchange: "Class + ARRL/RAC Section",
    description:
      "The biggest amateur radio event in North America. An emergency preparedness exercise where clubs set up portable stations. Exchange your transmitter count and class letter plus ARRL or RAC section. Fun for all skill levels.",
    difficulty: "beginner",
    estimatedParticipants: 35000,
    tags: ["all-mode", "emergency-prep", "beginner-friendly", "major"],
    rulesUrl: "https://www.arrl.org/field-day",
    definitionId: "arrl-fd",
    warcExempt: true,
  },

  // =========================================================================
  // JULY 2026
  // =========================================================================

  {
    id: "iaru-hf-2026",
    name: "IARU HF World Championship",
    sponsor: "IARU",
    // 2nd full weekend of July: Sat Jul 11 12Z - Sun Jul 12 12Z
    startUtc: "2026-07-11T12:00:00Z",
    endUtc: "2026-07-12T11:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW", "SSB"],
    exchange: "RST + ITU Zone (or HQ station abbreviation)",
    description:
      "The official HF championship of the International Amateur Radio Union. Work stations in ITU zones and official IARU HQ stations for bonus multipliers. Mixed-mode contest with strong worldwide participation.",
    difficulty: "intermediate",
    estimatedParticipants: 6000,
    tags: ["cw", "ssb", "dx", "major", "mixed-mode"],
    rulesUrl: "https://www.arrl.org/iaru-hf-championship",
    definitionId: "iaru-hf",
    warcExempt: true,
  },

  {
    id: "cqww-vhf-2026",
    name: "CQ World Wide VHF Contest",
    sponsor: "CQ Magazine",
    // 3rd full weekend of July: Sat Jul 18 18Z - Sun Jul 19 21Z (27h)
    startUtc: "2026-07-18T18:00:00Z",
    endUtc: "2026-07-19T20:59:00Z",
    bands: ["50MHz", "144MHz"],
    modes: ["CW", "SSB", "FM", "Digital"],
    exchange: "Grid square (4-character Maidenhead)",
    description:
      "VHF contest on 6 meters and 2 meters. Exchange 4-character Maidenhead grid squares. Summer sporadic-E propagation on 6m can yield exciting DX contacts across continents.",
    difficulty: "intermediate",
    estimatedParticipants: 2000,
    tags: ["vhf", "all-mode", "grid-squares", "sporadic-e"],
    rulesUrl: "https://www.cqww-vhf.com/",
    definitionId: "cqww-vhf",
    warcExempt: true,
  },

  // =========================================================================
  // AUGUST 2026
  // =========================================================================

  {
    id: "wae-dx-cw-2026",
    name: "WAE DX Contest - CW",
    sponsor: "DARC",
    // 2nd full weekend of August: Sat Aug 8 00Z - Sun Aug 9 24Z
    startUtc: "2026-08-08T00:00:00Z",
    endUtc: "2026-08-09T23:59:00Z",
    bands: ["80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + Serial number",
    description:
      "Worked All Europe DX Contest on CW. Features the unique QTC system where European stations can send batches of 10 previously logged QSOs to non-EU stations for bonus points. Strategic depth beyond standard contesting.",
    difficulty: "advanced",
    estimatedParticipants: 3000,
    tags: ["cw", "dx", "europe", "qtc"],
    rulesUrl:
      "https://www.darc.de/der-club/referate/conteste/wae-dx-contest/en/",
    definitionId: "wae-dx-cw",
    warcExempt: true,
  },

  // =========================================================================
  // SEPTEMBER 2026
  // =========================================================================

  {
    id: "all-asian-dx-ssb-2026",
    name: "All Asian DX Contest - SSB",
    sponsor: "JARL",
    // 1st full weekend of September: Sat Sep 5 00Z - Sun Sep 6 24Z
    startUtc: "2026-09-05T00:00:00Z",
    endUtc: "2026-09-06T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "RST + Operator age (00 for club)",
    description:
      "All Asian DX Contest on phone. Asian stations work non-Asian, and non-Asian stations work Asian. Exchange RST plus operator age, giving this contest a personal touch.",
    difficulty: "intermediate",
    estimatedParticipants: 2500,
    tags: ["ssb", "dx", "asia"],
    rulesUrl:
      "https://www.jarl.org/English/4_Library/A-4-3_Contests/all_asian.htm",
    definitionId: "all-asian-dx-ssb",
    warcExempt: true,
  },

  {
    id: "na-sprint-cw-2026",
    name: "North American Sprint Contest - CW",
    sponsor: "NCJ",
    // 1st full weekend of September: Sun Sep 6 00Z - 04Z (4h)
    startUtc: "2026-09-06T00:00:00Z",
    endUtc: "2026-09-06T03:59:00Z",
    bands: ["80m", "40m", "20m"],
    modes: ["CW"],
    exchange: "Serial + Name + State/Province/Country",
    description:
      "Intense 4-hour CW sprint requiring a QSY after each contact when running. Tests operating skill and band agility. Exchange serial number, operator name, and QTH.",
    difficulty: "advanced",
    estimatedParticipants: 1000,
    tags: ["cw", "sprint", "domestic", "advanced"],
    rulesUrl: "https://www.ncjweb.com/Sprint-Rules.php",
    definitionId: "na-sprint-cw",
    warcExempt: true,
  },

  {
    id: "wae-dx-ssb-2026",
    name: "WAE DX Contest - SSB",
    sponsor: "DARC",
    // 2nd full weekend of September: Sat Sep 12 00Z - Sun Sep 13 24Z
    startUtc: "2026-09-12T00:00:00Z",
    endUtc: "2026-09-13T23:59:00Z",
    bands: ["80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "RST + Serial number",
    description:
      "Worked All Europe DX Contest on phone. Features the unique QTC system for bonus points. European stations send batches of previously logged QSOs to non-EU stations.",
    difficulty: "intermediate",
    estimatedParticipants: 3000,
    tags: ["ssb", "dx", "europe", "qtc"],
    rulesUrl:
      "https://www.darc.de/der-club/referate/conteste/wae-dx-contest/en/",
    definitionId: "wae-dx-ssb",
    warcExempt: true,
  },

  {
    id: "na-sprint-ssb-2026",
    name: "North American Sprint Contest - SSB",
    sponsor: "NCJ",
    // 2nd full weekend of September: Sun Sep 13 00Z - 04Z (4h)
    startUtc: "2026-09-13T00:00:00Z",
    endUtc: "2026-09-13T03:59:00Z",
    bands: ["80m", "40m", "20m"],
    modes: ["SSB"],
    exchange: "Serial + Name + State/Province/Country",
    description:
      "Intense 4-hour phone sprint requiring a QSY after each contact when running. A true test of operating skill and discipline under time pressure.",
    difficulty: "advanced",
    estimatedParticipants: 1000,
    tags: ["ssb", "sprint", "domestic", "advanced"],
    rulesUrl: "https://www.ncjweb.com/Sprint-Rules.php",
    definitionId: "na-sprint-ssb",
    warcExempt: true,
  },

  {
    id: "sac-cw-2026",
    name: "Scandinavian Activity Contest - CW",
    sponsor: "SAC",
    // Last full weekend of September: Sat Sep 26 12Z - Sun Sep 27 12Z
    startUtc: "2026-09-26T12:00:00Z",
    endUtc: "2026-09-27T11:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + Serial number",
    description:
      "Scandinavian Activity Contest on CW. Scandinavian stations work the world, and non-Scandinavian stations work Scandinavia. A 24-hour contest promoting activity from Northern Europe.",
    difficulty: "intermediate",
    estimatedParticipants: 2000,
    tags: ["cw", "dx", "scandinavia"],
    rulesUrl: "https://www.sactest.net/",
    warcExempt: true,
  },

  {
    id: "cqww-rtty-2026",
    name: "CQ WW RTTY DX Contest",
    sponsor: "CQ Magazine",
    // Last full weekend of September: Sat Sep 26 00Z - Sun Sep 27 24Z
    startUtc: "2026-09-26T00:00:00Z",
    endUtc: "2026-09-27T23:59:00Z",
    bands: ["80m", "40m", "20m", "15m", "10m"],
    modes: ["RTTY"],
    exchange: "RST + CQ Zone",
    description:
      "The biggest RTTY contest of the year. Work stations worldwide collecting CQ zones and DXCC countries as multipliers. Last full weekend of September with excellent fall propagation.",
    difficulty: "intermediate",
    estimatedParticipants: 5000,
    tags: ["rtty", "digital", "dx", "major"],
    rulesUrl: "https://www.cqwwrtty.com/rules.htm",
    definitionId: "cqww-rtty",
    warcExempt: true,
  },

  // =========================================================================
  // OCTOBER 2026
  // =========================================================================

  {
    id: "cqww-ssb-2026",
    name: "CQ World Wide DX Contest - SSB",
    sponsor: "CQ Magazine",
    // Last full weekend of October: Sat Oct 24 00Z - Sun Oct 25 24Z
    startUtc: "2026-10-24T00:00:00Z",
    endUtc: "2026-10-25T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "RST + CQ Zone",
    description:
      "The largest amateur radio phone contest in the world with over 45,000 participants. Work as many stations in as many CQ zones and DXCC countries as possible. Peak fall propagation makes this a DX feast.",
    difficulty: "beginner",
    estimatedParticipants: 45000,
    tags: ["ssb", "dx", "major", "mega"],
    rulesUrl: "https://www.cqww.com/rules.htm",
    definitionId: "cqww-ssb",
    warcExempt: true,
  },

  // =========================================================================
  // NOVEMBER 2026
  // =========================================================================

  {
    id: "arrl-ss-cw-2026",
    name: "ARRL Sweepstakes - CW",
    sponsor: "ARRL",
    // 1st full weekend of November: Sat Nov 7 21Z - Mon Nov 9 03Z (30h window, 24h op)
    startUtc: "2026-11-07T21:00:00Z",
    endUtc: "2026-11-09T02:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "Serial + Precedence + Callsign + Check + Section",
    description:
      "The classic ARRL contest with the most complex exchange in amateur radio. Send serial number, precedence letter, callsign, 2-digit check (year licensed), and ARRL/RAC section. The goal is a clean sweep of all 84 sections.",
    difficulty: "advanced",
    estimatedParticipants: 5000,
    tags: ["cw", "domestic", "classic", "sections"],
    rulesUrl: "https://www.arrl.org/sweepstakes",
    definitionId: "arrl-ss-cw",
    warcExempt: true,
  },

  {
    id: "arrl-ss-ssb-2026",
    name: "ARRL Sweepstakes - SSB",
    sponsor: "ARRL",
    // 3rd full weekend of November: Sat Nov 21 21Z - Mon Nov 23 03Z (30h window, 24h op)
    startUtc: "2026-11-21T21:00:00Z",
    endUtc: "2026-11-23T02:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["SSB"],
    exchange: "Serial + Precedence + Callsign + Check + Section",
    description:
      "Phone version of the classic ARRL Sweepstakes. The lengthy exchange of serial, precedence, callsign, check, and section provides a unique challenge. Aim for the elusive clean sweep of all 84 sections.",
    difficulty: "intermediate",
    estimatedParticipants: 6000,
    tags: ["ssb", "domestic", "classic", "sections"],
    rulesUrl: "https://www.arrl.org/sweepstakes",
    definitionId: "arrl-ss-ssb",
    warcExempt: true,
  },

  {
    id: "cqww-cw-2026",
    name: "CQ World Wide DX Contest - CW",
    sponsor: "CQ Magazine",
    // Last full weekend of November: Sat Nov 28 00Z - Sun Nov 29 24Z
    startUtc: "2026-11-28T00:00:00Z",
    endUtc: "2026-11-29T23:59:00Z",
    bands: ["160m", "80m", "40m", "20m", "15m", "10m"],
    modes: ["CW"],
    exchange: "RST + CQ Zone",
    description:
      "The largest CW contest in the world with over 40,000 participants. Work as many stations in as many CQ zones and DXCC countries as possible. The crown jewel of the contest calendar.",
    difficulty: "intermediate",
    estimatedParticipants: 40000,
    tags: ["cw", "dx", "major", "mega"],
    rulesUrl: "https://www.cqww.com/rules.htm",
    definitionId: "cqww-cw",
    warcExempt: true,
  },

  // =========================================================================
  // DECEMBER 2026
  // =========================================================================

  {
    id: "arrl-160m-2026",
    name: "ARRL 160-Meter Contest",
    sponsor: "ARRL",
    // 1st full weekend of December: Fri Dec 4 22Z - Sun Dec 6 16Z (42h)
    startUtc: "2026-12-04T22:00:00Z",
    endUtc: "2026-12-06T15:59:00Z",
    bands: ["160m"],
    modes: ["CW"],
    exchange: "RST + ARRL/RAC Section (W/VE) or RST + Country (DX)",
    description:
      "ARRL's 160-meter contest. CW only on the top band. W/VE stations exchange ARRL or RAC section, DX stations exchange their DXCC country prefix. Long winter nights favor top-band DXing.",
    difficulty: "intermediate",
    estimatedParticipants: 2500,
    tags: ["cw", "topband"],
    rulesUrl: "https://www.arrl.org/160-meter",
    warcExempt: true,
  },

  {
    id: "arrl-10m-2026",
    name: "ARRL 10-Meter Contest",
    sponsor: "ARRL",
    // 2nd full weekend of December: Sat Dec 12 00Z - Sun Dec 13 24Z
    startUtc: "2026-12-12T00:00:00Z",
    endUtc: "2026-12-13T23:59:00Z",
    bands: ["10m"],
    modes: ["CW", "SSB"],
    exchange: "RST + State/Province (W/VE) or RST + Serial (DX)",
    description:
      "Single-band contest on 10 meters. CW and SSB contacts with the same station count separately. With solar cycle 25 in full swing, expect exceptional 10m propagation. Open to Technician class operators.",
    difficulty: "beginner",
    estimatedParticipants: 4000,
    tags: ["mixed-mode", "single-band", "beginner-friendly"],
    rulesUrl: "https://www.arrl.org/10-meter",
    definitionId: "arrl-10m",
    warcExempt: true,
  },

  {
    id: "stew-perry-tb-2026",
    name: "Stew Perry Topband Distance Challenge",
    sponsor: "Boring ARC",
    // Last weekend of December: Sat Dec 26 15Z - Sun Dec 27 05Z (14h)
    startUtc: "2026-12-26T15:00:00Z",
    endUtc: "2026-12-27T04:59:00Z",
    bands: ["160m"],
    modes: ["CW"],
    exchange: "Grid square (4-character Maidenhead)",
    description:
      "Distance-based 160m CW contest. Exchange 4-character Maidenhead grid squares and earn points based on great-circle distance. QRP stations earn 4x points. A unique scoring model rewards working distant stations.",
    difficulty: "advanced",
    estimatedParticipants: 1500,
    tags: ["cw", "topband", "distance-scoring", "grid-squares"],
    rulesUrl: "https://www.kkn.net/stew/",
    definitionId: "stew-perry-tb",
    warcExempt: true,
  },
];

// ---------------------------------------------------------------------------
// Lookup Functions
// ---------------------------------------------------------------------------

/**
 * Get all contests whose window overlaps the given date range.
 *
 * A contest overlaps [start, end] if its startUtc < end AND its endUtc > start.
 */
export function getContestsInRange(
  start: Date,
  end: Date,
): ContestCalendarEntry[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return CONTEST_CALENDAR_2026.filter((c) => {
    const cStart = new Date(c.startUtc).getTime();
    const cEnd = new Date(c.endUtc).getTime();
    return cStart < endMs && cEnd > startMs;
  });
}

/**
 * Get contests that are actively running at the given instant.
 */
export function getActiveContests(now: Date): ContestCalendarEntry[] {
  const nowMs = now.getTime();
  return CONTEST_CALENDAR_2026.filter((c) => {
    const cStart = new Date(c.startUtc).getTime();
    const cEnd = new Date(c.endUtc).getTime();
    return nowMs >= cStart && nowMs <= cEnd;
  });
}

/**
 * Get contests starting within the next `days` days from `now`.
 * Only returns contests that have NOT yet started.
 */
export function getUpcomingContests(
  now: Date,
  days: number = 30,
): ContestCalendarEntry[] {
  const nowMs = now.getTime();
  const futureMs = nowMs + days * 24 * 60 * 60 * 1000;
  return CONTEST_CALENDAR_2026.filter((c) => {
    const cStart = new Date(c.startUtc).getTime();
    return cStart > nowMs && cStart <= futureMs;
  }).sort(
    (a, b) => new Date(a.startUtc).getTime() - new Date(b.startUtc).getTime(),
  );
}

/**
 * Get a single calendar entry by its ID.
 */
export function getCalendarEntryById(
  id: string,
): ContestCalendarEntry | undefined {
  return CONTEST_CALENDAR_2026.find((c) => c.id === id);
}

/**
 * Get all calendar entries that link to a given CONTEST_DATABASE definition.
 */
export function getCalendarEntriesByDefinitionId(
  definitionId: string,
): ContestCalendarEntry[] {
  return CONTEST_CALENDAR_2026.filter((c) => c.definitionId === definitionId);
}

/**
 * Get the next contest boundary (start or end) after `now`.
 * Returns null if no future boundaries exist in the dataset.
 */
export function getNextContestBoundary(now: Date): Date | null {
  const nowMs = now.getTime();
  let closest: number | null = null;

  for (const c of CONTEST_CALENDAR_2026) {
    const startMs = new Date(c.startUtc).getTime();
    const endMs = new Date(c.endUtc).getTime();

    if (startMs > nowMs && (closest === null || startMs < closest)) {
      closest = startMs;
    }
    if (endMs > nowMs && (closest === null || endMs < closest)) {
      closest = endMs;
    }
  }

  return closest !== null ? new Date(closest) : null;
}
