export class SolarValidationError extends Error {
  readonly reason: "schema" | "empty" | "channel" | "timestamp";

  constructor(
    message: string,
    reason: SolarValidationError["reason"] = "schema",
  ) {
    super(message);
    this.name = "SolarValidationError";
    this.reason = reason;
  }
}

export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseUtcInstant(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}$/.test(trimmed)
    ? `${trimmed}-01T00:00:00Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
      ? trimmed
      : `${trimmed}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export interface NormalizeSeriesOptions<T> {
  timestamp: (row: T) => unknown;
  isValid?: (row: T) => boolean;
  maxRows: number;
  windowMs?: number;
  now?: number;
  maxFutureMs?: number;
  required?: boolean;
}

export function normalizeTimeSeries<T>(
  rows: readonly T[],
  options: NormalizeSeriesOptions<T>,
): T[] {
  const now = options.now ?? Date.now();
  const maxFutureMs = options.maxFutureMs ?? 10 * 60_000;
  const parsed = rows
    .map((row, position) => ({
      row,
      position,
      timestamp: parseUtcInstant(options.timestamp(row)),
    }))
    .filter(
      (entry): entry is { row: T; position: number; timestamp: number } =>
        entry.timestamp !== null &&
        entry.timestamp <= now + maxFutureMs &&
        (options.isValid?.(entry.row) ?? true),
    )
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp || left.position - right.position,
    );

  const unique = new Map<number, T>();
  for (const entry of parsed) unique.set(entry.timestamp, entry.row);

  let result = [...unique.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, row]) => row);

  if (options.windowMs && result.length > 0) {
    const latest = parseUtcInstant(options.timestamp(result[result.length - 1]))!;
    const lowerBound = latest - options.windowMs;
    result = result.filter(
      (row) => (parseUtcInstant(options.timestamp(row)) ?? 0) >= lowerBound,
    );
  }

  result = result.slice(-Math.max(1, options.maxRows));
  if ((options.required ?? true) && result.length === 0) {
    throw new SolarValidationError(
      "Provider response contains no usable timestamped observations",
      "empty",
    );
  }
  return result;
}

export function latestTimestamp<T>(
  rows: readonly T[],
  timestamp: (row: T) => unknown,
): string {
  let latest = -Infinity;
  for (const row of rows) {
    const parsed = parseUtcInstant(timestamp(row));
    if (parsed !== null) latest = Math.max(latest, parsed);
  }
  if (!Number.isFinite(latest)) {
    throw new SolarValidationError("No valid observation timestamp", "timestamp");
  }
  return new Date(latest).toISOString();
}

export function normalizeProductLabel(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[≥>]/g, ">=")
    .replace(/\s+/g, "")
    .replace(/megaelectronvolts?/g, "mev");
}

export function requireExactChannel<T>(
  rows: readonly T[],
  channel: (row: T) => unknown,
  expected: readonly string[],
): T[] {
  const normalizedExpected = expected.map(normalizeProductLabel);
  const selected = rows.filter((row) =>
    normalizedExpected.includes(normalizeProductLabel(channel(row))),
  );
  if (selected.length === 0) {
    throw new SolarValidationError(
      `Required product channel is missing (${expected.join(" or ")})`,
      "channel",
    );
  }
  return selected;
}

export function boundedPercentage(value: unknown, field: string): number {
  const number = toFiniteNumber(value);
  if (number === null || number < 0 || number > 100) {
    throw new SolarValidationError(`${field} must be between 0 and 100`);
  }
  return number;
}
