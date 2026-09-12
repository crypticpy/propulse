// The 24-hour RTSW contract introduced by #244; sourcePolicies.ts is authoritative.
export const PLASMA_MAX_BYTES = 320_000;
const MAX_ROWS = 2_500;
const DAY_MS = 24 * 60 * 60_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// NOAA timestamps without an offset are UTC, as in the production adapter.
function utc(value) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const text = value.trim();
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);
}

export function validatePlasmaSeries(body, bytes) {
  assert(bytes <= PLASMA_MAX_BYTES, "plasma output exceeds the 320 KB policy");
  assert(body.sourceUrl === "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json", "wrong plasma provenance");
  const rows = body.data;
  assert(Array.isArray(rows) && rows.length > 0 && rows.length <= MAX_ROWS, "plasma row budget or empty series");
  const latest = utc(body.observedAt);
  assert(Number.isFinite(latest), "invalid plasma observedAt");
  let previous = -Infinity;
  for (const row of rows) {
    const timestamp = utc(row?.time_tag);
    assert(Number.isFinite(timestamp) && timestamp > previous, "plasma timestamps must be valid, unique and ascending");
    assert(timestamp >= latest - DAY_MS && timestamp <= latest, "plasma row outside retained 24-hour window");
    for (const field of ["speed", "density", "temperature"]) {
      assert(row[field] === null || Number.isFinite(row[field]), `invalid plasma ${field}`);
    }
    assert(Number.isFinite(row.speed) || Number.isFinite(row.density), "plasma row has no usable speed or density");
    previous = timestamp;
  }
  assert(previous === latest, "plasma observedAt must match the latest retained row");
}
