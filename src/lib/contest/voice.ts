/**
 * Contest Voice Helpers
 *
 * Provides lightweight utilities for client-side voice entry:
 * - Web Speech API availability detection
 * - Transcript normalization into plausible one-line entry candidates
 *
 * Notes:
 * - This is a best-effort helper meant to coexist with manual typing.
 * - Candidate generation is intentionally conservative; operator confirmation is required.
 */

const NATO_TO_LETTER: Record<string, string> = {
  alfa: "A",
  alpha: "A",
  bravo: "B",
  charlie: "C",
  delta: "D",
  echo: "E",
  foxtrot: "F",
  golf: "G",
  hotel: "H",
  india: "I",
  juliett: "J",
  juliet: "J",
  kilo: "K",
  lima: "L",
  mike: "M",
  november: "N",
  oscar: "O",
  papa: "P",
  quebec: "Q",
  romeo: "R",
  sierra: "S",
  tango: "T",
  uniform: "U",
  victor: "V",
  whiskey: "W",
  whisky: "W",
  xray: "X",
  "x-ray": "X",
  yankee: "Y",
  zulu: "Z",
};

const WORD_TO_DIGIT: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  tree: "3",
  four: "4",
  for: "4",
  five: "5",
  fife: "5",
  six: "6",
  sex: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
  niner: "9",
};

function tokenizeTranscript(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function mapToken(token: string): string | null {
  if (!token) return null;

  if (token === "/" || token === "slash" || token === "stroke") {
    return "/";
  }

  const nato = NATO_TO_LETTER[token];
  if (nato) return nato;

  const digit = WORD_TO_DIGIT[token];
  if (digit) return digit;

  // Already a compact alphanumeric token (e.g., "k3lr", "599", "eny")
  if (/^[a-z0-9/]+$/i.test(token)) {
    return token.toUpperCase();
  }

  return null;
}

function mergeSingleCharRuns(tokens: string[]): string[] {
  const merged: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf) merged.push(buf);
    buf = "";
  };

  for (const t of tokens) {
    if (t === "/") {
      flush();
      merged.push("/");
      continue;
    }

    // Merge single-character alphanumerics into a run (ENY, 599, etc.)
    if (/^[A-Z0-9]$/.test(t)) {
      buf += t;
      continue;
    }

    flush();
    merged.push(t);
  }

  flush();
  return merged.filter((t) => t !== "/");
}

function buildCallsign(mappedTokens: string[]): {
  callsign: string | null;
  rest: string[];
} {
  if (mappedTokens.length === 0) {
    return { callsign: null, rest: [] };
  }

  // If the first token already looks like a callsign, trust it.
  const first = mappedTokens[0];
  if (/[A-Z]/.test(first) && /\d/.test(first) && first.length >= 3) {
    return { callsign: first.replace(/[^A-Z0-9/]/g, ""), rest: mappedTokens.slice(1) };
  }

  const callChars: string[] = [];
  let hasDigit = false;
  let hasLetter = false;
  let callEndIndex = -1;

  for (let i = 0; i < mappedTokens.length; i++) {
    const t = mappedTokens[i];
    if (!t) continue;

    // Prefer single-character assembly (K 3 L R => K3LR)
    if (/^[A-Z0-9]$/.test(t)) {
      callChars.push(t);
    } else {
      // Non-single token ends callsign assembly
      if (callChars.length === 0) {
        callChars.push(t);
      }
      callEndIndex = i;
      break;
    }

    hasDigit ||= /\d/.test(t);
    hasLetter ||= /[A-Z]/.test(t);

    const candidate = callChars.join("");
    if (hasDigit && hasLetter && candidate.length >= 3) {
      const next = mappedTokens[i + 1];
      // If the next token is a single-character token, keep consuming to avoid
      // truncating spelled callsigns like "K 3 L R" -> "K3LR".
      //
      // Stop early when the next token likely begins the exchange (digits),
      // or when the next token is not a single-character token.
      if (!next || !/^[A-Z0-9]$/.test(next) || /^[0-9]$/.test(next)) {
        callEndIndex = i;
        break;
      }
    }
  }

  if (callEndIndex === -1) {
    callEndIndex = mappedTokens.length - 1;
  }

  const callsign = callChars.join("").replace(/[^A-Z0-9/]/g, "");
  if (!callsign || callsign.length < 2) {
    return { callsign: null, rest: mappedTokens };
  }

  return {
    callsign,
    rest: mappedTokens.slice(callEndIndex + 1),
  };
}

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

export interface SpeechRecognitionResultLike
  extends ArrayLike<SpeechRecognitionAlternativeLike> {
  isFinal: boolean;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike {
  error?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Generate plausible one-line entry candidates from a transcript.
 *
 * Always returns at least one candidate if transcript is non-empty.
 */
export function transcriptToOneLineCandidates(transcript: string): string[] {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const tokens = tokenizeTranscript(trimmed);
  const mapped = tokens.map(mapToken).filter((t): t is string => Boolean(t));
  const { callsign, rest } = buildCallsign(mapped);

  const candidates: string[] = [];

  // Candidate 1: callsign + merged remainder
  if (callsign) {
    const mergedRest = mergeSingleCharRuns(rest);
    const line = [callsign, ...mergedRest].join(" ").replace(/\s+/g, " ").trim();
    if (line) candidates.push(line);
  }

  // Candidate 2: raw transcript (uppercased), as a manual-edit fallback
  candidates.push(trimmed.toUpperCase().replace(/\s+/g, " "));

  // De-dupe preserving order
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
