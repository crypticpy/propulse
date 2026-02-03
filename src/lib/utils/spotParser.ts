/**
 * Spot Comment Parser Utilities
 *
 * Parses DX cluster spot comments for split operation indicators.
 * Split operation means the DX station is transmitting on a different
 * frequency than they are listening on.
 *
 * Common patterns:
 * - UP 5: Listen 5 kHz up from spotted frequency
 * - DN 10: Listen 10 kHz down from spotted frequency
 * - UP 5-10: Listen 5-10 kHz up (range)
 * - QSX 14205: Explicit listening frequency in kHz
 */

/**
 * Parsed split operation information from a spot comment
 */
export interface SplitInfo {
  /** Whether split operation is indicated */
  isSplit: boolean;
  /** Direction of split: 'up' = listen higher, 'down' = listen lower */
  direction?: "up" | "down";
  /** Offset in kHz (e.g., 5 means 5 kHz) */
  offset?: number;
  /** Explicit QSX frequency in kHz (e.g., 14205) */
  frequency?: number;
  /** Minimum offset for range (e.g., 5 in "UP 5-10") */
  rangeMin?: number;
  /** Maximum offset for range (e.g., 10 in "UP 5-10") */
  rangeMax?: number;
  /** Original matched text from comment */
  raw?: string;
}

/**
 * Parse a spot comment for split operation indicators
 *
 * Handles various formats commonly seen in DX cluster spots:
 * - "UP 5" or "UP5" - Listen 5 kHz up
 * - "UP 5-10" or "UP5-10" - Listen 5-10 kHz up
 * - "DN 5" or "DN5" or "DOWN 5" - Listen 5 kHz down
 * - "QSX 14205" or "QSX 14.205" - Explicit listening frequency
 * - Combined patterns like "CQ UP 5" or "TNX QSX 14205"
 *
 * @param comment - The spot comment string to parse
 * @returns SplitInfo object with parsed split details
 *
 * @example
 * ```ts
 * parseSplitFromComment("CQ UP 5");
 * // { isSplit: true, direction: 'up', offset: 5, raw: 'UP 5' }
 *
 * parseSplitFromComment("QSX 14205");
 * // { isSplit: true, frequency: 14205, raw: 'QSX 14205' }
 *
 * parseSplitFromComment("UP 5-10");
 * // { isSplit: true, direction: 'up', rangeMin: 5, rangeMax: 10, raw: 'UP 5-10' }
 *
 * parseSplitFromComment("Good signal");
 * // { isSplit: false }
 * ```
 */
export function parseSplitFromComment(comment: string): SplitInfo {
  if (!comment) {
    return { isSplit: false };
  }

  const upperComment = comment.toUpperCase();

  // Match UP patterns: UP 5, UP5, UP 5-10, UP5-10
  // Also handles variations like "U 5" or "U5"
  const upMatch = upperComment.match(
    /\bU(?:P)?\s*(\d+)(?:\s*[-/]\s*(\d+))?(?:\b|$)/,
  );

  // Match DOWN/DN patterns: DN 5, DN5, DOWN 5, DOWN5, DN 5-10
  const dnMatch = upperComment.match(
    /\bD(?:OWN|N)?\s*(\d+)(?:\s*[-/]\s*(\d+))?(?:\b|$)/,
  );

  // Match QSX patterns: QSX 14205, QSX 14.205, QSX 7125.5
  // QSX indicates explicit listening frequency
  const qsxMatch = upperComment.match(/\bQSX\s*(\d+\.?\d*)(?:\b|$)/);

  // Priority: QSX (most specific) > UP > DN
  if (qsxMatch) {
    const frequency = parseFloat(qsxMatch[1]);
    return {
      isSplit: true,
      frequency,
      raw: qsxMatch[0].trim(),
    };
  }

  if (upMatch) {
    const offset = parseInt(upMatch[1], 10);
    const rangeMax = upMatch[2] ? parseInt(upMatch[2], 10) : undefined;

    return {
      isSplit: true,
      direction: "up",
      offset,
      rangeMin: rangeMax ? offset : undefined,
      rangeMax,
      raw: upMatch[0].trim(),
    };
  }

  if (dnMatch) {
    const offset = parseInt(dnMatch[1], 10);
    const rangeMax = dnMatch[2] ? parseInt(dnMatch[2], 10) : undefined;

    return {
      isSplit: true,
      direction: "down",
      offset,
      rangeMin: rangeMax ? offset : undefined,
      rangeMax,
      raw: dnMatch[0].trim(),
    };
  }

  return { isSplit: false };
}

/**
 * Format split info for display
 *
 * Creates a short, readable string representation of split info.
 *
 * @param split - Parsed SplitInfo object
 * @returns Formatted string (e.g., "↑5", "↑5-10", "QSX 14205")
 *
 * @example
 * ```ts
 * formatSplitInfo({ isSplit: true, direction: 'up', offset: 5 });
 * // "↑5"
 *
 * formatSplitInfo({ isSplit: true, direction: 'up', rangeMin: 5, rangeMax: 10 });
 * // "↑5-10"
 *
 * formatSplitInfo({ isSplit: true, frequency: 14205 });
 * // "QSX 14205"
 * ```
 */
export function formatSplitInfo(split: SplitInfo): string {
  if (!split.isSplit) {
    return "";
  }

  // QSX explicit frequency
  if (split.frequency != null) {
    // Format large frequencies (likely in kHz) vs small (likely in MHz)
    if (split.frequency >= 1000) {
      return `QSX ${split.frequency}`;
    }
    return `QSX ${split.frequency.toFixed(3)}`;
  }

  // Directional split (UP/DN)
  if (split.direction && split.offset != null) {
    const arrow = split.direction === "up" ? "↑" : "↓";

    // Handle range (e.g., UP 5-10)
    if (split.rangeMax != null && split.rangeMin != null) {
      return `${arrow}${split.rangeMin}-${split.rangeMax}`;
    }

    return `${arrow}${split.offset}`;
  }

  return "";
}

/**
 * Get a detailed tooltip description for split info
 *
 * Creates a human-readable explanation of the split operation.
 *
 * @param split - Parsed SplitInfo object
 * @returns Detailed description string for tooltip
 *
 * @example
 * ```ts
 * getSplitTooltip({ isSplit: true, direction: 'up', offset: 5 });
 * // "Split: Listen 5 kHz UP from spotted frequency"
 * ```
 */
export function getSplitTooltip(split: SplitInfo): string {
  if (!split.isSplit) {
    return "";
  }

  if (split.frequency != null) {
    if (split.frequency >= 1000) {
      return `Split: Listen on ${split.frequency} kHz`;
    }
    return `Split: Listen on ${split.frequency.toFixed(3)} MHz`;
  }

  if (split.direction && split.offset != null) {
    const dir = split.direction === "up" ? "UP" : "DOWN";

    if (split.rangeMax != null && split.rangeMin != null) {
      return `Split: Listen ${split.rangeMin}-${split.rangeMax} kHz ${dir} from spotted frequency`;
    }

    return `Split: Listen ${split.offset} kHz ${dir} from spotted frequency`;
  }

  return "Split operation indicated";
}
