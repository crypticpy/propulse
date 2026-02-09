/**
 * Share Code Utilities for Guest Logging
 * Generates and validates share codes for guest session access
 */

// Consonants only (no vowels) to avoid offensive words
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";

// Rate limiting constants
const RATE_LIMIT_KEY = "propulse-guest-attempts";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

/**
 * Generate a share code in format XXX-NNN (e.g., "KWB-742")
 */
export function generateShareCode(): string {
  const rand = new Uint32Array(4);
  crypto.getRandomValues(rand);
  const letters = Array.from(
    { length: 3 },
    (_, i) => CONSONANTS[rand[i] % CONSONANTS.length],
  ).join("");
  const digits = String(rand[3] % 1000).padStart(3, "0");
  return `${letters}-${digits}`;
}

/**
 * Validate share code format
 */
export function isValidShareCode(code: string): boolean {
  const pattern = /^[BCDFGHJKLMNPQRSTVWXYZ]{3}-\d{3}$/;
  return pattern.test(code.toUpperCase());
}

/**
 * Format share code as user types (auto-uppercase, auto-hyphen)
 */
export function formatShareCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length <= 3) {
    return cleaned;
  }
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}`;
}

interface RateLimitData {
  attempts: number;
  lockedUntil: number | null;
}

function getRateLimitData(): RateLimitData {
  try {
    const data = localStorage.getItem(RATE_LIMIT_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch {
    // Ignore parse errors
  }
  return { attempts: 0, lockedUntil: null };
}

function setRateLimitData(data: RateLimitData): void {
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Check if rate limit allows another attempt
 */
export function checkRateLimit(): { allowed: boolean; lockedUntil?: number } {
  const data = getRateLimitData();

  if (data.lockedUntil && Date.now() < data.lockedUntil) {
    return { allowed: false, lockedUntil: data.lockedUntil };
  }

  // Lockout expired, reset
  if (data.lockedUntil && Date.now() >= data.lockedUntil) {
    resetRateLimit();
    return { allowed: true };
  }

  return { allowed: data.attempts < MAX_ATTEMPTS };
}

/**
 * Record a failed validation attempt
 */
export function recordFailedAttempt(): void {
  const data = getRateLimitData();
  data.attempts += 1;

  if (data.attempts >= MAX_ATTEMPTS) {
    data.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
  }

  setRateLimitData(data);
}

/**
 * Reset rate limit (call on successful validation)
 */
export function resetRateLimit(): void {
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {
    // Ignore
  }
}
