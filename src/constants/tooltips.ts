/**
 * Centralized tooltip content registry for ham radio metrics,
 * abbreviations, and terminology used across the application.
 *
 * Each entry provides a short description suitable for inline tooltips.
 */

// ─── Solar & Geomagnetic Metrics ──────────────────────────────────────────

export const SOLAR_TOOLTIPS = {
  sfi: "10.7 cm solar flux — an observed global proxy for solar EUV output, measured in sfu. A path forecast still needs both stations, time, and frequency.",
  kIndex:
    "K-index — geomagnetic disturbance on a 0-9 scale. Lower is better: 0-2 quiet, 3-4 unsettled, 5+ storm conditions.",
  aIndex:
    "Planetary A — a daily geomagnetic measure. Propulse shows NOAA’s official predicted value in forecast context; Kp conversions are labelled estimated ap-equivalent.",
  bz: "Bz — north-south (GSM z) component of the interplanetary magnetic field (nT). Negative Bz can trigger geomagnetic storms.",
  ssn: "Sunspot Number — monthly observed international sunspot number used for solar-cycle context; it is not a minute-level condition.",
  solarWind:
    "Solar Wind Speed — velocity of charged particles from the sun (km/s). High speeds can disturb the ionosphere.",
  protonFlux:
    "Proton Flux — flux of energetic protons from the Sun (particles per cm² per second). Elevated levels cause polar cap absorption events.",
  xrayFlux:
    "X-ray Flux — solar X-ray intensity. Flares (C/M/X class) can cause sudden ionospheric disturbances.",
  solarCycle:
    "Solar Cycle — ~11-year pattern of solar activity. We are in Cycle 25. Higher activity = better HF propagation.",
  noaaScales:
    "NOAA Scales — R (radio blackouts), S (solar radiation), G (geomagnetic storms). Higher numbers = more severe impact.",
  liveMaps:
    "Current maps — timestamped NOAA/NASA imagery for HF absorption, aurora activity, and solar structure. Stale and unavailable products are labelled explicitly.",
} as const;

// ─── Propagation & Band Conditions ────────────────────────────────────────

export const PROPAGATION_TOOLTIPS = {
  muf: "Maximum Usable Frequency — highest frequency that will refract off the ionosphere for a given path.",
  fot: "Frequency of Optimum Transmission — 85% of MUF; most reliable frequency for a path.",
  luf: "Lowest Usable Frequency — below this, signals are absorbed too heavily by the D-layer.",
  hpf: "Highest Probable Frequency — the upper-decile MUF: the path supports this frequency on only about 10% of days.",
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
    "Global Conditions Score — an uncalibrated 0-100 heuristic using 40% SFI, 40% Kp, and 20% Bz when available. It is not a probability or path forecast.",
  bandCondition:
    "Band Condition — a global outlook estimated from SFI and Kp only, with no specific path. Path panels (Band Conditions, Path Analysis) model your actual path and can legitimately differ.",
  forecastConfidence:
    "Forecast evidence — a qualitative coverage label based on available inputs and disturbance. It is not a calibrated probability.",
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
