/**
 * Centralized tooltip content registry for ham radio metrics,
 * abbreviations, and terminology used across the application.
 *
 * Each entry provides a short description suitable for inline tooltips.
 */

// ─── Solar & Geomagnetic Metrics ──────────────────────────────────────────

export const SOLAR_TOOLTIPS = {
  sfi: "Solar Flux Index — measures 10.7 cm radio emissions from the sun (70-300+ sfu). Higher values indicate better HF propagation.",
  kIndex:
    "K-index — geomagnetic disturbance on a 0-9 scale. Lower is better: 0-2 quiet, 3-4 unsettled, 5+ storm conditions.",
  aIndex:
    "A-index — 24-hour average of geomagnetic activity (0-400). Derived from K-index; below 10 is quiet.",
  bz: "Bz — vertical component of the interplanetary magnetic field (nT). Negative Bz can trigger geomagnetic storms.",
  ssn: "Sunspot Number — daily count of visible sunspots. Correlates with solar flux and HF propagation quality.",
  solarWind:
    "Solar Wind Speed — velocity of charged particles from the sun (km/s). High speeds can disturb the ionosphere.",
  protonFlux:
    "Proton Flux — energetic proton density from the sun. Elevated levels cause polar cap absorption events.",
  xrayFlux:
    "X-ray Flux — solar X-ray intensity. Flares (C/M/X class) can cause sudden ionospheric disturbances.",
  solarCycle:
    "Solar Cycle — ~11-year pattern of solar activity. We are in Cycle 25. Higher activity = better HF propagation.",
  noaaScales:
    "NOAA Scales — R (radio blackouts), S (solar radiation), G (geomagnetic storms). Higher numbers = more severe impact.",
  liveMaps:
    "Live Maps — real-time satellite imagery showing HF absorption, aurora activity, and solar surface features.",
} as const;

// ─── Propagation & Band Conditions ────────────────────────────────────────

export const PROPAGATION_TOOLTIPS = {
  muf: "Maximum Usable Frequency — highest frequency that will refract off the ionosphere for a given path.",
  fot: "Frequency of Optimum Transmission — 85% of MUF; most reliable frequency for a path.",
  luf: "Lowest Usable Frequency — below this, signals are absorbed too heavily by the D-layer.",
  hpf: "Highest Probable Frequency — statistically most likely usable frequency for 90% of days.",
  nvis: "Near Vertical Incidence Skywave — signals sent nearly straight up, covering 0-400 km. Used for regional and emergency comms.",
  greyline:
    "Greyline — the dawn/dusk terminator zone where enhanced propagation occurs due to reduced D-layer absorption.",
  sporadicE:
    "Sporadic E (Es) — patches of intense ionization in the E-layer (90-120 km) enabling unexpected band openings on 6m-10m.",
  absorption:
    "D-layer Absorption — daytime ionospheric layer that attenuates lower HF frequencies. Worse on 160m-40m.",
  f2Layer:
    "F2 Layer — primary ionospheric layer for HF propagation at 250-400 km altitude. Supports most DX contacts.",
  propagationIndex:
    "Propagation Index — composite score (0-100) combining SFI, K-index, and Bz to summarize current HF conditions.",
  bandCondition:
    "Band Condition — predicted signal quality for a band: Excellent, Good, Fair, Poor, or Closed.",
  forecastConfidence:
    "Forecast Confidence — reliability of the propagation forecast. Drops during geomagnetic storms, southward IMF, or when solar data is unavailable.",
} as const;

// ─── Signal & Measurement ─────────────────────────────────────────────────

export const SIGNAL_TOOLTIPS = {
  sUnit:
    "S-Unit (S-meter) — signal strength S1-S9. Each S-unit = 6 dB. Readings above S9 are reported as S9+10, S9+20, etc.",
  snr: "Signal-to-Noise Ratio — decibels above noise floor. Minimum for SSB: ~3 dB. Minimum for FT8: ~-20 dB.",
  rst: "RST Report — Readability (1-5), Strength (1-9), Tone (1-9, CW only). Standard QSO signal report format.",
  frequency:
    "Operating frequency in MHz. Each amateur band has a designated frequency range.",
  mode: "Operating mode — SSB (voice), CW (Morse code), FT8/FT4 (weak-signal digital), RTTY (digital teletypewriter).",
  power:
    "Transmit power in watts. QRP = under 5W, typical = 100W, high power = 1000W+.",
} as const;

// ─── Geography & Location ─────────────────────────────────────────────────

export const GEOGRAPHY_TOOLTIPS = {
  maidenheadGrid:
    "Maidenhead Grid — 6-character locator (e.g., FN31pr) dividing Earth into grid squares for precise location.",
  cqZone:
    "CQ Zone — one of 40 geographic zones used for the WAZ (Worked All Zones) award.",
  ituZone:
    "ITU Zone — International Telecommunication Union zone used for contest exchanges.",
  dxccEntity:
    "DXCC Entity — a country or territory recognized for the DX Century Club award (340+ entities).",
  greatCircle:
    "Great Circle — the shortest path between two points on Earth's surface. Determines antenna bearing.",
  bearing:
    "Bearing — compass direction (0-360°) from your station to a target. Used for antenna aiming.",
  qth: "QTH — amateur radio shorthand for an operator's location or city.",
} as const;

// ─── Awards & Tracking ────────────────────────────────────────────────────

export const AWARD_TOOLTIPS = {
  was: "Worked All States — contact all 50 US states. One of the most popular amateur radio awards.",
  waz: "Worked All Zones — contact all 40 CQ zones worldwide.",
  dxcc: "DX Century Club — contact 100+ DXCC entities. The premier DX achievement award.",
  atno: "All-Time New One — a DXCC entity you have never contacted before. The most exciting spots!",
  lotw: "Logbook of The World — ARRL's electronic QSL confirmation system.",
  eqsl: "eQSL — electronic QSL card exchange and confirmation service.",
  qsl: "QSL Card — confirmation of a radio contact, exchanged by mail or electronically.",
} as const;

// ─── Contest Terms ────────────────────────────────────────────────────────

export const CONTEST_TOOLTIPS = {
  exchange:
    "Contest Exchange — the information sent during a contest QSO (e.g., RST + serial number or zone).",
  multiplier:
    "Multiplier — a unique entity (state, country, zone) that multiplies your point total in contests.",
  dupe: "Duplicate — a station already worked on this band/mode. Not counted for points.",
  runMode:
    "Run Mode — calling CQ and working stations that answer. Higher QSO rate.",
  searchAndPounce:
    "Search & Pounce (S&P) — tuning the band to find and work new stations/multipliers.",
  rate: "Rate — QSOs per hour. Key performance metric in contests.",
  cabrillo:
    "Cabrillo — standard log format for submitting contest results to sponsors.",
} as const;

// ─── Unified lookup ───────────────────────────────────────────────────────

export const ALL_TOOLTIPS = {
  ...SOLAR_TOOLTIPS,
  ...PROPAGATION_TOOLTIPS,
  ...SIGNAL_TOOLTIPS,
  ...GEOGRAPHY_TOOLTIPS,
  ...AWARD_TOOLTIPS,
  ...CONTEST_TOOLTIPS,
} as const;
