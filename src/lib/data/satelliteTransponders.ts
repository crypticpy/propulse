/**
 * Satellite Transponder Database
 *
 * Per-satellite transponder data for popular amateur radio satellites.
 */

export type TransponderMode = "FM" | "linear" | "digital" | "mixed";

export interface Transponder {
  name: string;
  uplinkRangeHz: [number, number];
  downlinkRangeHz: [number, number];
  inverted: boolean;
  mode: TransponderMode;
}

export interface SatelliteTransponder {
  satName: string;
  noradId: number;
  transponders: Transponder[];
  beaconHz: number | null;
  notes: string;
}

const TRANSPONDER_DB: SatelliteTransponder[] = [
  {
    satName: "ISS (ZARYA)",
    noradId: 25544,
    transponders: [
      {
        name: "V/V FM Voice",
        uplinkRangeHz: [145990000, 145990000],
        downlinkRangeHz: [437800000, 437800000],
        inverted: false,
        mode: "FM",
      },
      {
        name: "APRS Digipeater",
        uplinkRangeHz: [145825000, 145825000],
        downlinkRangeHz: [145825000, 145825000],
        inverted: false,
        mode: "digital",
      },
    ],
    beaconHz: null,
    notes: "Cross-band FM repeater and APRS digipeater. Crew schedules vary.",
  },
  {
    satName: "SO-50",
    noradId: 27607,
    transponders: [
      {
        name: "V/U FM",
        uplinkRangeHz: [145850000, 145850000],
        downlinkRangeHz: [436795000, 436795000],
        inverted: false,
        mode: "FM",
      },
    ],
    beaconHz: null,
    notes:
      "67.0 Hz CTCSS tone required on uplink. 10-min timer via 74.4 Hz tone.",
  },
  {
    satName: "AO-91",
    noradId: 43017,
    transponders: [
      {
        name: "U/V FM",
        uplinkRangeHz: [435250000, 435250000],
        downlinkRangeHz: [145960000, 145960000],
        inverted: false,
        mode: "FM",
      },
    ],
    beaconHz: 145960000,
    notes: "67.0 Hz CTCSS on uplink. Sunlit passes only.",
  },
  {
    satName: "IO-117",
    noradId: 57166,
    transponders: [
      {
        name: "U/U Digipeater",
        uplinkRangeHz: [435310000, 435310000],
        downlinkRangeHz: [435310000, 435310000],
        inverted: false,
        mode: "digital",
      },
    ],
    beaconHz: 435310000,
    notes: "Digipeater at 6000 km MEO orbit. Long passes, low Doppler rate.",
  },
  {
    satName: "RS-44",
    noradId: 44909,
    transponders: [
      {
        name: "V/U Linear",
        uplinkRangeHz: [145935000, 145995000],
        downlinkRangeHz: [435610000, 435670000],
        inverted: true,
        mode: "linear",
      },
    ],
    beaconHz: 435590000,
    notes: "Inverted linear transponder. CW/SSB.",
  },
  {
    satName: "FO-99",
    noradId: 43937,
    transponders: [
      {
        name: "V/U Linear",
        uplinkRangeHz: [145900000, 145950000],
        downlinkRangeHz: [435880000, 435930000],
        inverted: true,
        mode: "linear",
      },
    ],
    beaconHz: 435880000,
    notes: "Inverted linear transponder. Operated by JAMSAT.",
  },
  {
    satName: "QO-100",
    noradId: 43700,
    transponders: [
      {
        name: "NB Linear (S/X)",
        uplinkRangeHz: [2400050000, 2400300000],
        downlinkRangeHz: [10489550000, 10489800000],
        inverted: false,
        mode: "linear",
      },
      {
        name: "WB Digital (S/X)",
        uplinkRangeHz: [2401500000, 2409500000],
        downlinkRangeHz: [10491000000, 10499000000],
        inverted: false,
        mode: "digital",
      },
    ],
    beaconHz: 10489550000,
    notes: "Geostationary at 25.9E. Near-zero Doppler.",
  },
  {
    satName: "CAS-4A",
    noradId: 44881,
    transponders: [
      {
        name: "V/U Linear",
        uplinkRangeHz: [145860000, 145880000],
        downlinkRangeHz: [435210000, 435230000],
        inverted: true,
        mode: "linear",
      },
    ],
    beaconHz: 435200000,
    notes: "Inverted linear transponder. CW beacon on 435.200 MHz.",
  },
  {
    satName: "CAS-4B",
    noradId: 44884,
    transponders: [
      {
        name: "V/U Linear",
        uplinkRangeHz: [145915000, 145935000],
        downlinkRangeHz: [435270000, 435290000],
        inverted: true,
        mode: "linear",
      },
    ],
    beaconHz: 435260000,
    notes: "Inverted linear transponder. CW beacon on 435.260 MHz.",
  },
  {
    satName: "TEVEL-1",
    noradId: 50988,
    transponders: [
      {
        name: "V/U FM",
        uplinkRangeHz: [145970000, 145970000],
        downlinkRangeHz: [436400000, 436400000],
        inverted: false,
        mode: "FM",
      },
    ],
    beaconHz: null,
    notes: "FM repeater. Part of the TEVEL constellation by AMSAT-Israel.",
  },
];

const _byName = new Map<string, SatelliteTransponder>();
const _byNoradId = new Map<number, SatelliteTransponder>();
for (const entry of TRANSPONDER_DB) {
  _byName.set(entry.satName.toUpperCase(), entry);
  _byNoradId.set(entry.noradId, entry);
}

export function getTransponder(
  satName: string,
  noradId?: number,
): SatelliteTransponder | null {
  const byName = _byName.get(satName.trim().toUpperCase());
  if (byName) return byName;
  if (noradId !== undefined) return _byNoradId.get(noradId) ?? null;
  return null;
}

export function getAllTransponders(): SatelliteTransponder[] {
  return [...TRANSPONDER_DB];
}
