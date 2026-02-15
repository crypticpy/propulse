/**
 * Contest Calendar Types
 *
 * Types for the contest calendar engine that provides schedule awareness
 * to the entire application. This is a SEPARATE system from the contest
 * session engine (ContestDefinition / ContestSession) -- those handle
 * active QSO logging, while these types handle "what contests are
 * happening when" across the calendar year.
 *
 * @module lib/contest/contestCalendarTypes
 */

// ---------------------------------------------------------------------------
// Calendar Entry
// ---------------------------------------------------------------------------

/**
 * A single contest event on the calendar with concrete dates.
 *
 * Unlike ContestDefinition (which stores scoring rules and exchange formats),
 * a CalendarEntry carries the *schedule* metadata: exact UTC start/end,
 * participant estimates, difficulty rating, and tags for filtering.
 */
export interface ContestCalendarEntry {
  /** Unique calendar ID, e.g. "cqww-cw-2026" */
  id: string;

  /** Human-readable contest name, e.g. "CQ World Wide DX - CW" */
  name: string;

  /** Sponsoring organization, e.g. "CQ Magazine" */
  sponsor: string;

  /** ISO 8601 UTC start timestamp */
  startUtc: string;

  /** ISO 8601 UTC end timestamp */
  endUtc: string;

  /** Bands used, e.g. ["160m","80m","40m","20m","15m","10m"] */
  bands: string[];

  /** Modes permitted, e.g. ["CW"] */
  modes: string[];

  /** Exchange format description, e.g. "RST + CQ Zone" */
  exchange: string;

  /** 2-3 sentence plain-language description */
  description: string;

  /** Difficulty classification */
  difficulty: "beginner" | "intermediate" | "advanced";

  /** Estimated number of participants */
  estimatedParticipants: number;

  /** Filterable tags, e.g. ["dx","cw","major"] */
  tags: string[];

  /** URL to official contest rules */
  rulesUrl?: string;

  /**
   * Links to an existing CONTEST_DATABASE entry by its `id` field.
   * When present, the UI can offer a "Start Contest" action that opens
   * ContestConfigModal pre-filled for this contest.
   */
  definitionId?: string;

  /**
   * Whether this contest respects the WARC band gentleman's agreement.
   * WARC bands (30m, 17m, 12m) are always exempt from HF contests.
   */
  warcExempt: boolean;
}

// ---------------------------------------------------------------------------
// Calendar Context (consumed by useContestContext)
// ---------------------------------------------------------------------------

/**
 * Derived calendar awareness state.
 *
 * Named `ContestCalendarContext` to avoid collision with the existing
 * `ContestContext` in `lib/contest/types.ts` which is used for active
 * contest session validation (dupe checking, multiplier tracking, etc.).
 */
export interface ContestCalendarContext {
  /** Contests whose window contains the current UTC time */
  activeContests: ContestCalendarEntry[];

  /** Contests starting within the next 30 days */
  upcomingContests: ContestCalendarEntry[];

  /** True when at least one contest is currently active */
  isContestWeekend: boolean;

  /** Union of all bands used by currently active contests */
  contestBands: Set<string>;

  /** WARC bands plus any HF bands NOT currently in use by active contests */
  quietBands: string[];

  /** The soonest upcoming contest (null if none in the next 30 days) */
  nextContest: ContestCalendarEntry | null;
}
