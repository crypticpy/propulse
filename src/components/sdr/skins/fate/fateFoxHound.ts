/**
 * fateFoxHound — Pure detection functions for Fox/Hound DXpedition operation.
 *
 * Fox/Hound is a specialised WSJT-X protocol for DXpeditions:
 *   - Fox (the rare station) transmits at 300-900 Hz
 *   - Hound (the caller) transmits at 1000-4000 Hz
 *   - Fox can send multi-call messages: "CALL1 CALL2 RPT; CALL3 CALL4 RPT"
 *   - Fox Type 1 messages use angle brackets: "<CALL> HOUND REPORT"
 *   - SuperFox (WSJT-X 2.7+) can address up to 9 Hounds per slot
 *
 * All functions are pure (no React/Zustand dependencies) and designed for
 * use in the useFateDecodes enrichment pipeline.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FoxCallPair {
  fox: string;
  hound: string;
  report: string;
}

// ─── Regexes ────────────────────────────────────────────────────────────────

/** Matches a Fox multi-call segment: CALL1 CALL2 REPORT (with optional angle brackets on CALL1) */
const FOX_SEGMENT_RE =
  /^<?([A-Z0-9/]{3,})>?\s+([A-Z0-9/]{3,})\s+(R?[+-]\d{2}|RR73|RRR|73)$/i;

/** QSO-style message: CALL1 CALL2 GRID-or-REPORT */
const QSO_MSG_RE = /^([A-Z0-9/]{3,})\s+([A-Z0-9/]{3,})\s+(.+)$/i;

// ─── isFoxMessage ───────────────────────────────────────────────────────────

/**
 * Check if a message is a Fox multi-call or Fox Type 1 (compound) format.
 *
 * Fox multi-call: "K1ABC W2XYZ RR73; K1ABC W3DEF RR73"
 * Fox Type 1:     "<K1ABC> W2XYZ +05"
 *
 * Returns true if the message matches either pattern.
 */
export function isFoxMessage(message: string): boolean {
  const trimmed = message.trim();

  // Multi-call: contains semicolons with at least 2 valid segments
  if (trimmed.includes(";")) {
    const segments = trimmed
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length >= 2) {
      const validCount = segments.filter((seg) =>
        FOX_SEGMENT_RE.test(seg),
      ).length;
      if (validCount >= 2) return true;
    }
  }

  // Type 1 compound: starts with angle-bracketed callsign
  if (/^<[A-Z0-9/]{3,}>\s+/i.test(trimmed)) {
    return true;
  }

  return false;
}

// ─── parseFoxMessage ────────────────────────────────────────────────────────

/**
 * Parse a Fox multi-call or compound message into individual call pairs.
 *
 * Input: "K1ABC W2XYZ RR73; K1ABC W3DEF RR73"
 * Output: [{ fox: "K1ABC", hound: "W2XYZ", report: "RR73" }, ...]
 *
 * For Type 1 compound messages ("<CALL1> CALL2 REPORT"), returns a single pair.
 * Returns an empty array if the message doesn't match Fox patterns.
 */
export function parseFoxMessage(message: string): FoxCallPair[] {
  const trimmed = message.trim();
  const pairs: FoxCallPair[] = [];

  // Multi-call: semicolon-separated segments
  if (trimmed.includes(";")) {
    const segments = trimmed
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const seg of segments) {
      const m = seg.match(FOX_SEGMENT_RE);
      if (m) {
        pairs.push({
          fox: m[1].toUpperCase(),
          hound: m[2].toUpperCase(),
          report: m[3],
        });
      }
    }

    if (pairs.length >= 2) return pairs;
    // If less than 2 valid segments, fall through to compound check
    pairs.length = 0;
  }

  // Type 1 compound: <CALL1> CALL2 REPORT
  const compoundMatch = trimmed.match(
    /^<([A-Z0-9/]{3,})>\s+([A-Z0-9/]{3,})\s+(R?[+-]\d{2}|RR73|RRR|73)$/i,
  );
  if (compoundMatch) {
    pairs.push({
      fox: compoundMatch[1].toUpperCase(),
      hound: compoundMatch[2].toUpperCase(),
      report: compoundMatch[3],
    });
  }

  return pairs;
}

// ─── detectDxpedition ───────────────────────────────────────────────────────

/**
 * Analyze a batch of decodes to detect if a DXpedition (Fox) is active.
 *
 * Heuristic: if many unique callsigns are directing messages at a single
 * callsign within a time window, that callsign is likely a Fox.
 *
 * Also considers explicit Fox multi-call messages as strong evidence.
 *
 * @param decodes  Array of enriched decode-like objects with message, parsedCallsign, and epochMs
 * @param windowMs Time window in ms to consider (default 60000 = 1 minute)
 * @param threshold Minimum unique hounds required to declare a DXpedition (default 5)
 * @returns The suspected Fox callsign (uppercase), or null
 */
export function detectDxpedition(
  decodes: Array<{
    message: string;
    parsedCallsign: string | null;
    epochMs: number;
  }>,
  windowMs: number = 60000,
  threshold: number = 5,
): string | null {
  if (decodes.length === 0) return null;

  // Find the most recent decode time to define the analysis window. Uses
  // epochMs (absolute), not the midnight-wrapping time, so the window doesn't
  // exclude the newest decodes right after 00:00 UTC.
  let maxTime = 0;
  for (const d of decodes) {
    if (d.epochMs > maxTime) maxTime = d.epochMs;
  }
  const windowStart = maxTime - windowMs;

  // Track receiver callsign -> set of unique sender callsigns
  const receiverToSenders = new Map<string, Set<string>>();

  // Also check for explicit Fox multi-call messages (strong signal)
  const foxMultiCallsigns = new Map<string, number>();

  for (const d of decodes) {
    if (d.epochMs < windowStart) continue;

    const msg = d.message.trim();

    // Check for explicit Fox multi-call messages
    const foxPairs = parseFoxMessage(msg);
    if (foxPairs.length >= 2) {
      const foxCall = foxPairs[0].fox;
      foxMultiCallsigns.set(foxCall, (foxMultiCallsigns.get(foxCall) ?? 0) + 1);
    }

    // Parse directed messages: CALL1 CALL2 GRID/REPORT
    // The receiver (CALL2) is who they're calling
    const qsoMatch = msg.match(QSO_MSG_RE);
    if (qsoMatch) {
      const sender = qsoMatch[1].replace(/[<>]/g, "").toUpperCase();
      const receiver = qsoMatch[2].toUpperCase();

      // Skip CQ messages — they aren't directed at a specific station
      if (sender === "CQ") continue;

      if (!receiverToSenders.has(receiver)) {
        receiverToSenders.set(receiver, new Set());
      }
      receiverToSenders.get(receiver)!.add(sender);
    }
  }

  // If we saw explicit Fox multi-call messages, that's the strongest signal
  if (foxMultiCallsigns.size > 0) {
    let bestFox: string | null = null;
    let bestCount = 0;
    for (const [call, count] of foxMultiCallsigns) {
      if (count > bestCount) {
        bestCount = count;
        bestFox = call;
      }
    }
    if (bestFox) return bestFox;
  }

  // Otherwise, find the callsign that the most unique senders are targeting
  let bestReceiver: string | null = null;
  let bestUniqueCount = 0;
  for (const [receiver, senders] of receiverToSenders) {
    if (senders.size > bestUniqueCount) {
      bestUniqueCount = senders.size;
      bestReceiver = receiver;
    }
  }

  if (bestReceiver && bestUniqueCount >= threshold) {
    return bestReceiver;
  }

  return null;
}

// ─── isHoundResponse ────────────────────────────────────────────────────────

/**
 * Check if a message is a Hound response directed at a specific Fox callsign.
 *
 * Hound sends messages like:
 *   "FOXCALL HOUNDCALL EM48"
 *   "FOXCALL HOUNDCALL -05"
 *   "FOXCALL HOUNDCALL R-12"
 *   "FOXCALL HOUNDCALL RR73"
 *
 * @param message  The decoded message text
 * @param foxCallsign The suspected Fox callsign to check against
 * @returns True if the message is directed at the Fox callsign
 */
export function isHoundResponse(message: string, foxCallsign: string): boolean {
  const trimmed = message.trim();
  const foxUpper = foxCallsign.toUpperCase();

  // Match: CALL1 CALL2 ANYTHING — where CALL2 matches the Fox
  const qsoMatch = trimmed.match(QSO_MSG_RE);
  if (!qsoMatch) return false;

  const sender = qsoMatch[1].replace(/[<>]/g, "").toUpperCase();
  const receiver = qsoMatch[2].toUpperCase();

  // Hound sends: FOXCALL HOUNDCALL GRID/REPORT — Fox is the receiver (CALL2 position)
  // Actually in FT8, the sender is CALL1 and receiver is CALL2.
  // A Hound response TO the Fox would be: HOUNDCALL FOXCALL REPORT
  // But also could be: FOXCALL HOUNDCALL REPORT (if Fox is acknowledging)
  // The question is about Hound responses — the Hound sends TO the Fox.
  // Standard format: SENDER RECEIVER REPORT => HOUND FOX REPORT
  // So Fox callsign appears as the RECEIVER (CALL2)
  if (receiver === foxUpper && sender !== "CQ") {
    return true;
  }

  return false;
}
