import { calculateBandConditions } from "@/lib/utils/bands";
import type {
  BandCondition,
  BandStatus,
  VHFCondition,
} from "@/types/solar";

export interface BandPrediction {
  band: string;
  freq: string;
  condition: BandCondition | VHFCondition;
  isOpening: boolean;
  description: string;
  signalStrength: "high" | "medium" | "low";
}

const CONDITION_ORDER: Record<string, number> = {
  Excellent: 0,
  Aurora: 1,
  Good: 2,
  Fair: 3,
  Poor: 4,
};

export function isDaytime(longitude = 0, now = new Date()): boolean {
  const safeLongitude = Number.isFinite(longitude) ? longitude : 0;
  const utcHour =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3_600;
  const localSolarHour = (utcHour + safeLongitude / 15 + 24) % 24;
  return localSolarHour >= 6 && localSolarHour < 18;
}

function getSignalStrength(
  condition: BandCondition | VHFCondition,
): BandPrediction["signalStrength"] {
  if (condition === "Excellent" || condition === "Aurora") {
    return "high";
  }
  if (condition === "Good") {
    return "medium";
  }
  return "low";
}

function getOpeningDescription(
  band: string,
  condition: BandCondition | VHFCondition,
  isDay: boolean,
): string {
  const bandNum = parseInt(band);

  if (condition === "Aurora") {
    return "VHF aurora scatter";
  }
  if (condition === "Excellent") {
    if (bandNum <= 20) return isDay ? "Work worldwide DX" : "Long-haul DX open";
    return isDay ? "Strong opening - call CQ" : "Excellent night path";
  }
  if (condition === "Good") {
    if (bandNum <= 30) return isDay ? "Solid DX path" : "Good night path";
    return "Open - try CQ DX";
  }
  if (condition === "Fair") {
    return "Marginal - monitor";
  }
  return "Weak signals";
}

export function getRankedBandPredictions(
  kp: number,
  sfi: number,
  isDay: boolean,
  limit: number,
): BandPrediction[] {
  const predictions = calculateBandConditions(kp, sfi).map(
    (band: BandStatus): BandPrediction => {
      const condition = isDay ? band.dayCondition : band.nightCondition;
      return {
        band: band.name,
        freq: band.freq,
        condition,
        isOpening:
          condition === "Excellent" ||
          condition === "Good" ||
          condition === "Aurora",
        description: getOpeningDescription(band.name, condition, isDay),
        signalStrength: getSignalStrength(condition),
      };
    },
  );

  predictions.sort(
    (a, b) =>
      (CONDITION_ORDER[a.condition] ?? 5) -
      (CONDITION_ORDER[b.condition] ?? 5),
  );
  return predictions.slice(0, Math.max(0, limit));
}
