/**
 * FT8 alert matcher — pure function module for matching enriched decodes
 * against configurable alert rules.
 *
 * Used by the background monitoring subsystem to fire notifications, sounds,
 * and visual highlights when interesting stations appear on the band.
 *
 * All functions are side-effect free; callers handle sound/notification dispatch.
 */

import type { Ft8AlertRule } from "@/stores/ft8SessionStore";

// ─── Public types ────────────────────────────────────────────────────────────

/** A single decode's fields relevant to alert matching. */
export interface Ft8AlertDecode {
  callsign?: string;
  grid?: string;
  dxcc?: number;
  country?: string;
  cqZone?: number;
  continent?: string;
  /** US state abbreviation (e.g. "CA", "TX") — available on enriched decodes */
  state?: string;
  snr: number;
  isCQ: boolean;
  isNew: boolean;
  isNeeded: boolean;
  message: string;
}

/** Result of matching a decode against alert rules. */
export interface Ft8AlertMatch {
  /** The rule that matched */
  rule: Ft8AlertRule;
  /** Human-readable description of the match */
  description: string;
  /** The callsign from the decode that triggered the match */
  callsign: string;
  /** Priority level derived from rule type */
  priority: "info" | "warning" | "critical";
}

// ─── Rule priority mapping ───────────────────────────────────────────────────

const RULE_PRIORITY: Record<Ft8AlertRule["type"], Ft8AlertMatch["priority"]> = {
  new_dxcc: "critical",
  new_grid: "warning",
  new_state: "warning",
  specific_callsign: "critical",
  specific_dxcc: "warning",
  snr_above: "info",
};

// ─── Wildcard callsign matching ──────────────────────────────────────────────

/**
 * Match a callsign against a pattern that may include a trailing wildcard "*".
 * Case-insensitive. Examples:
 *   "K1ABC" matches "K1ABC", "k1abc", "K1*"
 *   "VK9NT" matches "VK9*", "VK*"
 */
function matchCallsignPattern(callsign: string, pattern: string): boolean {
  const upper = callsign.toUpperCase();
  const pat = pattern.toUpperCase().trim();

  if (pat.endsWith("*")) {
    const prefix = pat.slice(0, -1);
    return upper.startsWith(prefix);
  }
  return upper === pat;
}

// ─── Individual rule matchers ────────────────────────────────────────────────

function matchNewDxcc(
  decode: Ft8AlertDecode,
  _rule: Ft8AlertRule,
  neededDxcc?: Set<number>,
): string | null {
  if (!decode.isCQ) return null;
  if (decode.dxcc == null || !neededDxcc?.has(decode.dxcc)) return null;

  const label = decode.country ?? `DXCC #${decode.dxcc}`;
  const call = decode.callsign ?? "???";
  return `New DXCC: ${call} (${label}) calling CQ on FT8`;
}

function matchNewGrid(
  decode: Ft8AlertDecode,
  _rule: Ft8AlertRule,
  neededGrids?: Set<string>,
): string | null {
  if (!decode.isCQ) return null;
  if (!decode.grid || !neededGrids) return null;

  const grid4 = decode.grid.substring(0, 4).toUpperCase();
  if (!neededGrids.has(grid4)) return null;

  const call = decode.callsign ?? "???";
  return `Needed grid: ${grid4} \u2014 ${call} calling CQ`;
}

function matchNewState(
  decode: Ft8AlertDecode,
  _rule: Ft8AlertRule,
  neededStates?: Set<string>,
): string | null {
  if (!decode.isCQ) return null;
  if (!neededStates || neededStates.size === 0) return null;

  // Use the state field from the enriched decode when available
  const state = decode.state?.toUpperCase();
  if (!state || !neededStates.has(state)) return null;

  const call = decode.callsign ?? "???";
  return `Needed state: ${state} \u2014 ${call} calling CQ`;
}

function matchSpecificCallsign(
  decode: Ft8AlertDecode,
  rule: Ft8AlertRule,
): string | null {
  if (!decode.callsign || rule.value == null) return null;

  const pattern = String(rule.value);
  if (!matchCallsignPattern(decode.callsign, pattern)) return null;

  return `Target callsign: ${decode.callsign} spotted on FT8`;
}

function matchSpecificDxcc(
  decode: Ft8AlertDecode,
  rule: Ft8AlertRule,
): string | null {
  if (!decode.isCQ) return null;
  if (decode.dxcc == null || rule.value == null) return null;

  const targetDxcc = Number(rule.value);
  if (decode.dxcc !== targetDxcc) return null;

  const label = decode.country ?? `DXCC #${decode.dxcc}`;
  const call = decode.callsign ?? "???";
  return `DXCC match: ${call} (${label}) calling CQ`;
}

function matchSnrAbove(
  decode: Ft8AlertDecode,
  rule: Ft8AlertRule,
): string | null {
  if (rule.value == null) return null;

  const threshold = Number(rule.value);
  if (decode.snr < threshold) return null;

  const call = decode.callsign ?? "???";
  const sign = decode.snr >= 0 ? "+" : "";
  return `Strong signal: ${call} at ${sign}${decode.snr} dB`;
}

// ─── Matcher dispatch ────────────────────────────────────────────────────────

type RuleMatcher = (
  decode: Ft8AlertDecode,
  rule: Ft8AlertRule,
  neededDxcc?: Set<number>,
  neededGrids?: Set<string>,
  neededStates?: Set<string>,
) => string | null;

const MATCHERS: Record<Ft8AlertRule["type"], RuleMatcher> = {
  new_dxcc: (d, r, dxcc) => matchNewDxcc(d, r, dxcc),
  new_grid: (d, r, _dxcc, grids) => matchNewGrid(d, r, grids),
  new_state: (d, r, _dxcc, _grids, states) => matchNewState(d, r, states),
  specific_callsign: (d, r) => matchSpecificCallsign(d, r),
  specific_dxcc: (d, r) => matchSpecificDxcc(d, r),
  snr_above: (d, r) => matchSnrAbove(d, r),
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Match a single enriched decode against a set of alert rules.
 * Returns all matching rules (a decode can match multiple rules).
 */
export function matchFt8Alerts(
  decode: Ft8AlertDecode,
  rules: Ft8AlertRule[],
  neededDxcc?: Set<number>,
  neededGrids?: Set<string>,
  neededStates?: Set<string>,
): Ft8AlertMatch[] {
  const matches: Ft8AlertMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const matcher = MATCHERS[rule.type];
    if (!matcher) continue;

    const description = matcher(
      decode,
      rule,
      neededDxcc,
      neededGrids,
      neededStates,
    );
    if (description == null) continue;

    matches.push({
      rule,
      description,
      callsign: decode.callsign ?? "",
      priority: RULE_PRIORITY[rule.type],
    });
  }

  return matches;
}

/**
 * Batch-match multiple decodes against rules. Returns unique matches
 * (deduped by rule ID + callsign to avoid spamming for the same station).
 */
export function batchMatchFt8Alerts(
  decodes: Ft8AlertDecode[],
  rules: Ft8AlertRule[],
  neededDxcc?: Set<number>,
  neededGrids?: Set<string>,
  neededStates?: Set<string>,
): Ft8AlertMatch[] {
  const seen = new Set<string>();
  const results: Ft8AlertMatch[] = [];

  for (const decode of decodes) {
    const matches = matchFt8Alerts(
      decode,
      rules,
      neededDxcc,
      neededGrids,
      neededStates,
    );

    for (const match of matches) {
      const key = `${match.rule.id}::${match.callsign.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(match);
    }
  }

  return results;
}
