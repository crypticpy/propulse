import { getAvailableSegments } from "@/lib/data/bandplans";
import type { BandMode, ITURegion, LicenseClass } from "@/types/bandplan";
import type { WizardMode } from "./types";

export const MODE_TO_BANDPLAN: Record<WizardMode, BandMode> = {
  SSB: "PHONE",
  CW: "CW",
  FT8: "DATA",
  FT4: "DATA",
  RTTY: "RTTY",
};

const DEFAULT_FREQS_KHZ: Record<string, Record<WizardMode, number[]>> = {
  "160m": {
    FT8: [1840],
    FT4: [1840],
    CW: [1825],
    SSB: [1900],
    RTTY: [1808],
  },
  "80m": {
    FT8: [3573],
    FT4: [3575],
    CW: [3530],
    SSB: [3790],
    RTTY: [3580],
  },
  "60m": {
    FT8: [5357],
    FT4: [5357],
    CW: [5350],
    SSB: [5371],
    RTTY: [5357],
  },
  "40m": {
    FT8: [7074],
    FT4: [7047],
    CW: [7025],
    SSB: [7185],
    RTTY: [7040],
  },
  "30m": {
    FT8: [10136],
    FT4: [10140],
    CW: [10120],
    SSB: [10130],
    RTTY: [10140],
  },
  "20m": {
    FT8: [14074],
    FT4: [14080],
    CW: [14025],
    SSB: [14200],
    RTTY: [14080],
  },
  "17m": {
    FT8: [18100],
    FT4: [18104],
    CW: [18080],
    SSB: [18130],
    RTTY: [18100],
  },
  "15m": {
    FT8: [21074],
    FT4: [21140],
    CW: [21025],
    SSB: [21250],
    RTTY: [21080],
  },
  "12m": {
    FT8: [24915],
    FT4: [24919],
    CW: [24910],
    SSB: [24950],
    RTTY: [24920],
  },
  "10m": {
    FT8: [28074],
    FT4: [28180],
    CW: [28025],
    SSB: [28350],
    RTTY: [28080],
  },
};

export function formatKHz(khz: number): string {
  if (khz >= 1000) {
    return `${(khz / 1000).toFixed(3)} MHz`;
  }
  return `${khz} kHz`;
}

export function pickAllowedFrequenciesKHz(params: {
  band: string;
  mode: WizardMode;
  region: ITURegion;
  licenseClass: LicenseClass;
}): number[] {
  const { band, mode, region, licenseClass } = params;
  const planMode = MODE_TO_BANDPLAN[mode];
  const segments = getAvailableSegments(band, region, licenseClass, planMode);
  if (segments.length === 0) {
    // RTTY segments may be absent for some classes — fall back to DATA
    if (mode === "RTTY") {
      const dataSegments = getAvailableSegments(
        band,
        region,
        licenseClass,
        "DATA",
      );
      if (dataSegments.length === 0) return [];
      const preferred = DEFAULT_FREQS_KHZ[band]?.RTTY ?? [];
      const allowedPreferred = preferred.filter((khz) =>
        dataSegments.some((s) => khz >= s.startKHz && khz <= s.endKHz),
      );
      if (allowedPreferred.length > 0) return allowedPreferred;
      const primary = dataSegments.find((s) => s.isPrimary) ?? dataSegments[0];
      return [Math.round((primary.startKHz + primary.endKHz) / 2)];
    }
    return [];
  }

  const preferred = DEFAULT_FREQS_KHZ[band]?.[mode] ?? [];
  const allowedPreferred = preferred.filter((khz) =>
    segments.some((s) => khz >= s.startKHz && khz <= s.endKHz),
  );
  if (allowedPreferred.length > 0) {
    return allowedPreferred;
  }

  const primary = segments.find((s) => s.isPrimary) ?? segments[0];
  const mid = Math.round((primary.startKHz + primary.endKHz) / 2);
  return [mid];
}

export function getMaxAllowedPowerWatts(params: {
  band: string;
  mode: WizardMode;
  region: ITURegion;
  licenseClass: LicenseClass;
}): number | null {
  const { band, mode, region, licenseClass } = params;
  const planMode = MODE_TO_BANDPLAN[mode];
  let segments = getAvailableSegments(band, region, licenseClass, planMode);
  if (segments.length === 0 && mode === "RTTY") {
    segments = getAvailableSegments(band, region, licenseClass, "DATA");
  }
  if (segments.length === 0) {
    return null;
  }
  return Math.min(...segments.map((s) => s.maxPowerWatts));
}
