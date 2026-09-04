import { getAntennaGainForPath, type AntennaType } from "@/lib/data/antennas";

export type PhysicsMode = "SSB" | "CW" | "FT8";
export type DiscreteStationPower = 5 | 25 | 100 | 500 | 1500;

const HAMCLOCK_POWERS: DiscreteStationPower[] = [5, 25, 100, 500, 1500];

/** Map live CAT/WSJT/manual modes onto the physics engine's three-mode set. */
export function toPhysicsMode(mode: string | undefined | null): PhysicsMode {
  const upper = (mode ?? "").toUpperCase();
  if (upper === "CW" || upper === "CW-R" || upper === "CWR") return "CW";
  if (
    upper === "SSB" ||
    upper === "USB" ||
    upper === "LSB" ||
    upper === "AM" ||
    upper === "FM" ||
    upper === "PHONE"
  ) {
    return "SSB";
  }
  return "FT8";
}

/** Fold feedline/amp net loss into the path antenna gain the physics stack already accepts. */
export function physicsAntennaGainDbi(
  pathGainDbi: number,
  systemLossDb: number,
): number {
  return pathGainDbi - systemLossDb;
}

export function physicsArgsForPath(
  antennaType: AntennaType,
  distanceKm: number,
  systemLossDb: number,
  txPowerWatts: number,
  mode: string | undefined | null,
): { txPowerWatts: number; mode: PhysicsMode; antennaGainDbi: number } {
  return {
    txPowerWatts,
    mode: toPhysicsMode(mode),
    antennaGainDbi: physicsAntennaGainDbi(
      getAntennaGainForPath(antennaType, distanceKm),
      systemLossDb,
    ),
  };
}

export function nearestHamClockPower(watts: number): DiscreteStationPower {
  return HAMCLOCK_POWERS.reduce((best, step) =>
    Math.abs(step - watts) < Math.abs(best - watts) ? step : best,
  );
}
