/**
 * Age of the space-weather inputs behind a NowCast prediction.
 *
 * The model service returns `data_freshness`, a map of input name to age in
 * seconds at issue time. Its `space_weather` entry is an aggregate: the
 * service overwrites whatever the client sent with
 * `issue_time − min(observed)` across its fast sources, and because hourly
 * Dst sits in that set the aggregate reads 60–90 min old even when Kp, the
 * IMF and the solar wind are minutes old (#321).
 *
 * This module is the single place that splits those ages into the fast group
 * (Kp / IMF / solar wind / proton flux) and the slow group (Dst / Hp60 /
 * F10.7 / sunspot number), so the wall can print the freshest fast source and
 * the report modal can print one age per group.
 *
 * Per-source ages are read from `data_freshness` under the service's own
 * source vocabulary (`ml/service/operational_weather.py`). The deployed
 * service does not emit them yet — it only emits the aggregate — so every
 * caller must keep working from `aggregateSeconds` alone, and does.
 */

/** Sources published every few minutes. */
export const FAST_WEATHER_SOURCES = [
  "kp",
  "magnetic_field",
  "solar_wind",
  "proton_flux_10mev",
] as const;

/** Sources published hourly or slower. */
export const SLOW_WEATHER_SOURCES = [
  "dst",
  "hp60",
  "f107",
  "sunspot_number",
] as const;

const SOURCE_LABELS: Record<string, string> = {
  kp: "Kp",
  magnetic_field: "IMF",
  solar_wind: "Solar wind",
  proton_flux_10mev: "Proton flux",
  dst: "Dst",
  hp60: "Hp60",
  f107: "F10.7",
  sunspot_number: "Sunspots",
};

export interface WeatherSourceAge {
  source: string;
  /** Operator-facing name, e.g. "Solar wind". */
  label: string;
  seconds: number;
}

export interface OperationalWeatherAges {
  /** Newest fast source — what the wall names in its single footer line. */
  freshestFast: WeatherSourceAge | null;
  /** Oldest fast source — the fast half of the report modal's two ages. */
  oldestFast: WeatherSourceAge | null;
  /** Oldest slow source — the slow half of the report modal's two ages. */
  oldestSlow: WeatherSourceAge | null;
  /**
   * The service's aggregate `space_weather` age: its oldest fast input. The
   * honest fallback when no per-source ages are present.
   */
  aggregateSeconds: number | null;
}

function usableAge(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function collect(
  freshness: Record<string, number>,
  sources: readonly string[],
): WeatherSourceAge[] {
  const ages: WeatherSourceAge[] = [];
  for (const source of sources) {
    const seconds = freshness[source];
    if (!usableAge(seconds)) continue;
    ages.push({ source, label: SOURCE_LABELS[source] ?? source, seconds });
  }
  return ages;
}

/**
 * Extremes of a group. The earliest declared source wins a tie in both, so a
 * label never flickers between two equally aged sources.
 */
function freshest(ages: WeatherSourceAge[]): WeatherSourceAge | null {
  return ages.reduce<WeatherSourceAge | null>(
    (best, age) => (best === null || age.seconds < best.seconds ? age : best),
    null,
  );
}

function oldest(ages: WeatherSourceAge[]): WeatherSourceAge | null {
  return ages.reduce<WeatherSourceAge | null>(
    (best, age) => (best === null || age.seconds > best.seconds ? age : best),
    null,
  );
}

export function deriveOperationalWeatherAges(
  freshness: Record<string, number> | undefined,
): OperationalWeatherAges {
  if (!freshness) {
    return {
      freshestFast: null,
      oldestFast: null,
      oldestSlow: null,
      aggregateSeconds: null,
    };
  }
  const fast = collect(freshness, FAST_WEATHER_SOURCES);
  const slow = collect(freshness, SLOW_WEATHER_SOURCES);
  const aggregate = freshness.space_weather;
  return {
    freshestFast: freshest(fast),
    oldestFast: oldest(fast),
    oldestSlow: oldest(slow),
    aggregateSeconds: usableAge(aggregate) ? aggregate : null,
  };
}
