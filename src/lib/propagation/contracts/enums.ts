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

/** The two relay identities a request can name (A21 orbital, A22 surveyed). */
export type RelayKind = "orbital" | "fixed";

/**
 * Which relay identities each geometry class admits. Relay presence alone is
 * not enough: a surveyed ground repeater is not a celestial target.
 *
 * - `earth_space` (A21): the far end is a spacecraft whose geometry comes from
 *   an ephemeris, so only an orbital relay is admissible.
 * - `earth_moon_earth` (A22): the Moon is an ephemeris-backed body on the same
 *   footing as a spacecraft, so it too is declared as an orbital relay.
 * - `two_leg_relay` (A21): either an orbital repeater or a fixed, surveyed one.
 * - every direct class: no relay leg at all.
 */
/**
 * A21: which relay kinds each mechanism family may be served by. Geometry
 * alone cannot decide this, because `two_leg_relay` admits both an orbital and
 * a fixed relay: the protocol froze `conditional_decode` on
 * `configured_two_leg_path` for `satellite` *and* for `relay`, and those are
 * two different physics on the same circuit shape. Satellite physics (SGP4
 * ephemeris, range rate, transponder budget) requires an orbiting relay;
 * the terrestrial repeater family requires a fixed one with a position, so a
 * request cannot claim satellite physics over a ground repeater or vice versa
 * (plan of record, docs/designs/propagation/all-band-contract-v0.1.md:183-187,
 * which separates the satellite transponder from the "offline ground-repeater
 * /relay scenarios ... composing two qualified legs"). `eme` reflects off the
 * Moon, an orbiting body with an ephemeris (A22). `event_head` aggregates a
 * versioned event population over the declared great-circle frame and routes
 * no relay leg of its own. Every other family is a direct path and admits no
 * relay at all.
 */
export const PERMITTED_RELAY_KINDS_BY_MECHANISM: Record<
  MechanismFamily,
  readonly RelayKind[]
> = {
  aircraft_scatter: [],
  atmospheric_los: [],
  aurora: [],
  eme: ["orbital"],
  es: [],
  event_head: [],
  f2_daytime: [],
  ground_sky_coherent: [],
  groundwave: [],
  meteor: [],
  rain_scatter: [],
  refractivity_pe: [],
  regular_ef: [],
  relay: ["fixed"],
  satellite: ["orbital"],
  tep_evening: [],
  terrain_troposphere: [],
  waveguide: [],
};

/**
 * The relay kinds a (family, geometry class) pair actually admits: both tables
 * must agree, since the geometry says whether there is a relay leg at all and
 * the family says what kind of body can be on it.
 */
export function permittedRelayKinds(
  family: MechanismFamily,
  geometryClass: GeometryClass,
): readonly RelayKind[] {
  const byFamily = PERMITTED_RELAY_KINDS_BY_MECHANISM[family];
  return PERMITTED_RELAY_KINDS[geometryClass].filter((kind) =>
    byFamily.includes(kind),
  );
}

/**
 * A21/A22: which geometry classes each mechanism family may be requested on.
 * Family and geometry are two names for one physical path, so a declaration
 * that pairs them freely can route a satellite request down a terrestrial
 * great circle.
 *
 * Sources, per entry:
 * - `satellite`, `relay`, `eme` come from the frozen protocol's own coverage
 *   rows, which pair the family with a domain that names its geometry:
 *   satellite with `qualified_ephemeris_horizon` (earth-space) and with
 *   `configured_two_leg_path`, relay with `configured_two_leg_path`, and eme
 *   with `qualified_lunar_station`. Satellite therefore keeps both classes:
 *   the protocol froze a two-leg decode through a satellite as well as a pass.
 * - `groundwave` and `waveguide` take the geometry class the contract names
 *   with the same word (`ground_wave`, `waveguide_mode`).
 * - the scatter families take `bistatic_scatter`: A19 (plan of record,
 *   docs/designs/propagation/all-band-contract-v0.1.md:175) defines auroral
 *   propagation as bistatic scattering through mutually visible, field-aligned
 *   scattering volumes, and names rain scattering and aircraft targets as the
 *   same geometry with different scatterers; A20 (line 179) does the same for
 *   a meteor trail. `aurora` therefore sits with `meteor`, `aircraft_scatter`
 *   and `rain_scatter`, not on the single great circle.
 * - the remaining ionospheric and tropospheric families are single-great-
 *   circle physics and take `terrestrial_great_circle`: A12 puts troposcatter
 *   and ducting inside one P.2001 path prediction (line 145), A17 reflects
 *   sporadic E at a point on the circuit (line 167), and although A18 names
 *   off-great-circle F2/TEP rays (line 171) the contract publishes no geometry
 *   class for them, so those families keep the single-circuit class until it
 *   does.
 * - `event_head` is an aggregate over a versioned event population rather than
 *   a path. It still has to declare the frame it aggregates in, and the
 *   protocol freezes its rows on `declared_model_bands` terrestrial circuits,
 *   so it takes `terrestrial_great_circle` and no relayed class: a population
 *   of satellite or moonbounce events is a different declaration, not this one
 *   silently widened.
 */
export const PERMITTED_GEOMETRY_CLASSES: Record<
  MechanismFamily,
  readonly GeometryClass[]
> = {
  aircraft_scatter: ["bistatic_scatter"],
  atmospheric_los: ["terrestrial_great_circle"],
  aurora: ["bistatic_scatter"],
  eme: ["earth_moon_earth"],
  es: ["terrestrial_great_circle"],
  event_head: ["terrestrial_great_circle"],
  f2_daytime: ["terrestrial_great_circle"],
  ground_sky_coherent: ["terrestrial_great_circle"],
  groundwave: ["ground_wave"],
  meteor: ["bistatic_scatter"],
  rain_scatter: ["bistatic_scatter"],
  refractivity_pe: ["terrestrial_great_circle"],
  regular_ef: ["terrestrial_great_circle"],
  relay: ["two_leg_relay"],
  satellite: ["earth_space", "two_leg_relay"],
  tep_evening: ["terrestrial_great_circle"],
  terrain_troposphere: ["terrestrial_great_circle"],
  waveguide: ["waveguide_mode"],
};

export const PERMITTED_RELAY_KINDS: Record<
  GeometryClass,
  readonly RelayKind[]
> = {
  terrestrial_great_circle: [],
  ground_wave: [],
  bistatic_scatter: [],
  waveguide_mode: [],
  two_leg_relay: ["orbital", "fixed"],
  earth_space: ["orbital"],
  earth_moon_earth: ["orbital"],
};

/**
 * Antenna classes, the antenna half of A01's `antenna/receiver class` coverage
 * dimension. The contract names the dimension but publishes no enum, so the
 * members are derived from the wording that distinguishes the cases:
 *
 * - `unspecified_scenario_range`: M08, "an unspecified DX antenna is a
 *   scenario range, not a known zero-dBi fact".
 * - `modeled_pattern`: A10, "a declared antenna model has ... realized gain
 *   from its accepted pattern/mismatch model".
 * - `measured_realized_gain_pattern`: A10, "a measured realized-gain pattern
 *   already includes it"; efficiency must not be counted twice.
 * - `electrically_short`: A10, "electrically short LF/MF antennas require
 *   measured or independently modeled current distribution/efficiency".
 * - `directional_receive_only`: M08/A10, a directional receiving antenna or
 *   "a receive loop that rejects local noise" needs both signal pattern and
 *   noise-environment coupling.
 * - `aperture_far_field`: A15, "antenna-aperture far-field validity".
 * - `near_field_coupled`: A15, "near-field installations need a separate
 *   supported coupling model".
 */
export const ANTENNA_CLASSES = [
  "unspecified_scenario_range",
  "modeled_pattern",
  "measured_realized_gain_pattern",
  "electrically_short",
  "directional_receive_only",
  "aperture_far_field",
  "near_field_coupled",
] as const;
export type AntennaClass = (typeof ANTENNA_CLASSES)[number];

/**
 * Receiver classes, the receiver half of A01's coverage dimension, derived the
 * same way from the contract wording:
 *
 * - `unspecified_scenario_range`: M08/M16, an unknown receive chain is a
 *   declared scenario, never a default.
 * - `modeled_noise_figure_chain`: M09, the Friis chain from noise figure,
 *   feeder transmission and physical temperature.
 * - `measured_connector_noise`: M09, "a measured total noise at the receiver
 *   connector replaces the corresponding modeled total".
 * - `external_noise_dominated`: A10, "at LF/HF the receiver may be dominated
 *   by atmospheric/man-made noise and impulsive interference".
 * - `calibrated_system_temperature`: A16, beam-average sky and system
 *   temperature in the declared calibration convention; "preserve measured
 *   receiver-system noise instead of adding modeled components again".
 */
export const RECEIVER_CLASSES = [
  "unspecified_scenario_range",
  "modeled_noise_figure_chain",
  "measured_connector_noise",
  "external_noise_dominated",
  "calibrated_system_temperature",
] as const;
export type ReceiverClass = (typeof RECEIVER_CLASSES)[number];

/**
 * Quantities whose value-bearing output is a calibrated number and therefore
 * cannot exist without a calibration identity. M22 makes the completed-QSO
 * chain a calibrated output head, so a model that cannot name a calibration
 * cannot produce an acceptable completed-QSO result. This one table is read by
 * the result head refinement and by the capability refinement, so the router
 * can never select a model whose results the result contract would reject.
 *
 * `conditional_decode` is deliberately absent: M10 lets it report a dB margin
 * with no probability and no calibration, so its requirement is conditional on
 * the payload rather than on the quantity.
 */
export const CALIBRATION_REQUIRED_QUANTITIES: readonly PredictionQuantity[] = [
  "completed_qso",
];

/**
 * Which receive chains take part in a quantity's coverage. Antenna class is a
 * separate dimension: the transmit antenna always radiates and the receive
 * antenna always intercepts, so A01's antenna class is checked at both ends
 * for every quantity, including `pass_geometry` (a pass is answered for a
 * declared pair of stations, and the contract nowhere calls the geometry heads
 * antenna-independent). Only the receive chain is directional.
 *
 * - `"rx"`: the quantity is a property of one receiving station. M08/M09 build
 *   the signal and noise budget at the receiver's connector and M10 turns that
 *   into a margin or a decode probability; the network, activity and burst
 *   heads are likewise reports gathered at receivers.
 * - `"both"`: `completed_qso` needs both directions to close (M18/M22), and
 *   `circuit_support` is a property of the path's geometry and ionisation
 *   (M07) evaluated in both directions.
 * - `"none"`: `pass_geometry` is mutual visibility of the relay from the two
 *   endpoints (A21). No signal is received, so no receive chain participates
 *   and a declaration need not name either receiver class.
 */
export type ReceiverParticipation = "none" | "rx" | "both";

export const RECEIVER_PARTICIPATION: Record<
  PredictionQuantity,
  ReceiverParticipation
> = {
  pass_geometry: "none",
  completed_qso: "both",
  circuit_support: "both",
  snr2500: "rx",
  field_strength: "rx",
  doppler: "rx",
  conditional_decode: "rx",
  network_detection: "rx",
  observed_activity: "rx",
  usable_burst: "rx",
};

/**
 * Request frequency bounds in Hz. The lower bound is the P.368 ground-wave
 * floor (10 kHz) quoted by A04; the upper bound is the 300 GHz ceiling of the
 * A01 inventory. The primary consequence is a unit guard: an HF frequency
 * expressed in MHz (for example 14.074) falls below the floor and is rejected
 * instead of being silently treated as 14 Hz.
 */
export const MIN_REQUEST_FREQUENCY_HZ = 1e4;
export const MAX_REQUEST_FREQUENCY_HZ = 3e11;

/**
 * The frequency ranges each protocol band label stands for, in Hz.
 *
 * A grouped label names several amateur bands, not one continuous envelope:
 * `8m_6m_4m_2m` is four allocations with broadcast and other services in the
 * gaps between them, so 100 MHz is not "on that row" and a head that covers
 * only 6 m does not serve it. Each label is therefore a list of disjoint
 * constituent ranges, ordered by frequency.
 *
 * Sources: the allocations this repository already carries for the bands in
 * `src/lib/data/bandRanges.ts` (160 m 1.800-2.000 MHz, 6 m 50-54 MHz); the
 * ITU/IARU amateur allocations for the bands that file does not reach, taking
 * the widest allocation where regions differ (2200 m 135.7-137.8 kHz, 630 m
 * 472-479 kHz, 8 m 40.660-40.700 MHz, 4 m 70.000-70.500 MHz, 2 m 144-148 MHz,
 * 1.25 m 222-225 MHz, 70 cm 420-450 MHz, 33 cm 902-928 MHz, 23 cm
 * 1240-1300 MHz, 13 cm 2300-2450 MHz, 9 cm 3300-3500 MHz, 5 cm
 * 5650-5925 MHz, 3 cm 10.0-10.5 GHz, 24 GHz 24.00-24.25 GHz, 47 GHz
 * 47.0-47.2 GHz, 76 GHz 76-81 GHz, 122 GHz 122.25-123 GHz, 134 GHz
 * 134-141 GHz, 241 GHz 241-250 GHz); and the protocol's own labels where they
 * state a range directly (`2_30MHz`, and `hf_vhf` as the ITU HF and VHF
 * ranges, 3-300 MHz). Which constituents belong to each group is read off the
 * band inventory of the plan of record,
 * docs/designs/propagation/all-band-contract-v0.1.md:83 and its band table at
 * lines 90-92.
 *
 * `declared_model_bands` and `qualified_family_bands` are the protocol's way
 * of deferring the band to the declaration itself, so they span the whole
 * legal request range and constrain nothing here.
 */
export interface FrequencyRange {
  minHz: number;
  maxHz: number;
}

export const PROTOCOL_BAND_RANGES: Record<string, readonly FrequencyRange[]> = {
  "2200m": [{ minHz: 135700, maxHz: 137800 }],
  "630m": [{ minHz: 472000, maxHz: 479000 }],
  "160m": [{ minHz: 1800000, maxHz: 2000000 }],
  "2_30MHz": [{ minHz: 2e6, maxHz: 30e6 }],
  hf_vhf: [{ minHz: 3e6, maxHz: 300e6 }],
  "8m_6m_4m_2m": [
    { minHz: 40660000, maxHz: 40700000 },
    { minHz: 50e6, maxHz: 54e6 },
    { minHz: 70e6, maxHz: 70.5e6 },
    { minHz: 144e6, maxHz: 148e6 },
  ],
  "1p25m_70cm_33cm_23cm": [
    { minHz: 222e6, maxHz: 225e6 },
    { minHz: 420e6, maxHz: 450e6 },
    { minHz: 902e6, maxHz: 928e6 },
    { minHz: 1240e6, maxHz: 1300e6 },
  ],
  "13cm_to_47GHz": [
    { minHz: 2300e6, maxHz: 2450e6 },
    { minHz: 3300e6, maxHz: 3500e6 },
    { minHz: 5650e6, maxHz: 5925e6 },
    { minHz: 10000e6, maxHz: 10500e6 },
    { minHz: 24000e6, maxHz: 24250e6 },
    { minHz: 47000e6, maxHz: 47200e6 },
  ],
  "50_300GHz": [
    { minHz: 76e9, maxHz: 81e9 },
    { minHz: 122.25e9, maxHz: 123e9 },
    { minHz: 134e9, maxHz: 141e9 },
    { minHz: 241e9, maxHz: 250e9 },
  ],
  declared_model_bands: [
    { minHz: MIN_REQUEST_FREQUENCY_HZ, maxHz: MAX_REQUEST_FREQUENCY_HZ },
  ],
  qualified_family_bands: [
    { minHz: MIN_REQUEST_FREQUENCY_HZ, maxHz: MAX_REQUEST_FREQUENCY_HZ },
  ],
};

/**
 * The span a band label's own name claims, for the labels whose name states a
 * range. A grouped label is not continuous inside that span, and the gaps are
 * deliberate rather than forgotten: `50_300GHz` carries the four millimetre
 * families the plan of record names (76, 122, 134 and 241 GHz,
 * docs/designs/propagation/all-band-contract-v0.1.md:83), so 47.2-76 GHz,
 * 81-122.25 GHz, 123-134 GHz, 141-241 GHz and 250-300 GHz are explicit future
 * extensions and no allocation is invented to fill them. The same holds
 * between the microwave families of `13cm_to_47GHz`.
 */
export const PROTOCOL_BAND_NAME_SPANS: Record<string, FrequencyRange> = {
  "2_30MHz": { minHz: 2e6, maxHz: 30e6 },
  "13cm_to_47GHz": { minHz: 2300e6, maxHz: 47200e6 },
  "50_300GHz": { minHz: 50e9, maxHz: 300e9 },
};

/**
 * The ranges inside a label's named span that its constituents deliberately do
 * not carry. `protocolAlignment.test.ts` recomputes these from
 * `PROTOCOL_BAND_RANGES` and fails if the documentation and the table drift.
 */
export const PROTOCOL_BAND_GAPS: Record<string, readonly FrequencyRange[]> = {
  "2_30MHz": [],
  "13cm_to_47GHz": [
    { minHz: 2450e6, maxHz: 3300e6 },
    { minHz: 3500e6, maxHz: 5650e6 },
    { minHz: 5925e6, maxHz: 10000e6 },
    { minHz: 10500e6, maxHz: 24000e6 },
    { minHz: 24250e6, maxHz: 47000e6 },
  ],
  "50_300GHz": [
    { minHz: 50e9, maxHz: 76e9 },
    { minHz: 81e9, maxHz: 122.25e9 },
    { minHz: 123e9, maxHz: 134e9 },
    { minHz: 141e9, maxHz: 241e9 },
    { minHz: 250e9, maxHz: 300e9 },
  ],
};

/** The envelope of a label's constituents; only for building declarations. */
export function protocolBandEnvelope(band: string): FrequencyRange | undefined {
  const ranges = PROTOCOL_BAND_RANGES[band];
  if (ranges === undefined || ranges.length === 0) return undefined;
  return {
    minHz: Math.min(...ranges.map((range) => range.minHz)),
    maxHz: Math.max(...ranges.map((range) => range.maxHz)),
  };
}

/**
 * The two labels the protocol does not use to name a frequency range at all:
 * they defer the band to the declaration itself ("the bands the model
 * declares", "the bands the family qualifies"). A head on such a row is
 * therefore judged on its own declared range, and requiring it to cover the
 * synthetic 10 kHz - 300 GHz span these labels are stored as would force a
 * network or satellite-family model to advertise the whole radio universe.
 */
export const DEFERRED_BAND_LABELS: readonly string[] = [
  "declared_model_bands",
  "qualified_family_bands",
];

/** Whether this label defers its frequency coverage to the declaration. */
export function isDeferredBandLabel(band: string): boolean {
  return DEFERRED_BAND_LABELS.includes(band);
}

/**
 * Whether a declared range serves a coverage row's band.
 *
 * A row frozen for a named band is served only by a range covering every
 * constituent of that label; a row on a deferred label is served by any
 * non-empty range inside the legal request universe, which is all those
 * labels ever claimed.
 */
export function protocolRowServedByRange(
  row: ProtocolCoverageRow,
  range: FrequencyRange,
): boolean {
  if (!isDeferredBandLabel(row.band)) return rangeCoversBand(range, row.band);
  return (
    range.minHz < range.maxHz &&
    range.minHz >= MIN_REQUEST_FREQUENCY_HZ &&
    range.maxHz <= MAX_REQUEST_FREQUENCY_HZ
  );
}

/** Whether a declared range covers every constituent of a band label. */
export function rangeCoversBand(range: FrequencyRange, band: string): boolean {
  const ranges = PROTOCOL_BAND_RANGES[band];
  if (ranges === undefined) return false;
  return ranges.every(
    (part) => range.minHz <= part.minHz && range.maxHz >= part.maxHz,
  );
}

/**
 * Whether a band label carries any frequency the declared range also carries.
 *
 * The overlap is strict: two ranges that merely touch at an endpoint (160 m
 * ends at 2.000 MHz, the HF row starts at 2.000 MHz) share a single frequency
 * of zero width, which is not a band a head serves. A label that does not
 * overlap the range it is listed against is a mislabelled display key (A02).
 */
export function bandIntersectsRange(
  band: string,
  range: FrequencyRange,
): boolean {
  const ranges = PROTOCOL_BAND_RANGES[band];
  if (ranges === undefined) return false;
  return ranges.some(
    (part) => part.minHz < range.maxHz && part.maxHz > range.minHz,
  );
}

/** Whether this label is one the frozen protocol names at all. */
export function isKnownBandLabel(band: string): boolean {
  return PROTOCOL_BAND_RANGES[band] !== undefined;
}

/** Whether a frequency falls inside one of a band label's constituents. */
export function bandContainsHz(band: string, frequencyHz: number): boolean {
  const ranges = PROTOCOL_BAND_RANGES[band];
  if (ranges === undefined) return false;
  return ranges.some(
    (part) => frequencyHz >= part.minHz && frequencyHz <= part.maxHz,
  );
}

/**
 * The (band, event, domain, horizon, mechanism, status) rows the frozen
 * validation protocol defines, de-duplicated from its `coverage_rows`.
 *
 * A routable capability head must name a claim that exists here, band
 * included: each row carries its own metric, comparator and gates, and a row
 * frozen for 160 m says nothing about the same mechanism at 2 m. The list is
 * embedded rather than read from disk so the schema can enforce it in the
 * browser with no fetch; `protocolAlignment.test.ts` fails if it ever drifts
 * from ml/propagation_validation/protocol-v0.1.json.
 */
export type ProtocolRowStatus = "data_limited" | "experimental";

export interface ProtocolCoverageRow {
  band: string;
  event: PredictionQuantity;
  domain: PredictionDomain;
  horizon: PredictionHorizon;
  mechanism: MechanismFamily;
  /**
   * The protocol's own status for the row. Every row's preregistration is
   * BLOCKED and none is validated, so a capability head may claim at most the
   * evidence the row carries: `data_limited` or `experimental`, never a
   * `validated_*` state.
   */
  status: ProtocolRowStatus;
}

export const PROTOCOL_COVERAGE_TUPLES: readonly ProtocolCoverageRow[] = [
  {
    band: "13cm_to_47GHz",
    event: "field_strength",
    domain: "qualified_terrain_climate",
    horizon: "climatology",
    mechanism: "terrain_troposphere",
    status: "data_limited",
  },
  {
    band: "13cm_to_47GHz",
    event: "snr2500",
    domain: "qualified_terrain_profile",
    horizon: "forecast_1_24h",
    mechanism: "refractivity_pe",
    status: "experimental",
  },
  {
    band: "160m",
    event: "circuit_support",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "ground_sky_coherent",
    status: "experimental",
  },
  {
    band: "160m",
    event: "snr2500",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "ground_sky_coherent",
    status: "experimental",
  },
  {
    band: "160m",
    event: "snr2500",
    domain: "characterized_fixed_path",
    horizon: "current",
    mechanism: "ground_sky_coherent",
    status: "experimental",
  },
  {
    band: "160m",
    event: "snr2500",
    domain: "characterized_fixed_path",
    horizon: "forecast_1_24h",
    mechanism: "ground_sky_coherent",
    status: "experimental",
  },
  {
    band: "1p25m_70cm_33cm_23cm",
    event: "field_strength",
    domain: "qualified_terrain_climate",
    horizon: "climatology",
    mechanism: "terrain_troposphere",
    status: "data_limited",
  },
  {
    band: "1p25m_70cm_33cm_23cm",
    event: "snr2500",
    domain: "qualified_terrain_profile",
    horizon: "forecast_1_24h",
    mechanism: "refractivity_pe",
    status: "experimental",
  },
  {
    band: "2200m",
    event: "field_strength",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "groundwave",
    status: "data_limited",
  },
  {
    band: "2200m",
    event: "field_strength",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "waveguide",
    status: "data_limited",
  },
  {
    band: "2_30MHz",
    event: "snr2500",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "regular_ef",
    status: "data_limited",
  },
  {
    band: "2_30MHz",
    event: "snr2500",
    domain: "characterized_fixed_path",
    horizon: "current",
    mechanism: "regular_ef",
    status: "data_limited",
  },
  {
    band: "2_30MHz",
    event: "snr2500",
    domain: "characterized_fixed_path",
    horizon: "forecast_1_24h",
    mechanism: "regular_ef",
    status: "data_limited",
  },
  {
    band: "50_300GHz",
    event: "snr2500",
    domain: "qualified_los_atmosphere",
    horizon: "climatology",
    mechanism: "atmospheric_los",
    status: "data_limited",
  },
  {
    band: "630m",
    event: "field_strength",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "groundwave",
    status: "data_limited",
  },
  {
    band: "630m",
    event: "field_strength",
    domain: "characterized_fixed_path",
    horizon: "climatology",
    mechanism: "waveguide",
    status: "data_limited",
  },
  {
    band: "8m_6m_4m_2m",
    event: "field_strength",
    domain: "qualified_terrain_climate",
    horizon: "climatology",
    mechanism: "terrain_troposphere",
    status: "data_limited",
  },
  {
    band: "8m_6m_4m_2m",
    event: "snr2500",
    domain: "qualified_terrain_profile",
    horizon: "forecast_1_24h",
    mechanism: "refractivity_pe",
    status: "experimental",
  },
  {
    band: "declared_model_bands",
    event: "completed_qso",
    domain: "versioned_event_population",
    horizon: "current",
    mechanism: "event_head",
    status: "data_limited",
  },
  {
    band: "declared_model_bands",
    event: "network_detection",
    domain: "versioned_event_population",
    horizon: "current",
    mechanism: "event_head",
    status: "data_limited",
  },
  {
    band: "declared_model_bands",
    event: "observed_activity",
    domain: "versioned_event_population",
    horizon: "current",
    mechanism: "event_head",
    status: "data_limited",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "climatology",
    mechanism: "aurora",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "climatology",
    mechanism: "es",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "climatology",
    mechanism: "f2_daytime",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "climatology",
    mechanism: "tep_evening",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "current",
    mechanism: "aurora",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "current",
    mechanism: "es",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "current",
    mechanism: "f2_daytime",
    status: "experimental",
  },
  {
    band: "hf_vhf",
    event: "conditional_decode",
    domain: "mechanism_labeled_exposure",
    horizon: "current",
    mechanism: "tep_evening",
    status: "experimental",
  },
  {
    band: "qualified_family_bands",
    event: "conditional_decode",
    domain: "configured_two_leg_path",
    horizon: "current",
    mechanism: "relay",
    status: "data_limited",
  },
  {
    band: "qualified_family_bands",
    event: "conditional_decode",
    domain: "configured_two_leg_path",
    horizon: "current",
    mechanism: "satellite",
    status: "data_limited",
  },
  {
    band: "qualified_family_bands",
    event: "doppler",
    domain: "qualified_lunar_station",
    horizon: "forecast_seconds",
    mechanism: "eme",
    status: "data_limited",
  },
  {
    band: "qualified_family_bands",
    event: "pass_geometry",
    domain: "qualified_ephemeris_horizon",
    horizon: "forecast_seconds",
    mechanism: "satellite",
    status: "data_limited",
  },
  {
    band: "qualified_family_bands",
    event: "snr2500",
    domain: "qualified_lunar_station",
    horizon: "forecast_seconds",
    mechanism: "eme",
    status: "data_limited",
  },
  {
    band: "qualified_family_bands",
    event: "usable_burst",
    domain: "known_exposure_interval",
    horizon: "current",
    mechanism: "aircraft_scatter",
    status: "experimental",
  },
  {
    band: "qualified_family_bands",
    event: "usable_burst",
    domain: "known_exposure_interval",
    horizon: "current",
    mechanism: "meteor",
    status: "experimental",
  },
  {
    band: "qualified_family_bands",
    event: "usable_burst",
    domain: "known_exposure_interval",
    horizon: "current",
    mechanism: "rain_scatter",
    status: "experimental",
  },
];

/** Stable text for one protocol coverage row; "|" occurs in no member. */
export function protocolCoverageKey(row: ProtocolCoverageRow): string {
  return [
    row.band,
    row.event,
    row.domain,
    row.horizon,
    row.mechanism,
    row.status,
  ].join("|");
}

/** The rows that define this claim, one per band the protocol froze it for. */
export function protocolCoverageRows(claim: {
  event: PredictionQuantity;
  domain: PredictionDomain;
  horizon: PredictionHorizon;
  mechanism: MechanismFamily;
}): readonly ProtocolCoverageRow[] {
  return PROTOCOL_COVERAGE_TUPLES.filter(
    (row) =>
      row.event === claim.event &&
      row.domain === claim.domain &&
      row.horizon === claim.horizon &&
      row.mechanism === claim.mechanism,
  );
}

/**
 * Whether the protocol defines this claim for a band the declared range serves
 * in full. A row is frozen for a whole band label, so a head claiming it must
 * cover every constituent of that label; two rows are never glued together to
 * cover a band neither of them froze. A row on a deferred label
 * (`DEFERRED_BAND_LABELS`) names no band of its own and is served by the
 * declaration's own range.
 */
export function isProtocolCoverage(
  claim: {
    event: PredictionQuantity;
    domain: PredictionDomain;
    horizon: PredictionHorizon;
    mechanism: MechanismFamily;
  },
  range?: { minHz: number; maxHz: number },
): boolean {
  const rows = protocolCoverageRows(claim);
  if (rows.length === 0) return false;
  if (range === undefined) return true;
  return rows.some((row) => protocolRowServedByRange(row, range));
}

/**
 * Whether the protocol defines this claim on a band that actually contains
 * the frequency. A frequency in a gap between a grouped label's constituents
 * (100 MHz between 4 m and 2 m) is on no row and must not be answered.
 */
export function protocolCoverageContainsHz(
  claim: {
    event: PredictionQuantity;
    domain: PredictionDomain;
    horizon: PredictionHorizon;
    mechanism: MechanismFamily;
  },
  frequencyHz: number,
  /**
   * The range a declaration serves, when there is one. A row on a deferred
   * band label takes its frequencies from the declaration, so this is the only
   * thing that can answer "is this frequency on the row" for such a row. A
   * request carries no declaration and passes nothing here, which leaves the
   * deferred labels spanning the legal request universe as stored.
   */
  declaredRange?: FrequencyRange,
): boolean {
  return protocolCoverageRows(claim).some((row) => {
    if (isDeferredBandLabel(row.band) && declaredRange !== undefined) {
      return (
        frequencyHz >= declaredRange.minHz && frequencyHz <= declaredRange.maxHz
      );
    }
    return bandContainsHz(row.band, frequencyHz);
  });
}

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
  "experimental",
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
  "experimental",
];

/**
 * The capability states that claim a completed validation. The frozen protocol
 * validates nothing yet: every coverage row is `data_limited` or
 * `experimental` and every preregistration is BLOCKED, so a routable head may
 * not declare one of these until a row says otherwise.
 */
export const VALIDATED_CAPABILITY_STATES: readonly CapabilityState[] = [
  "validated_climatology",
  "validated_current",
  "validated_forecast",
];

/**
 * The capability state a head must declare on a row of each protocol status.
 * `experimental` evidence cannot be presented as the qualified-but-thin
 * `data_limited` evidence of another row, or the reverse.
 */
export const CAPABILITY_STATE_FOR_ROW_STATUS: Record<
  ProtocolRowStatus,
  CapabilityState
> = {
  data_limited: "data_limited",
  experimental: "experimental",
};

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

/**
 * The fallback reasons that presuppose a requested model. Each one explains
 * why *the model the caller asked for* was not used, so a result that records
 * no requested model cannot report one of them (M19).
 */
export const REQUESTED_MODEL_FALLBACK_REASONS: readonly FallbackReason[] = [
  "requested_model_unavailable",
  "requested_model_out_of_domain",
  "requested_model_out_of_horizon",
  "requested_model_disabled",
];

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
 * The inputs a mechanism family cannot run without, whatever else it is given.
 *
 * Membership is narrow on purpose: an input is listed only when no other
 * declared input could stand in for it. The ionospheric families are therefore
 * absent even though they need a state, because a head may take that state
 * from `smoothed_solar_index`, `observed_solar_index` or eligible foF2
 * observations and the contract does not choose between them. The entries are
 * read off the plan of record, docs/designs/propagation/all-band-contract-v0.1.md:
 *
 * - `satellite` needs an ephemeris: A21 (line 183) makes frame, time and
 *   ephemeris age explicit, and a pass is where the spacecraft is.
 * - `eme` needs an ephemeris: A22 (line 189) requires a bundled, range-limited
 *   lunar ephemeris with validated interpolation.
 * - `terrain_troposphere`, `refractivity_pe`, `groundwave` and
 *   `ground_sky_coherent` need a terrain profile: A11 (lines 141-143) makes the
 *   profile, its resolution and its vertical datum the geometry itself, and
 *   missing terrain is `data_limited`, never an assumed unobstructed path.
 * - `terrain_troposphere` and `refractivity_pe` also need an environment pack:
 *   the band table (line 92) pairs "reference atmosphere and terrain packs",
 *   and A13/A14 (lines 149, 153) compute refractivity from the meteorological
 *   profile that pack carries.
 * - `atmospheric_los` needs an environment pack for the same reason: its whole
 *   content is gaseous attenuation and emission against a reference atmosphere
 *   (line 92).
 *
 * This one table drives both the request rule (the request must carry the
 * input of the family that will answer it) and the capability rule (a routable
 * head must require every mandatory input of every family it advertises).
 */
export const MANDATORY_INPUTS_BY_FAMILY: Record<
  MechanismFamily,
  readonly CapabilityInputId[]
> = {
  aircraft_scatter: [],
  atmospheric_los: ["environment_pack"],
  aurora: [],
  eme: ["ephemeris"],
  es: [],
  event_head: [],
  f2_daytime: [],
  ground_sky_coherent: ["terrain_profile"],
  groundwave: ["terrain_profile"],
  meteor: [],
  rain_scatter: [],
  refractivity_pe: ["terrain_profile", "environment_pack"],
  regular_ef: [],
  relay: [],
  satellite: ["ephemeris"],
  tep_evening: [],
  terrain_troposphere: ["terrain_profile", "environment_pack"],
  waveguide: [],
};

/** The inputs every one of these families cannot run without. */
export function mandatoryInputsForFamilies(
  families: readonly MechanismFamily[],
): CapabilityInputId[] {
  const seen = new Set<CapabilityInputId>();
  for (const family of families) {
    for (const input of MANDATORY_INPUTS_BY_FAMILY[family]) seen.add(input);
  }
  return [...seen];
}

/**
 * The inputs *every* one of these families needs. Used where the family is not
 * yet fixed ("auto"): an input only the chosen family might need is not one
 * the caller can be required to supply in advance.
 */
export function sharedMandatoryInputs(
  families: readonly MechanismFamily[],
): CapabilityInputId[] {
  if (families.length === 0) return [];
  return mandatoryInputsForFamilies(families).filter((input) =>
    families.every((family) =>
      MANDATORY_INPUTS_BY_FAMILY[family].includes(input),
    ),
  );
}

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

/** M10 reference bandwidth for SNR2500 and any reported noise floor. */
export const REFERENCE_BANDWIDTH_HZ = 2500;

/** Schema identifiers. Bump with any breaking shape change. */
export const REQUEST_SCHEMA_VERSION = "propagation-request-0.1.0";
export const RESULT_SCHEMA_VERSION = "propagation-result-0.1.0";
export const CAPABILITY_SCHEMA_VERSION = "propagation-capability-0.1.0";

/** The protocol revision these contracts are aligned against. */
export const ALIGNED_PROTOCOL_ID = "propagation-candidate-0.1.0";
