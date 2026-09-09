import { HomeForecastStrip, Surface } from "propulse";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

function buildModel(state: "fresh" | "stale") {
  return {
    current: {
      kp: { kp: 3.3, kind: "3-hour" },
      flux: { flux: 142 },
      predictedKp: [],
    },
    resources: {
      kp: { state },
      flux: { state },
      forecast: { state, data: null },
    },
  };
}

export function AwaitingLocation() {
  return (
    <Surface>
      <HomeForecastStrip model={buildModel("fresh")} now={NOW} />
    </Surface>
  );
}

export function StaleSignal() {
  return (
    <Surface>
      <HomeForecastStrip model={buildModel("stale")} now={NOW} />
    </Surface>
  );
}
