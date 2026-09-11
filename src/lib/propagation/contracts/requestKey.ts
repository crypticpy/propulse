/**
 * PROP-04 request identity (#950), implementing the M01 cache key.
 *
 * The key is built from an explicit allowlist projection of the request, not
 * from a blind serialization of whatever the object happens to carry, so a new
 * display-only field can never silently split the scientific cache and a new
 * scientific field has to be added here deliberately.
 *
 * In the key: context, issue/valid time, target event and scope, frequency,
 * mode profile, route leg, mechanism/geometry policy, terrain and environment
 * pack, station scenario, both station records in TX then RX order (so a
 * reciprocal request has its own key), relay/ephemeris identity, requested
 * model policy/id/version and policy version, and source mode.
 *
 * Out of the key: `viewScopeId` (UI preference and cancellation only) and
 * `bandKey` (a derived label). Two independent views therefore share one
 * calculation only when every scientific input including `contextId` matches.
 *
 * There is no module-level mutable state here: no current target, no selected
 * model, nothing that one view could change under another.
 */
import type { PredictionRequest } from "@/lib/propagation/contracts/request";
import { instantMs, type Known } from "@/lib/propagation/contracts/validation";

type Canonical =
  string | number | boolean | null | Canonical[] | { [key: string]: Canonical };

/** Deterministic number text; -0 and 0 are the same scientific input. */
function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError("A request key cannot contain a non-finite number");
  }
  return String(value === 0 ? 0 : value);
}

function canonicalize(value: Canonical): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return canonicalNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Project a known/unknown field without flattening its discriminant into a
 * string. Encoding an unknown as `unknown:<reason>` would let a *known* string
 * whose value happens to read "unknown:withheld" produce the same key as an
 * unknown withheld for that reason, so the structure is kept instead.
 */
function knownProjection<T extends Canonical>(
  field: Known<T>,
): Record<string, Canonical> {
  return field.state === "known"
    ? { state: "known", value: field.value }
    : { state: "unknown", reason: field.reason };
}

/**
 * Fold -0 onto 0 so the key text is byte-stable, and fold the +180 meridian
 * onto -180 so the antimeridian has one spelling. The wire schema still
 * accepts both; only this projection is normalized.
 */
function canonicalLongitude(value: number): number {
  const folded = value === 180 ? -180 : value;
  return folded === 0 ? 0 : folded;
}

function canonicalLatitude(value: number): number {
  return value === 0 ? 0 : value;
}

function stationProjection(
  station: PredictionRequest["tx"],
): Record<string, Canonical> {
  return {
    stationId: station.stationId,
    callsign: station.callsign,
    latitudeDeg: canonicalLatitude(station.coordinates.latitudeDeg),
    longitudeDeg: canonicalLongitude(station.coordinates.longitudeDeg),
    datum: station.coordinates.datum,
    precisionKind: station.coordinates.precision.kind,
    precisionHorizontalMeters: knownProjection(
      station.coordinates.precision.horizontalMeters,
    ),
    precisionCellSizeDeg: station.coordinates.precision.cellSizeDeg,
    antennaPatternId: knownProjection(station.antenna.patternId),
    antennaGainDbi: knownProjection(station.antenna.gainDbi),
    antennaHeightMeters: knownProjection(station.antenna.heightMeters),
    antennaHeightDatum: station.antenna.heightDatum,
    polarization: station.antenna.polarization,
    antennaClass: station.antenna.antennaClass,
    deliveredPowerWatts: knownProjection(station.deliveredPowerWatts),
    feedLossDb: knownProjection(station.feedLossDb),
    noiseAssumptionId: knownProjection(station.noiseAssumptionId),
    receiverClass: station.receiverClass,
  };
}

/** The exact scientific projection the key is computed from. */
export function requestKeyProjection(
  request: PredictionRequest,
): Record<string, Canonical> {
  return {
    schemaVersion: request.schemaVersion,
    contextId: request.contextId,
    // Instants enter the key as epoch milliseconds so that two spellings of
    // one instant ("...T19:00:00Z" and "...T20:00:00+01:00") are one cache
    // entry rather than two. Every timestamp comparison in this directory goes
    // through the same parsed-instant treatment.
    issuedAtMs: instantMs(request.issuedAt),
    validAtMs: instantMs(request.validAt),
    targetEvent: request.targetEvent,
    scopeDomain: request.scope.domain,
    scopeHorizon: request.scope.horizon,
    scopeAggregation: request.scope.aggregation,
    scopeIntervalSeconds: request.scope.intervalSeconds,
    frequencyHz: request.frequencyHz,
    modeProfileId: request.modeProfileId,
    routeLeg: request.route.leg,
    routeAzimuthDeg: request.route.azimuthDeg,
    mechanismFamily: request.mechanismPolicy.family,
    geometryClass: request.mechanismPolicy.geometryClass,
    terrainProfileId: request.terrainProfileId,
    environmentPackId: request.environmentPackId,
    stationScenarioId: request.stationScenarioId,
    tx: stationProjection(request.tx),
    rx: stationProjection(request.rx),
    relayId: request.relay === null ? null : request.relay.relayId,
    ephemerisId: request.relay === null ? null : request.relay.ephemerisId,
    ephemerisEpochMs:
      request.relay === null ? null : instantMs(request.relay.ephemerisEpoch),
    modelPolicy: request.requestedModel.policy,
    modelId: request.requestedModel.modelId,
    modelVersion: request.requestedModel.modelVersion,
    policyVersion: request.requestedModel.policyVersion,
    sourceMode: request.sourceMode,
  };
}

/**
 * Deterministic scientific identity of a request. Equivalent requests produce
 * the same string; any difference in a projected field produces a different
 * one. This is the canonical serialization M01 hashes; `requestKeyDigest`
 * returns that SHA-256 when a stored key has to be short.
 */
export function requestKey(request: PredictionRequest): string {
  return canonicalize(requestKeyProjection(request));
}

/** SHA-256 of the canonical serialization, lowercase hex (M01 cache key). */
export async function requestKeyDigest(
  request: PredictionRequest,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SubtleCrypto is unavailable; cannot digest a request key");
  }
  const bytes = new TextEncoder().encode(requestKey(request));
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
