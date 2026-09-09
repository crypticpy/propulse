import { HomeSolar, Surface } from "propulse";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

function buildModel(state: "fresh" | "stale") {
  return {
    current: {
      kp: { kp: 3.3, kind: "3-hour" },
      flux: { flux: 142 },
      xray: { flux: 2.1e-6 },
      xrayClass: "C2.1",
      predictedKp: [
        { time_tag: new Date(NOW + 3 * 3600000).toISOString(), kp: 3, kind: "predicted", noaa_scale: null, a_running: null },
        { time_tag: new Date(NOW + 6 * 3600000).toISOString(), kp: 4, kind: "predicted", noaa_scale: null, a_running: null },
      ],
    },
    resources: {
      kp: { state },
      flux: { state },
      xray: { state },
      forecast: {
        state,
        data: {
          issued_at: new Date(NOW - 3600000).toISOString(),
          forecast: [
            { date: "2026-09-09", predicted_flux: 145 },
            { date: "2026-09-10", predicted_flux: 148 },
          ],
        },
      },
    },
    briefing: {
      state,
      title: "Good conditions expected on 20m and 15m today.",
      missing: [],
      delayed: [],
      evidence: [
        { sourceId: "noaa-k-index", label: "NOAA K-index", sourceUrl: "https://services.swpc.noaa.gov/", state, observedAt: new Date(NOW - 900000).toISOString() },
      ],
    },
  };
}

export function Fresh() {
  return (
    <Surface>
      <HomeSolar model={buildModel("fresh")} now={NOW} />
    </Surface>
  );
}

export function Stale() {
  return (
    <Surface>
      <HomeSolar model={buildModel("stale")} now={NOW} />
    </Surface>
  );
}
