import type { SolarResource, SolarWidgetState } from "./contracts";
import type { KpPoint } from "./dataTypes";
import { parseUtcInstant } from "./normalization";

export function latestByTime<T>(
  values: readonly T[] | null | undefined,
  timestamp: (value: T) => string,
  predicate: (value: T) => boolean = () => true,
): T | null {
  let latest: T | null = null;
  let latestTime = -Infinity;
  for (const value of values ?? []) {
    if (!predicate(value)) continue;
    const parsed = parseUtcInstant(timestamp(value));
    if (parsed !== null && parsed > latestTime) {
      latest = value;
      latestTime = parsed;
    }
  }
  return latest;
}

export function currentKp(points: readonly KpPoint[] | undefined): KpPoint | null {
  return latestByTime(points, (point) => point.time_tag, (point) => point.kind !== "predicted");
}

export function predictedKp(points: readonly KpPoint[] | undefined): KpPoint[] {
  return (points ?? []).filter((point) => point.kind === "predicted");
}

export function xrayClass(flux: number | null): string | null {
  if (flux === null || flux < 0) return null;
  if (flux >= 1e-4) return `X${(flux / 1e-4).toFixed(1)}`;
  if (flux >= 1e-5) return `M${(flux / 1e-5).toFixed(1)}`;
  if (flux >= 1e-6) return `C${(flux / 1e-6).toFixed(1)}`;
  if (flux >= 1e-7) return `B${(flux / 1e-7).toFixed(1)}`;
  return `A${(flux / 1e-8).toFixed(1)}`;
}

export function protonScale(flux: number | null): string {
  if (flux === null) return "Unknown";
  if (flux >= 100_000) return "S5";
  if (flux >= 10_000) return "S4";
  if (flux >= 1_000) return "S3";
  if (flux >= 100) return "S2";
  if (flux >= 10) return "S1";
  return "Below S1";
}

export interface GeneralHfGuidance {
  level: "favorable" | "mixed" | "disrupted" | "insufficient";
  title: string;
  summary: string;
  evidence: string[];
  missing: string[];
}

export function generalHfGuidance(inputs: {
  sfi: number | null;
  kp: number | null;
  bz: number | null;
}): GeneralHfGuidance {
  const missing = [
    inputs.sfi === null ? "solar flux" : null,
    inputs.kp === null ? "planetary Kp" : null,
    inputs.bz === null ? "IMF Bz" : null,
  ].filter((value): value is string => value !== null);
  const evidence: string[] = [];
  if (inputs.sfi !== null) {
    evidence.push(
      inputs.sfi >= 140
        ? `SFI ${inputs.sfi.toFixed(0)} supports stronger global ionization`
        : inputs.sfi >= 90
          ? `SFI ${inputs.sfi.toFixed(0)} provides moderate global ionization`
          : `SFI ${inputs.sfi.toFixed(0)} limits higher-band support`,
    );
  }
  if (inputs.kp !== null) {
    evidence.push(
      inputs.kp >= 5
        ? `Kp ${inputs.kp.toFixed(1)} indicates storm-level disturbance`
        : inputs.kp >= 4
          ? `Kp ${inputs.kp.toFixed(1)} indicates unsettled geomagnetic conditions`
          : `Kp ${inputs.kp.toFixed(1)} indicates relatively quiet geomagnetic conditions`,
    );
  }
  if (inputs.bz !== null) {
    evidence.push(
      inputs.bz <= -8
        ? `Bz ${inputs.bz.toFixed(1)} nT is strongly southward`
        : inputs.bz < 0
          ? `Bz ${inputs.bz.toFixed(1)} nT is modestly southward`
          : `Bz ${inputs.bz.toFixed(1)} nT is northward`,
    );
  }

  if (missing.length >= 2 || inputs.kp === null || inputs.sfi === null) {
    return {
      level: "insufficient",
      title: "Not enough current data",
      summary: "General HF guidance is withheld until the required global inputs recover.",
      evidence,
      missing,
    };
  }
  const disrupted = inputs.kp >= 5 || (inputs.bz !== null && inputs.bz <= -10);
  const favorable = inputs.kp < 3 && inputs.sfi >= 100 && (inputs.bz === null || inputs.bz > -6);
  if (disrupted) {
    return {
      level: "disrupted",
      title: "Globally disturbed",
      summary: "Polar and high-latitude HF paths may be degraded. Local and equatorial paths can differ.",
      evidence,
      missing,
    };
  }
  if (favorable) {
    return {
      level: "favorable",
      title: "Generally favorable",
      summary: "Global inputs are supportive, but band choice still depends on both stations, path, frequency, and local time.",
      evidence,
      missing,
    };
  }
  return {
    level: "mixed",
    title: "Mixed global signals",
    summary: "Some HF paths may be usable while others are not. Use path-aware analysis before choosing a band.",
    evidence,
    missing,
  };
}

export function widgetState<T>(options: {
  resource?: SolarResource<T>;
  pending: boolean;
  fetching: boolean;
  error: boolean;
  unavailable?: boolean;
  empty?: boolean;
}): SolarWidgetState {
  if (options.pending && !options.resource) return "loading";
  if (options.unavailable && !options.resource) return "unavailable";
  if (options.error && !options.resource) return "error";
  if (!options.resource) return "unavailable";
  if (options.empty) return "empty";
  if (options.resource.state === "stale") return "stale";
  if (options.fetching) return "refreshing";
  return "fresh";
}
