/**
 * Contest Quick-Start Guide Generator
 *
 * Produces beginner-friendly quick-start guides for common ham radio
 * contests. Guides include what to say, exchange format, common mistakes,
 * and operating strategy.
 *
 * For contests not in the template library, returns a sensible generic guide.
 *
 * @module lib/contest/contestQuickStart
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuickStartGuide {
  contestName: string;
  whatToSay: string;
  exchangeFormat: string;
  commonMistakes: string[];
  tips: string[];
  operatingStrategy: string;
  timeManagement: string;
}

// ---------------------------------------------------------------------------
// Template library
// ---------------------------------------------------------------------------

/** Maps definitionId (from CONTEST_DATABASE) to a template factory */
const TEMPLATES: Record<string, () => Omit<QuickStartGuide, "contestName">> = {
  "cqww-cw": () => ({
    whatToSay:
      "Send 'CQ TEST' followed by your callsign. When someone answers, send their callsign, then your exchange: a signal report and your CQ zone. For example: 'W1AW 599 05'.",
    exchangeFormat:
      "RST + CQ Zone number. You will give your signal report (usually 599 on CW) and your CQ zone. For example, '599 05' means signal report 599, CQ zone 5.",
    commonMistakes: [
      "Sending your zone wrong — double-check which CQ zone you are in before the contest starts.",
      "Forgetting to log the other station's zone — you need it for multiplier credit.",
      "Calling stations without listening first — wait for them to finish a QSO before calling.",
      "Not adjusting CW speed — slow down if stations cannot copy you.",
    ],
    tips: [
      "Start on 20m during the day and move to 40m/80m at night.",
      "Keep a cheat sheet with your exchange visible at your operating position.",
      "If the pileup is too big, try a less crowded band or come back later.",
    ],
    operatingStrategy:
      "If you are new, start with Search & Pounce (S&P): tune across the band, find a station calling CQ, and answer them. Once comfortable, try calling CQ yourself on a clear frequency.",
    timeManagement:
      "This is a 48-hour contest but you only need to operate as much as you want. Peak hours are typically 1200-1800 UTC on Saturday. Take breaks when rates drop.",
  }),

  "cqww-ssb": () => ({
    whatToSay:
      "Call 'CQ Contest' followed by your callsign (use phonetics). When someone answers, give them a signal report and your CQ zone. For example: 'Five nine, zone five'.",
    exchangeFormat:
      "RS + CQ Zone number. On phone, give a 2-digit signal report (usually 59) and your CQ zone. For example: 'Five nine, zone five'.",
    commonMistakes: [
      "Speaking too fast — slow down, especially for your callsign. Use phonetics.",
      "Not saying your callsign often enough when running. Say it after every 2-3 QSOs.",
      "Forgetting to write down the other station's zone — that is your multiplier!",
      "Spending too long on one station. If they cannot copy you after 2-3 tries, move on.",
    ],
    tips: [
      "Practice your exchange out loud before the contest starts.",
      "Use a headset to reduce fatigue — your voice is your instrument for 48 hours.",
      "Drink water and take short breaks to keep your voice fresh.",
    ],
    operatingStrategy:
      "Start by tuning across 20m and working stations you hear (Search & Pounce). As you gain confidence, find a clear frequency and start calling CQ Contest yourself.",
    timeManagement:
      "Peak phone hours are afternoons (local time) when propagation is best on the high bands. Night hours on 40m and 80m can yield good rates too. Rest when rates drop below 20/hour.",
  }),

  "arrl-dx-cw": () => ({
    whatToSay:
      "If you are in the US/Canada, send your signal report and state/province (e.g., '599 CA'). If you are DX, send your signal report and power (e.g., '599 100').",
    exchangeFormat:
      "RST + State/Province (for W/VE stations) or RST + Power in watts (for DX). Example: '599 CA' or '599 100'.",
    commonMistakes: [
      "Sending your CQ zone instead of your state — this is NOT CQ WW.",
      "DX stations: forgetting that you send your power output, not your zone.",
      "Not identifying whether you are W/VE or DX — the exchange is different for each.",
    ],
    tips: [
      "Check propagation predictions to know which bands will be open to which regions.",
      "Europe will be loud on 20m during afternoon hours. Focus there for big rate.",
    ],
    operatingStrategy:
      "W/VE stations: work DX stations only. DX stations: work W/VE stations only. Focus on the bands with the best propagation to the other side.",
    timeManagement:
      "48-hour contest. High bands (10-20m) peak during daylight; low bands (80-160m) peak at night. Plan your operating around band openings.",
  }),

  "arrl-dx-ssb": () => ({
    whatToSay:
      "US/Canada: give signal report and your state or province. Example: 'Five nine, California'. DX: give signal report and your power. Example: 'Five nine, one hundred watts'.",
    exchangeFormat:
      "RS + State/Province (W/VE) or RS + Power (DX). Example: '59 California' or '59 100'.",
    commonMistakes: [
      "Using abbreviations for your state on phone — say the full name clearly.",
      "Confusing this with CQ WW — you do NOT send your zone here.",
      "Not adjusting your approach based on W/VE vs DX — know which exchange you need.",
    ],
    tips: [
      "Use phonetics for your state if it sounds like another (e.g., 'Maine' vs 'Maryland').",
      "The biggest rate will come from 20m during the day and 40m at night.",
    ],
    operatingStrategy:
      "Search & Pounce is the safest strategy for beginners. Listen for 'CQ ARRL DX' and respond with your callsign.",
    timeManagement:
      "Try to be on the air for the first hour of the contest — activity is highest then. Plan breaks around propagation gaps.",
  }),

  "arrl-fd": () => ({
    whatToSay:
      "Call 'CQ Field Day' and your callsign. Give your class and ARRL section. Example: '2A Orange' means 2 transmitters, class A, Orange (ARRL) section.",
    exchangeFormat:
      "Class + ARRL/RAC Section. Class is the number of transmitters + a category letter (A, B, C, D, E, F). Example: '1D SCV' means 1 transmitter, class D (home station), Santa Clara Valley section.",
    commonMistakes: [
      "Not knowing your ARRL section — look it up before Field Day starts.",
      "Confusing the class letter (A=club, B=1-2 persons portable, D=home station, E=home+emergency power).",
      "Forgetting that CW and digital QSOs are worth 2 points, but phone is only 1 point.",
    ],
    tips: [
      "Field Day is the most beginner-friendly contest. Everyone is happy to slow down and help new operators.",
      "If you operate from home, your class is 1D (one transmitter, home) or 1E (home, emergency power).",
      "Try both CW and phone — CW contacts are worth double points.",
    ],
    operatingStrategy:
      "Get on the air and have fun! There is no wrong way to do Field Day. Work every station you hear. If it is your first contest, just focus on making contacts and enjoying the experience.",
    timeManagement:
      "Field Day runs 24 hours starting at 1800 UTC Saturday. Activity is strongest in the evening hours. Do not feel pressure to stay up all night — participate for as many hours as you enjoy.",
  }),

  "naqp-cw": () => ({
    whatToSay:
      "Send your name and state/province/country. Example: 'JOHN CA'. That is it — no signal report needed!",
    exchangeFormat:
      "Name + State/Province/Country. Just your first name and your US state, Canadian province, or DXCC country. Example: 'JOHN CA' or 'YUKI JA'.",
    commonMistakes: [
      "Sending a signal report — NAQP does NOT include RST in the exchange.",
      "Exceeding 100 watts — NAQP has a strict 100W power limit for all participants.",
      "Using your full name instead of just your first name.",
    ],
    tips: [
      "NAQP is one of the best contests for new CW operators — short exchange, 12-hour format, and friendly atmosphere.",
      "The 100W limit levels the playing field. Your station is competitive!",
    ],
    operatingStrategy:
      "S&P is great for beginners in NAQP. The exchange is short and sweet: just name and QTH. Once comfortable, try running for higher rates.",
    timeManagement:
      "NAQP runs 12 hours (1800Z Saturday to 0600Z Sunday). With the shorter duration, try to stay active for as much as you can. Rates are highest in the first few hours.",
  }),

  "naqp-ssb": () => ({
    whatToSay:
      "Give your first name and state (or province/country). Example: 'John, California'. No signal report needed.",
    exchangeFormat:
      "Name + State/Province/Country. Just say your first name and location. Example: 'John, California'.",
    commonMistakes: [
      "Giving a signal report — NAQP does not use RST.",
      "Running more than 100 watts — there is a strict power limit.",
      "Speaking too fast — NAQP is friendly and there is no rush.",
    ],
    tips: [
      "NAQP SSB is perhaps the friendliest HF contest. Perfect for your first contest experience.",
      "The 100W power limit means even modest stations are competitive.",
    ],
    operatingStrategy:
      "Tune around and answer stations calling CQ NAQP. The exchange is simple and conversational. This is a great contest to build confidence.",
    timeManagement:
      "12-hour contest. Try to be on for the first hour when activity is highest. Take a dinner break in the middle and come back for the evening low-band activity.",
  }),

  "arrl-ss-cw": () => ({
    whatToSay:
      "Send: serial number, precedence letter, your callsign, check (2-digit year you were first licensed), and ARRL section. Example: '47 A W1AW 82 CT'.",
    exchangeFormat:
      "Serial + Precedence + Callsign + Check + Section. Precedence letters: A (low power), B (high power), Q (QRP), U (unlimited), M (multi-op), S (school). Check is the last 2 digits of the year you were first licensed.",
    commonMistakes: [
      "Getting the precedence letter wrong — A=low power (most common), B=high power.",
      "Forgetting your check year — the 2-digit year you were first licensed (e.g., '18' for 2018).",
      "Not knowing your ARRL section abbreviation.",
      "Sending the exchange out of order — follow the standard order: NR PREC CALL CK SEC.",
    ],
    tips: [
      "Write your complete exchange on a sticky note and put it on your monitor.",
      "The goal is a 'clean sweep' of all 84 sections. Track which ones you still need.",
      "Rare sections like NT, NL, and PE are highly sought after — work them immediately when heard.",
    ],
    operatingStrategy:
      "Sweepstakes has the most complex exchange in amateur radio. Practice sending it before the contest. S&P is recommended for first-timers until you have the exchange memorized.",
    timeManagement:
      "24 hours of operating in a 30-hour window. You must take at least 6 hours off. Plan off-time during low-rate periods (typically 0800-1200 UTC Sunday).",
  }),

  "arrl-ss-ssb": () => ({
    whatToSay:
      "Say: 'Number 47, Alpha, Whiskey One Alpha Whiskey, 82, Connecticut'. That is: serial, precedence, callsign, check, section.",
    exchangeFormat:
      "Serial + Precedence + Callsign + Check + Section. Same format as SS CW but spoken. Precedence: A (low power), B (high power), Q (QRP), U (unlimited), M (multi-op), S (school).",
    commonMistakes: [
      "Rushing through the long exchange — take your time, especially with your section.",
      "Giving your state instead of your ARRL section — many states have multiple sections.",
      "Forgetting that precedence and check are separate fields.",
    ],
    tips: [
      "Read the exchange slowly and clearly. The long format means mistakes are common.",
      "Ask for repeats — everyone expects it with this exchange format.",
      "Study the ARRL section list beforehand so you know what to expect.",
    ],
    operatingStrategy:
      "Definitely start with S&P for your first Sweepstakes. The exchange is long and takes practice to send smoothly. Listen to a few QSOs before jumping in.",
    timeManagement:
      "Same as SS CW: 24 hours in a 30-hour window. The phone version tends to have slightly lower rates, so plan for steady operating rather than sprint bursts.",
  }),

  "cqww-rtty": () => ({
    whatToSay:
      "Your software sends the exchange automatically. Set up your macros with: RST and CQ zone. Example macro: '{RST} {ZONE}' which sends '599 05'.",
    exchangeFormat:
      "RST + CQ Zone. Your RTTY software handles the exchange. Make sure your CQ zone is correctly configured in the software before the contest.",
    commonMistakes: [
      "Not setting up contest macros before the contest starts.",
      "Having your CQ zone wrong in your software configuration.",
      "Not monitoring your TX audio levels — overdrive causes splatter on RTTY.",
    ],
    tips: [
      "Test your macros with a friend before the contest.",
      "RTTY contests are great for beginners — the computer does the hard work.",
      "Use AFSK mode if your radio supports it for cleaner RTTY signals.",
    ],
    operatingStrategy:
      "Digital contests are very S&P friendly. Tune across the band, click on a signal in the waterfall, and let your software decode and send the exchange.",
    timeManagement:
      "48-hour contest. Activity is strong throughout. RTTY signals can often be decoded even with heavy QRM, so rates stay consistent.",
  }),
};

// ---------------------------------------------------------------------------
// Generic fallback
// ---------------------------------------------------------------------------

function genericGuide(contestName: string): QuickStartGuide {
  return {
    contestName,
    whatToSay:
      "Call 'CQ Contest' and your callsign. When a station answers, exchange the information specified in the contest rules. Listen to a few QSOs first to hear what others are saying.",
    exchangeFormat:
      "Check the contest rules for the specific exchange. Common exchanges include signal reports (RST), serial numbers, states/provinces, CQ zones, or grid squares.",
    commonMistakes: [
      "Not reading the contest rules before starting — always know your exchange format.",
      "Calling on a frequency that is already in use — listen before you transmit.",
      "Not logging contacts as you make them — log immediately after each QSO.",
      "Forgetting to submit your log after the contest — even a checklog helps!",
    ],
    tips: [
      "Listen first! Spend 10 minutes tuning around to hear how other stations handle the exchange.",
      "Keep your exchange written down where you can see it.",
      "Do not worry about your score — focus on having fun and making contacts.",
      "If you are unsure of something, ask the other station to repeat. Everyone was a beginner once.",
    ],
    operatingStrategy:
      "Start with Search & Pounce: tune across the band, find a station calling CQ Contest, listen to one or two of their QSOs to learn the exchange pattern, then call them with your exchange ready.",
    timeManagement:
      "Operate as much or as little as you like. Even a few hours of operation yields a worthwhile experience. Try to be on the air during the first hour of the contest when activity is highest.",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a quick-start guide for a contest.
 *
 * @param contestId - Either a definitionId (from CONTEST_DATABASE) or a
 *   calendar entry ID. The function strips year suffixes to match templates.
 * @param contestName - Optional human-readable name for the guide header.
 *   Falls back to the contestId if not provided.
 */
export function generateQuickStart(
  contestId: string,
  contestName?: string,
): QuickStartGuide {
  // Try exact match first
  let factory = TEMPLATES[contestId];

  // Strip year suffixes like "-2026" or "-2026-jan" for template matching
  if (!factory) {
    const stripped = contestId.replace(/-\d{4}(-\w+)?$/, "");
    factory = TEMPLATES[stripped];
  }

  const name = contestName ?? contestId;

  if (factory) {
    return { contestName: name, ...factory() };
  }

  return genericGuide(name);
}
