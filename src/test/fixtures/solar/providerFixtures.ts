export const newestFirstFlux = [
  { time_tag: "2026-07-15T17:00:00", frequency: 2800, flux: 111, reporting_schedule: "Morning" },
  { time_tag: "2026-07-14T22:00:00", frequency: 2800, flux: 105, reporting_schedule: "Afternoon" },
  { time_tag: "2026-07-14T20:00:00", frequency: 2800, flux: 100, reporting_schedule: "Noon" },
];

export const newestFirstProbabilities = [
  {
    date: "2026-07-15T00:00:00",
    c_class_1_day: 55,
    m_class_1_day: 10,
    x_class_1_day: 1,
    "10mev_protons_1_day": 2,
  },
  {
    date: "2026-07-14T00:00:00",
    c_class_1_day: 30,
    m_class_1_day: 5,
    x_class_1_day: 0,
    "10mev_protons_1_day": 1,
  },
];

export const reversedKp = [
  { time_tag: "2026-07-16T03:00:00", kp: 4, observed: "predicted", noaa_scale: null },
  { time_tag: "2026-07-16T00:00:00", kp: 3, observed: "predicted", noaa_scale: null },
  { time_tag: "2026-07-15T21:00:00", kp: 2.67, observed: "estimated", noaa_scale: null },
  { time_tag: "2026-07-15T18:00:00", kp: 2, observed: "observed", noaa_scale: null },
];

export const mixedProtons = [
  { time_tag: "2026-07-15T18:45:00Z", satellite: 18, flux: 40, energy: ">=1 MeV" },
  { time_tag: "2026-07-15T18:45:00Z", satellite: 18, flux: 12, energy: ">=10 MeV" },
  { time_tag: "2026-07-15T18:45:00Z", satellite: 18, flux: 0.2, energy: ">=100 MeV" },
  { time_tag: "2026-07-15T18:50:00Z", satellite: 18, flux: 0.1, energy: ">=100 MeV" },
  { time_tag: "2026-07-15T18:50:00Z", satellite: 18, flux: 11, energy: ">=10 MeV" },
];

export const dualXray = [
  { time_tag: "2026-07-15T18:43:00Z", satellite: 18, flux: 1e-9, energy: "0.05-0.4nm" },
  { time_tag: "2026-07-15T18:43:00Z", satellite: 18, flux: 3e-7, energy: "0.1-0.8nm" },
  { time_tag: "2026-07-15T18:44:00Z", satellite: 18, flux: 4e-7, energy: "0.1-0.8nm" },
];

export const magnetometerNewestFirst = [
  { time_tag: "2026-07-15T18:50:00Z", bz_gsm: -4, by_gsm: null, bt: 7 },
  { time_tag: "2026-07-15T18:30:00Z", bz_gsm: -2, by_gsm: 1, bt: 6 },
  { time_tag: "2026-07-15T17:40:00Z", bz_gsm: 3, by_gsm: 1, bt: 5 },
  { time_tag: "invalid", bz_gsm: -99, by_gsm: 1, bt: 100 },
];

export const sunspots = [
  { "time-tag": "2026-05", ssn: 120.5 },
  { "time-tag": "2026-06", ssn: 130.2 },
];

export const dst = [
  { time_tag: "2026-07-15T17:00:00", dst: -20 },
  { time_tag: "2026-07-15T18:00:00", dst: -25 },
];

export const scales = {
  "0": {
    DateStamp: "2026-07-15",
    TimeStamp: "18:50:00",
    R: { Scale: "1", Text: "minor" },
    S: { Scale: "0", Text: "none" },
    G: { Scale: "0", Text: "none" },
  },
};

export const alerts = [
  {
    product_id: "K04W",
    issue_datetime: "2026-07-15 18:45:00.000",
    message: "Space Weather Message Code: WARK04\nWARNING: Geomagnetic K-index of 4 expected\nPotential Impacts: Aurora possible.",
  },
];

export const latestXray = [
  {
    time_tag: "2026-07-15T18:39:00Z",
    satellite: 18,
    current_class: "B3.9",
    begin_time: "2026-07-15T18:03:00Z",
    max_time: "2026-07-15T18:14:00Z",
    max_class: "C1.5",
    end_time: "2026-07-15T18:24:00Z",
  },
];

export const windMag = [
  ["time_tag", "bx_gsm", "by_gsm", "bz_gsm", "lon_gsm", "lat_gsm", "bt"],
  ["2026-07-15T18:45:00Z", "1", "2", "-3", "0", "0", "6"],
  ["2026-07-15T18:50:00Z", "1", "2", "-4", "0", "0", "7"],
];

export const windPlasma = [
  ["time_tag", "density", "speed", "temperature"],
  ["2026-07-15T18:45:00Z", "5", "420", "100000"],
  ["2026-07-15T18:50:00Z", "6", "430", "110000"],
];

/** RTSW real-time solar-wind plasma shape: object rows, proton_* fields only. */
export const rtswWindPlasma = [
  { time_tag: "2026-07-15T18:45:00", proton_speed: 420, proton_density: 5, proton_temperature: 100_000 },
  { time_tag: "2026-07-15T18:50:00", proton_speed: 430, proton_density: 6, proton_temperature: 110_000 },
];

export const drapText = `# DRAP Tabular Values
# Product Valid At : 2026-07-15 18:40 UTC
-20 -18 -16 -14 -12 -10 -8 -6 -4 -2 0 2 4 6 8 10 12 14 16 18 20
---------------------------------------------------------------------
 1 | 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1 0.1
-1 | 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2 0.2`;

export const malformedDrapText = `${drapText}\n-3 | 0.1 0.2`;

export const forecastText = `:Product: 3-day Space Weather Predictions
:Issued: 2026 Jul 15 1200 UTC
:Prediction_dates:   2026 Jul 16   2026 Jul 17   2026 Jul 18
:Geomagnetic_A_indices:
A_Fredericksburg         9             7             6
A_Planetary             12             8             8
:10cm_flux:
                        105           108           110`;

export const malformedForecastText = `:Product: changed format\n:Issued: missing`;

export const outlookText = `:Product: 27-day Space Weather Outlook Table 27DO.txt
:Issued: 2026 Jul 15 1312 UTC
#      27-day Space Weather Outlook Table
#                Issued 2026-07-15
#
#   UTC      Radio Flux   Planetary   Largest
#  Date       10.7 cm      A Index    Kp Index
2026 Jul 15     110          12          3
2026 Jul 16     105           5          2
2026 Jul 17     105           5          2`;

export const malformedOutlookText = `:Product: changed format\n:Issued: missing`;

export const cme = [
  {
    time21_5: "2026-07-15T12:00Z",
    latitude: 20,
    longitude: 10,
    halfAngle: 35,
    speed: 650,
    type: "C",
    note: "Representative analyst note.",
    catalog: "M2M_CATALOG",
    link: "https://example.test/cme",
  },
];
