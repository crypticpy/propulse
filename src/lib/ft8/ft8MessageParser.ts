/**
 * FT8/FT4 message text parser.
 *
 * Extracts callsign, grid, and CQ info from decoded FT8/FT4 message strings.
 * This is the shared-module equivalent of the parsing logic in bridge/src/wsjtx.ts
 * so the browser-side native decoder can use the same extraction without importing
 * Node-only bridge code.
 *
 * Supports standard FT8/FT4 formats plus Fox/Hound compound and multi-signal
 * messages used in DXpedition mode.
 */

// ============================================================================
// Regexes (mirrored from bridge/src/wsjtx.ts)
// ============================================================================

/** CQ [directed] CALLSIGN GRID */
const CQ_REGEX =
  /^CQ\s+(?:(\w{2,4})\s+)?([A-Z0-9/]{3,})\s+([A-R]{2}\d{2}(?:[a-x]{2})?)$/i;

/** CALL1 CALL2 GRID */
const QSO_GRID_REGEX =
  /^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+([A-R]{2}\d{2}(?:[a-x]{2})?)$/i;

/** CALL1 CALL2 REPORT (e.g. +05, -15, R+05, R-15, RR73, RRR, 73) */
const QSO_REPORT_REGEX =
  /^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+(R?[+-]\d{2}|RR73|RRR|73)$/i;

/** Fox/Hound Type 1: <CALL1> CALL2 GRID or REPORT */
const COMPOUND_REGEX = /^<([A-Z0-9/]{3,})>\s+([A-Z0-9/]{3,})\s+(.+)$/i;

/** Grid locator pattern for distinguishing grid vs report in compound messages */
const GRID_PATTERN = /^[A-R]{2}\d{2}(?:[a-x]{2})?$/i;

/** Report pattern for compound message group 3 */
const REPORT_PATTERN = /^(?:R?[+-]\d{2}|RR73|RRR|73)$/i;

/** Fox multi-signal segment: CALL1 CALL2 REPORT/GRID (with optional angle brackets) */
const FOX_SEGMENT_REGEX = /^([A-Z0-9/<>]{3,})\s+([A-Z0-9/]{3,})\s+(.+)$/i;

/** Quick check: does the message start with "CQ"? */
const CQ_PREFIX = /^CQ\s/i;

// ============================================================================
// Types
// ============================================================================

/** A single Fox multi-call pair extracted from semicolon-separated segments */
export interface FoxCallPair {
  sender: string;
  receiver: string;
  report: string;
}

export interface ExtractedCallInfo {
  /** The extracted remote callsign (CQ caller or QSO partner) */
  callsign?: string;
  /** Maidenhead grid locator (4 or 6 chars) when present */
  grid?: string;
  /** True if this is a CQ call */
  isCQ?: boolean;
  /** Directed CQ qualifier, e.g. "DX", "NA", "EU" from "CQ DX K1ABC ..." */
  cqDirection?: string;
  /** Signal report string (e.g. "+05", "-15", "R-12", "RR73", "73") */
  signalReport?: string;
  /** Sender callsign (CALL1 in QSO messages, same as callsign for CQ) */
  senderCallsign?: string;
  /** True if this is a Fox/Hound Type 1 compound message with angle brackets */
  isCompound?: boolean;
  /** True if this is a Fox multi-signal message (semicolon-separated pairs) */
  isFoxMulti?: boolean;
  /** Parsed call pairs from Fox multi-signal messages */
  foxCallPairs?: FoxCallPair[];
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Extract callsign, grid, and CQ info from a decoded FT8/FT4 message.
 *
 * Supports these message formats (checked in order):
 *   1. Fox multi-signal:  CALL1 CALL2 RPT; CALL3 CALL4 RPT
 *   2. Fox/Hound Type 1:  <CALL1> CALL2 GRID/REPORT
 *   3. CQ [directed] CALLSIGN GRID
 *   4. CALL1 CALL2 GRID
 *   5. CALL1 CALL2 REPORT
 *
 * Returns an empty object for messages that don't match any known pattern
 * (free text, telemetry, etc.).
 */
export function extractCallInfo(message: string): ExtractedCallInfo {
  const trimmed = message.trim();

  // ── Fox multi-signal format (semicolon-separated pairs) ────────────────
  if (trimmed.includes(";")) {
    const segments = trimmed
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length >= 2) {
      const pairs: FoxCallPair[] = [];
      for (const seg of segments) {
        const parts = seg.match(FOX_SEGMENT_REGEX);
        if (parts) {
          pairs.push({
            sender: parts[1].replace(/[<>]/g, ""),
            receiver: parts[2],
            report: parts[3],
          });
        }
      }
      if (pairs.length >= 2) {
        return {
          callsign: pairs[0].receiver,
          senderCallsign: pairs[0].sender,
          signalReport: pairs[0].report,
          isFoxMulti: true,
          foxCallPairs: pairs,
        };
      }
    }
  }

  // ── Fox/Hound Type 1: <CALL1> CALL2 GRID or REPORT ────────────────────
  const compoundMatch = trimmed.match(COMPOUND_REGEX);
  if (compoundMatch) {
    const thirdField = compoundMatch[3].trim();
    const isGrid = GRID_PATTERN.test(thirdField);
    const isReport = REPORT_PATTERN.test(thirdField);
    return {
      callsign: compoundMatch[2],
      senderCallsign: compoundMatch[1],
      grid: isGrid ? thirdField : undefined,
      signalReport: isReport ? thirdField : undefined,
      isCompound: true,
    };
  }

  // ── CQ [directed] CALL GRID ────────────────────────────────────────────
  const cqMatch = trimmed.match(CQ_REGEX);
  if (cqMatch) {
    return {
      callsign: cqMatch[2],
      grid: cqMatch[3],
      isCQ: true,
      cqDirection: cqMatch[1] ?? undefined,
      senderCallsign: cqMatch[2],
    };
  }

  // ── CALL1 CALL2 GRID ──────────────────────────────────────────────────
  const gridMatch = trimmed.match(QSO_GRID_REGEX);
  if (gridMatch) {
    return {
      callsign: gridMatch[2],
      grid: gridMatch[3],
      senderCallsign: gridMatch[1],
    };
  }

  // ── CALL1 CALL2 REPORT ────────────────────────────────────────────────
  const reportMatch = trimmed.match(QSO_REPORT_REGEX);
  if (reportMatch) {
    return {
      callsign: reportMatch[2],
      signalReport: reportMatch[3],
      senderCallsign: reportMatch[1],
    };
  }

  return {};
}

/**
 * Check whether a decoded FT8/FT4 message is a CQ call.
 *
 * This is a lightweight check that avoids full regex parsing when only the
 * CQ/non-CQ distinction is needed.
 */
export function isCQMessage(message: string): boolean {
  return CQ_PREFIX.test(message.trim());
}
