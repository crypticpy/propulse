import { SolarForecastPanel } from "propulse";

type SolarWidgetState =
  | "loading"
  | "fresh"
  | "refreshing"
  | "stale"
  | "partial"
  | "empty"
  | "unavailable"
  | "error";

function buildView(
  sourceId: string,
  data: unknown,
  observedAt: string,
  state: SolarWidgetState = "fresh",
) {
  const envelope = {
    schemaVersion: 1,
    sourceId,
    provider: "NOAA SWPC",
    product: "preview data",
    data,
    observedAt,
    fetchedAt: observedAt,
    sourceUrl: "https://services.swpc.noaa.gov/",
  };
  const resource = {
    envelope,
    state: "fresh" as const,
    cacheOutcome: "network" as const,
    observationAgeMs: 0,
  };
  return {
    sourceId,
    query: { refetch: () => Promise.resolve() },
    resource,
    data,
    state,
    refresh: () => Promise.resolve(),
  };
}

function buildKp(now: number, kpValues: number[]) {
  return kpValues.map((kp, i) => ({
    time_tag: new Date(now - (kpValues.length - 1 - i) * 10_800_000).toISOString(),
    kp,
    kind: (i < kpValues.length - 4
      ? "observed"
      : i < kpValues.length - 2
        ? "estimated"
        : "predicted") as "observed" | "estimated" | "predicted",
    noaa_scale: null,
    a_running: null,
  }));
}

function buildOutlook(now: number, kpPattern: number[]) {
  return kpPattern.map((kp, i) => ({
    date: new Date(now + i * 86_400_000).toISOString(),
    predicted_flux: 130 + Math.round(Math.sin(i / 4) * 25),
    predicted_planetary_a: kp >= 5 ? 30 + kp * 2 : 6 + kp,
    predicted_kp: kp,
  }));
}

export function Default() {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const kp = buildKp(now, [2, 2, 3, 2, 3, 2, 3, 2, 2, 3, 3, 4]);
  const resources = {
    kp: buildView("noaa-k-index", kp, new Date(now).toISOString()),
    probabilities: buildView(
      "noaa-probabilities",
      {
        issue_time: new Date(now - 3_600_000).toISOString(),
        horizon: "1 day",
        c_class: 55,
        m_class: 15,
        x_class: 3,
        proton_10mev: 1,
      },
      new Date(now - 3_600_000).toISOString(),
    ),
    forecast: buildView(
      "noaa-flux-forecast",
      {
        issued_at: new Date(now - 7_200_000).toISOString(),
        forecast: [0, 1, 2].map((d) => ({
          date: new Date(now + d * 86_400_000).toISOString(),
          predicted_flux: 140 + d * 4,
          predicted_planetary_a: 8 + d,
        })),
      },
      new Date(now - 7_200_000).toISOString(),
    ),
    outlook: buildView(
      "noaa-flux-outlook",
      {
        issued_at: new Date(now - 86_400_000).toISOString(),
        outlook: buildOutlook(now, [
          2, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 3, 2, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3,
          2, 2, 3, 2,
        ]),
      },
      new Date(now - 86_400_000).toISOString(),
    ),
  };
  const current = {
    predictedKp: kp.filter((p) => p.kind === "predicted"),
    probabilityWindowEnded: false,
  };
  return <SolarForecastPanel resources={resources} current={current} />;
}

export function StormOutlook() {
  const now = Date.parse("2026-09-08T12:00:00Z");
  const kp = buildKp(now, [3, 4, 5, 6, 7, 6, 5, 6, 7, 6, 5, 4]);
  const resources = {
    kp: buildView("noaa-k-index", kp, new Date(now).toISOString()),
    probabilities: buildView(
      "noaa-probabilities",
      {
        issue_time: new Date(now - 90_000_000).toISOString(),
        horizon: "1 day",
        c_class: 85,
        m_class: 45,
        x_class: 12,
        proton_10mev: 8,
      },
      new Date(now - 90_000_000).toISOString(),
      "stale",
    ),
    forecast: buildView(
      "noaa-flux-forecast",
      {
        issued_at: new Date(now - 7_200_000).toISOString(),
        forecast: [0, 1, 2].map((d) => ({
          date: new Date(now + d * 86_400_000).toISOString(),
          predicted_flux: 205 - d * 3,
          predicted_planetary_a: 32 + d * 4,
        })),
      },
      new Date(now - 7_200_000).toISOString(),
    ),
    outlook: buildView(
      "noaa-flux-outlook",
      {
        issued_at: new Date(now - 86_400_000).toISOString(),
        outlook: buildOutlook(now, [
          3, 4, 5, 6, 7, 6, 5, 4, 3, 3, 4, 5, 6, 5, 4, 3, 3, 4, 3, 3, 4, 3, 3,
          4, 3, 3, 4,
        ]),
      },
      new Date(now - 86_400_000).toISOString(),
    ),
  };
  const current = {
    predictedKp: kp.filter((p) => p.kind === "predicted"),
    probabilityWindowEnded: true,
  };
  return <SolarForecastPanel resources={resources} current={current} />;
}
