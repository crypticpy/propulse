/**
 * NCDXF/IARU International Beacon Project Database
 *
 * The International Beacon Project operates 18 beacons worldwide that
 * transmit on 5 HF bands (14.1, 18.11, 21.15, 24.93, 28.2 MHz) in a
 * precisely timed 3-minute rotation. Each beacon transmits for 10 seconds
 * on each of the 5 frequencies in sequence, stepping through 4 power levels
 * (100 W, 10 W, 1 W, 0.1 W) during each 10-second slot.
 *
 * The schedule repeats every 3 minutes, synchronized to UTC.
 * At any given 10-second slot within a 3-minute cycle, exactly one beacon
 * is transmitting on each of the 5 frequencies simultaneously (each beacon
 * is offset by one frequency from the next in the rotation).
 *
 * Reference: https://www.ncdxf.org/beacon/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeaconStation {
  /** Callsign (e.g. "4U1UN") */
  callsign: string;
  /** Human-readable location */
  location: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Beacon frequencies in kHz */
  bands: number[];
  /** Position in the 3-minute rotation (0-17) */
  slotIndex: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 5 beacon frequencies in kHz */
export const BEACON_FREQUENCIES = [14100, 18110, 21150, 24930, 28200] as const;

/** Transmission duration per beacon per band: 10 seconds */
export const BEACON_TX_DURATION_S = 10;

/** Full rotation cycle: 18 beacons x 10 seconds = 180 seconds = 3 minutes */
export const BEACON_CYCLE_S = 180;

/** Number of beacons in the network */
export const BEACON_COUNT = 18;

/** Number of bands each beacon transmits on */
export const BEACON_BAND_COUNT = BEACON_FREQUENCIES.length;

// ---------------------------------------------------------------------------
// Station Data
// ---------------------------------------------------------------------------

export const BEACON_STATIONS: BeaconStation[] = [
  {
    callsign: "4U1UN",
    location: "United Nations, NY",
    lat: 40.75,
    lon: -73.97,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 0,
  },
  {
    callsign: "VE8AT",
    location: "Eureka, Canada",
    lat: 79.99,
    lon: -85.94,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 1,
  },
  {
    callsign: "W6WX",
    location: "California, USA",
    lat: 37.42,
    lon: -122.17,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 2,
  },
  {
    callsign: "KH6RS",
    location: "Hawaii, USA",
    lat: 21.31,
    lon: -158.08,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 3,
  },
  {
    callsign: "ZL6B",
    location: "New Zealand",
    lat: -41.29,
    lon: 174.78,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 4,
  },
  {
    callsign: "VK6RBP",
    location: "Perth, Australia",
    lat: -31.95,
    lon: 115.86,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 5,
  },
  {
    callsign: "JA2IGY",
    location: "Aichi, Japan",
    lat: 35.18,
    lon: 136.91,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 6,
  },
  {
    callsign: "RR9O",
    location: "Novosibirsk, Russia",
    lat: 54.98,
    lon: 82.9,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 7,
  },
  {
    callsign: "VR2B",
    location: "Hong Kong",
    lat: 22.28,
    lon: 114.17,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 8,
  },
  {
    callsign: "4S7B",
    location: "Sri Lanka",
    lat: 7.29,
    lon: 80.63,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 9,
  },
  {
    callsign: "ZS6DN",
    location: "South Africa",
    lat: -25.75,
    lon: 28.19,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 10,
  },
  {
    callsign: "5Z4B",
    location: "Kenya",
    lat: -1.29,
    lon: 36.82,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 11,
  },
  {
    callsign: "4X6TU",
    location: "Israel",
    lat: 32.08,
    lon: 34.77,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 12,
  },
  {
    callsign: "OH2B",
    location: "Finland",
    lat: 60.17,
    lon: 24.94,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 13,
  },
  {
    callsign: "CS3B",
    location: "Madeira",
    lat: 32.65,
    lon: -16.9,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 14,
  },
  {
    callsign: "LU4AA",
    location: "Buenos Aires, Argentina",
    lat: -34.6,
    lon: -58.38,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 15,
  },
  {
    callsign: "OA4B",
    location: "Lima, Peru",
    lat: -12.05,
    lon: -77.04,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 16,
  },
  {
    callsign: "YV5B",
    location: "Caracas, Venezuela",
    lat: 10.5,
    lon: -66.93,
    bands: [...BEACON_FREQUENCIES],
    slotIndex: 17,
  },
];

// ---------------------------------------------------------------------------
// Schedule Calculation
// ---------------------------------------------------------------------------

/**
 * The NCDXF beacon schedule works as follows:
 *
 * Each 3-minute (180-second) cycle is divided into 18 ten-second slots.
 * In each slot, every beacon transmits on a different band. The band
 * assignment rotates so that over 5 consecutive slots (50 seconds),
 * each beacon cycles through all 5 bands.
 *
 * Slot 0: Beacon 0 on 14.1, Beacon 1 on 18.11, Beacon 2 on 21.15, ...
 * Slot 1: Beacon 1 on 14.1, Beacon 2 on 18.11, Beacon 3 on 21.15, ...
 *
 * At any instant, 5 beacons are transmitting (one per frequency band),
 * and they are 5 consecutive beacons in the rotation order.
 */

export interface BeaconTransmission {
  /** The beacon station */
  beacon: BeaconStation;
  /** Frequency in kHz currently being transmitted */
  frequencyKHz: number;
  /** Seconds remaining in this transmission slot */
  secondsRemaining: number;
  /** Current slot index in the 3-minute cycle (0-17) */
  slotInCycle: number;
  /** Band index within the 5-band rotation (0-4) */
  bandIndex: number;
}

/**
 * Get the current beacon schedule at a given time.
 *
 * Returns all 5 currently active transmissions (one per frequency).
 * The NCDXF schedule has 5 beacons transmitting simultaneously,
 * each on a different frequency.
 *
 * @param date - Current UTC time (defaults to now)
 * @returns Array of 5 active transmissions, one per frequency band
 */
export function getActiveTransmissions(
  date: Date = new Date(),
): BeaconTransmission[] {
  const utcSeconds = date.getUTCMinutes() * 60 + date.getUTCSeconds();
  const cyclePosition = utcSeconds % BEACON_CYCLE_S;
  const currentSlot = Math.floor(cyclePosition / BEACON_TX_DURATION_S);
  const secondsIntoSlot = cyclePosition % BEACON_TX_DURATION_S;
  const secondsRemaining = BEACON_TX_DURATION_S - secondsIntoSlot;

  const transmissions: BeaconTransmission[] = [];

  for (let bandIdx = 0; bandIdx < BEACON_BAND_COUNT; bandIdx++) {
    // The beacon transmitting on band `bandIdx` at slot `currentSlot`
    // is offset by bandIdx positions from the primary beacon for this slot
    const beaconIndex = (currentSlot + bandIdx) % BEACON_COUNT;
    const beacon = BEACON_STATIONS[beaconIndex];

    transmissions.push({
      beacon,
      frequencyKHz: BEACON_FREQUENCIES[bandIdx],
      secondsRemaining,
      slotInCycle: currentSlot,
      bandIndex: bandIdx,
    });
  }

  return transmissions;
}

/**
 * Get the currently transmitting beacon on the primary band (14.100 MHz)
 * and its active frequency.
 *
 * This is a simplified view -- in reality 5 beacons transmit simultaneously
 * (one per band). This returns the one on the lowest (primary) frequency.
 *
 * @param date - Current UTC time
 * @returns Transmission info for the primary band
 */
export function getCurrentBeacon(date: Date = new Date()): BeaconTransmission {
  const utcSeconds = date.getUTCMinutes() * 60 + date.getUTCSeconds();
  const cyclePosition = utcSeconds % BEACON_CYCLE_S;
  const currentSlot = Math.floor(cyclePosition / BEACON_TX_DURATION_S);
  const secondsIntoSlot = cyclePosition % BEACON_TX_DURATION_S;
  const secondsRemaining = BEACON_TX_DURATION_S - secondsIntoSlot;

  const beaconIndex = currentSlot % BEACON_COUNT;
  const beacon = BEACON_STATIONS[beaconIndex];

  return {
    beacon,
    frequencyKHz: BEACON_FREQUENCIES[0],
    secondsRemaining,
    slotInCycle: currentSlot,
    bandIndex: 0,
  };
}

/**
 * Get all beacons with their current transmission state.
 *
 * Returns every beacon with a flag indicating whether it's currently
 * transmitting and, if so, on which band.
 *
 * @param date - Current UTC time
 * @returns Array of all 18 beacons with transmission state
 */
export function getBeaconStates(date: Date = new Date()): Array<
  BeaconStation & {
    isTransmitting: boolean;
    currentBandKHz: number | null;
  }
> {
  const active = getActiveTransmissions(date);
  const activeMap = new Map<number, number>(); // slotIndex -> frequencyKHz

  for (const tx of active) {
    activeMap.set(tx.beacon.slotIndex, tx.frequencyKHz);
  }

  return BEACON_STATIONS.map((b) => ({
    ...b,
    isTransmitting: activeMap.has(b.slotIndex),
    currentBandKHz: activeMap.get(b.slotIndex) ?? null,
  }));
}

/**
 * Get the next transmission time for a specific beacon.
 *
 * @param callsign - Beacon callsign (e.g. "W6WX")
 * @param date - Reference time (defaults to now)
 * @returns Seconds until next transmission on the primary band, or null if callsign not found
 */
export function getSecondsUntilNextTransmission(
  callsign: string,
  date: Date = new Date(),
): number | null {
  const beacon = BEACON_STATIONS.find(
    (b) => b.callsign.toUpperCase() === callsign.toUpperCase(),
  );
  if (!beacon) return null;

  const utcSeconds = date.getUTCMinutes() * 60 + date.getUTCSeconds();
  const cyclePosition = utcSeconds % BEACON_CYCLE_S;
  const currentSlot = Math.floor(cyclePosition / BEACON_TX_DURATION_S);

  // Beacon transmits when currentSlot === beacon.slotIndex
  if (currentSlot === beacon.slotIndex) {
    // Currently transmitting -- 0 seconds until next (or return time remaining)
    return 0;
  }

  // Calculate slots until this beacon's turn
  const slotsUntil =
    (beacon.slotIndex - currentSlot + BEACON_COUNT) % BEACON_COUNT;
  const secondsIntoCurrentSlot = cyclePosition % BEACON_TX_DURATION_S;

  return slotsUntil * BEACON_TX_DURATION_S - secondsIntoCurrentSlot;
}

/**
 * Format a beacon frequency for display.
 *
 * @param kHz - Frequency in kHz
 * @returns Formatted string like "14.100 MHz"
 */
export function formatBeaconFrequency(kHz: number): string {
  return `${(kHz / 1000).toFixed(3)} MHz`;
}
