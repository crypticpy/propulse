/**
 * PROP-04 shared contract vocabulary (#950).
 *
 * Every enumerated value here is either taken verbatim from the frozen
 * validation protocol (`ml/propagation_validation/protocol-v0.1.json`) or from
 * the candidate mathematical / all-band contracts:
 *
 * - quantities, units, domains and horizons: protocol `events` and
 *   `coverage_rows` (the protocol file is frozen; this module must follow it,
 *   never the reverse).
 * - availability, correction order and fallback semantics: M01, M07, M11, M19.
 * - capability states, geometry/mechanism policy, polarization and height
 *   datum: A01 and A02.
 *
 * This module has no mutable module-level state: there is no "current target"
 * and no "selected model" here, so two independent operating contexts can use
 * the same vocabulary without aliasing (M01 `contextId` vs `viewScopeId`).
 */

/** Output events, exactly the keys of `events` in protocol-v0.1.json. */
export const PREDICTION_QUANTITIES = [
  "circuit_support",
  "snr2500",
  "network_detection",
  "observed_activity",
  "conditional_decode",
  "completed_qso",
  "field_strength",
  "usable_burst",
  "pass_geometry",
  "doppler",
] as const;
export type PredictionQuantity = (typeof PREDICTION_QUANTITIES)[number];

/** Units per quantity, exactly the `units` strings in protocol-v0.1.json. */
export const QUANTITY_UNITS: Record<PredictionQuantity, string> = {
  circuit_support: "boolean",
  snr2500: "dB",
  network_detection: "probability",
  observed_activity: "count",
  conditional_decode: "probability",
  completed_qso: "probability",
  field_strength: "dBuV_per_m",
  usable_burst: "probability",
  pass_geometry: "seconds",
  doppler: "Hz",
};

/** Data/location domains, exactly the `domain` values of `coverage_rows`. */
export const PREDICTION_DOMAINS = [
  "characterized_fixed_path",
  "configured_two_leg_path",
  "known_exposure_interval",
  "mechanism_labeled_exposure",
  "qualified_ephemeris_horizon",
  "qualified_los_atmosphere",
  "qualified_lunar_station",
  "qualified_terrain_climate",
  "qualified_terrain_profile",
  "versioned_event_population",
] as const;
export type PredictionDomain = (typeof PREDICTION_DOMAINS)[number];

/** Time horizons, exactly the `horizon` values of `coverage_rows`. */
export const PREDICTION_HORIZONS = [
  "climatology",
  "current",
  "forecast_1_24h",
  "forecast_seconds",
] as const;
export type PredictionHorizon = (typeof PREDICTION_HORIZONS)[number];

/** Mechanism families, exactly the `mechanism` values of `coverage_rows`. */
export const MECHANISM_FAMILIES = [
  "aircraft_scatter",
  "atmospheric_los",
  "aurora",
  "eme",
  "es",
  "event_head",
  "f2_daytime",
  "ground_sky_coherent",
  "groundwave",
  "meteor",
  "rain_scatter",
  "refractivity_pe",
  "regular_ef",
  "relay",
  "satellite",
  "tep_evening",
  "terrain_troposphere",
  "waveguide",
] as const;
export type MechanismFamily = (typeof MECHANISM_FAMILIES)[number];

/**
 * A02 `geometryClass`. The router selects an eligible physical family from the
 * geometry before any online/offline fallback, so the geometry is a request
 * input and never inferred from a band nickname.
 */
export const GEOMETRY_CLASSES = [
  "terrestrial_great_circle",
  "ground_wave",
  "two_leg_relay",
  "earth_space",
  "earth_moon_earth",
  "bistatic_scatter",
  "waveguide_mode",
] as const;
export type GeometryClass = (typeof GEOMETRY_CLASSES)[number];

/**
 * Geometry classes whose result depends on a third body or relay. A request in
 * one of these classes must carry a relay/ephemeris identity (A02, A21, A22);
 * `parseRequest` fails closed when it does not.
 */
export const RELAY_REQUIRED_GEOMETRY_CLASSES: readonly GeometryClass[] = [
  "two_leg_relay",
  "earth_space",
  "earth_moon_earth",
];

/** M01 availability enum. "Missing is never zero" (M11). */
export const AVAILABILITY_STATES = [
  "available",
  "unsupported",
  "missing_input",
  "unavailable",
  "experimental",
] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

/** A01 capability states. Runtime input availability is a separate axis. */
export const CAPABILITY_STATES = [
  "planned",
  "implemented_unvalidated",
  "validated_climatology",
  "validated_current",
  "validated_forecast",
  "data_limited",
  "unsupported",
] as const;
export type CapabilityState = (typeof CAPABILITY_STATES)[number];

/**
 * The capability states a router may actually send a request to. `planned` has
 * no implementation and `unsupported` is a declared gap, so neither can answer
 * a head; `data_limited` can answer with its own evidence caveat.
 */
export const ROUTABLE_CAPABILITY_STATES: readonly CapabilityState[] = [
  "implemented_unvalidated",
  "validated_climatology",
  "validated_current",
  "validated_forecast",
  "data_limited",
];

/**
 * M07 mode semantics. `geometrically_unsupported` and `screened` contribute no
 * power; `above_basic_muf_with_loss` is a supported mode carrying the
 * reference's above-MUF loss and is NOT a closed circuit.
 *
 * Note: PR #1081 (PROP-02, not merged into this base) introduces a narrower
 * two-value `CircuitSupport` ("supported" | "above_basic_muf") in
 * `src/types/signal.ts` for the legacy signal path. The contract document wins
 * here (M07 requires the three distinguishable no-power/loss cases), so this
 * vocabulary is a superset; `above_basic_muf` maps to
 * `above_basic_muf_with_loss`.
 */
export const CIRCUIT_SUPPORT_STATES = [
  "supported",
  "above_basic_muf_with_loss",
  "screened",
  "geometrically_unsupported",
] as const;
export type CircuitSupportState = (typeof CIRCUIT_SUPPORT_STATES)[number];

/** Modes that carry power. Anything else must report the no-power sentinel. */
export const POWER_BEARING_SUPPORT_STATES: readonly CircuitSupportState[] = [
  "supported",
  "above_basic_muf_with_loss",
];

/**
 * M19 fallback reasons. A result whose effective model differs from the
 * requested model must name one of these; the effective head is never
 * presented as the requested one.
 */
export const FALLBACK_REASONS = [
  "requested_model_unavailable",
  "requested_model_out_of_domain",
  "requested_model_out_of_horizon",
  "requested_model_disabled",
  "missing_required_input",
  "source_outside_age_limit",
  "offline_mode_excludes_observations",
  "numerical_failure",
  "auto_policy_selected_default",
] as const;
export type FallbackReason = (typeof FALLBACK_REASONS)[number];

/** A02 polarization. "unknown" is explicit, never an assumed default. */
export const POLARIZATIONS = [
  "horizontal",
  "vertical",
  "rhcp",
  "lhcp",
  "slant_45",
  "unknown",
] as const;
export type Polarization = (typeof POLARIZATIONS)[number];

/** A02 `antennaHeightDatum`. */
export const HEIGHT_DATUMS = [
  "above_ground_level",
  "above_mean_sea_level",
  "above_terrain_model",
  "unknown",
] as const;
export type HeightDatum = (typeof HEIGHT_DATUMS)[number];

/**
 * M01 coordinate precision. Quantization is explicit in the request and is
 * never silently applied to a precise path, so a quantized cell is its own
 * precision kind carrying the cell size.
 */
export const COORDINATE_PRECISION_KINDS = [
  "surveyed",
  "gnss",
  "maidenhead_grid",
  "quantized_cell",
  "unknown",
] as const;
export type CoordinatePrecisionKind =
  (typeof COORDINATE_PRECISION_KINDS)[number];

/** Geodetic datum of a station coordinate. */
export const COORDINATE_DATUMS = ["wgs84", "unknown"] as const;
export type CoordinateDatum = (typeof COORDINATE_DATUMS)[number];

/**
 * M17 uncertainty kinds. Uncalibrated dispersion is `model_spread`; only
 * held-out coverage qualifies `calibrated_predictive_interval`.
 */
export const UNCERTAINTY_KINDS = [
  "native_reference_decile",
  "calibrated_predictive_interval",
  "model_spread",
  "none",
] as const;
export type UncertaintyKind = (typeof UNCERTAINTY_KINDS)[number];

/** Interval semantics that go with a low/high pair. */
export const INTERVAL_KINDS = [
  "central",
  "one_sided_lower",
  "one_sided_upper",
] as const;
export type IntervalKind = (typeof INTERVAL_KINDS)[number];

/** M11 source modes. Connectivity alone does not establish live eligibility. */
export const SOURCE_MODES = ["offline", "cached_live", "live"] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

/** M19 routing policy. "named" is the user's explicit model preference. */
export const MODEL_POLICIES = ["auto", "named", "physics_only"] as const;
export type ModelPolicy = (typeof MODEL_POLICIES)[number];

/** M06 great-circle leg. */
export const ROUTE_LEGS = ["short", "long"] as const;
export type RouteLeg = (typeof ROUTE_LEGS)[number];

/**
 * The inputs a capability head may name in `requiredInputs`/`optionalInputs`,
 * and that a router reports as present when it dispatches a request. A closed
 * vocabulary is what lets input availability be checked at all: an input the
 * contract cannot name is an input nobody can prove was supplied.
 */
export const CAPABILITY_INPUT_IDS = [
  "station_pair",
  "mode_profile",
  "noise_assumption",
  "environment_pack",
  "terrain_profile",
  "ephemeris",
  "smoothed_solar_index",
  "observed_solar_index",
  "eligible_foF2_observations",
  "eligible_absorption_observations",
  "eligible_radio_observations",
  "network_exposure_context",
  "snr2500",
  "decoder_response_calibration",
] as const;
export type CapabilityInputId = (typeof CAPABILITY_INPUT_IDS)[number];

/**
 * M11 immutable correction order. A capability declares which stage each of
 * its corrections owns; two corrections may not own the same total quantity.
 */
export const CORRECTION_ORDER = [
  "reference_state",
  "approved_disturbance_prior",
  "eligible_direct_state_observations",
  "circuit_calculation",
  "excess_absorption",
  "receiver_noise_chain",
  "eligible_radio_residual",
  "calibrated_output_heads",
] as const;
export type CorrectionStage = (typeof CORRECTION_ORDER)[number];

/** How a correction treats covariance with the rest of the chain (M11/M12). */
export const COVARIANCE_OWNERSHIP = [
  "owns_total",
  "shares_declared",
  "not_applicable",
] as const;
export type CovarianceOwnership = (typeof COVARIANCE_OWNERSHIP)[number];

/**
 * Request frequency bounds in Hz. The lower bound is the P.368 ground-wave
 * floor (10 kHz) quoted by A04; the upper bound is the 300 GHz ceiling of the
 * A01 inventory. The primary consequence is a unit guard: an HF frequency
 * expressed in MHz (for example 14.074) falls below the floor and is rejected
 * instead of being silently treated as 14 Hz.
 */
export const MIN_REQUEST_FREQUENCY_HZ = 1e4;
export const MAX_REQUEST_FREQUENCY_HZ = 3e11;

/** M10 reference bandwidth for SNR2500 and any reported noise floor. */
export const REFERENCE_BANDWIDTH_HZ = 2500;

/** Schema identifiers. Bump with any breaking shape change. */
export const REQUEST_SCHEMA_VERSION = "propagation-request-0.1.0";
export const RESULT_SCHEMA_VERSION = "propagation-result-0.1.0";
export const CAPABILITY_SCHEMA_VERSION = "propagation-capability-0.1.0";

/** The protocol revision these contracts are aligned against. */
export const ALIGNED_PROTOCOL_ID = "propagation-candidate-0.1.0";
