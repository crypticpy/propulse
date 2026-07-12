export const SHERWOOD_RANGES = Object.freeze({
  noiseFloorDbm: Object.freeze({ min: -180, max: -70 }),
  sensitivityUv: Object.freeze({ min: 0.001, max: 100 }),
  blockingDb: Object.freeze({ min: 0, max: 200 }),
  dynamicRangeDb: Object.freeze({ min: 0, max: 200 }),
  spacingKhz: Object.freeze({ min: 0.01, max: 1000 }),
});

export function parseNumbers(text) {
  const cleaned = String(text)
    .replace(/\u00a0/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return matches.map(Number).filter(Number.isFinite);
}

export function parseSherwoodCell($, cell, range) {
  const rawText = $(cell).text().replace(/\s+/g, " ").trim();
  const clone = $(cell).clone();
  clone.find("sup").remove();
  clone.find('[role="doc-noteref"], .footnote, .fn').remove();
  const parsedText = clone.text().replace(/\s+/g, " ").trim();
  const tokens = parseNumbers(parsedText);
  const values = tokens.filter((value) => value >= range.min && value <= range.max);
  const rejectedValues = tokens.filter(
    (value) => value < range.min || value > range.max,
  );
  return { rawText, parsedText, values, rejectedValues };
}

export function pickMin(samples) {
  return samples.length ? Math.min(...samples) : undefined;
}

export function pickMax(samples) {
  return samples.length ? Math.max(...samples) : undefined;
}

export function pickMinPositive(samples) {
  const positive = samples.filter((value) => value > 0);
  return positive.length ? Math.min(...positive) : undefined;
}
