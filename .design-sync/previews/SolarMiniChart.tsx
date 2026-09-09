import { SolarMiniChart, Surface } from "propulse";

function buildKpPoints() {
  const start = Date.parse("2026-09-08T00:00:00Z");
  const values = [2, 2, 3, 3, 4, 5, 4, 3];
  const kinds: Array<"observed" | "estimated" | "predicted"> = [
    "observed",
    "observed",
    "observed",
    "observed",
    "estimated",
    "predicted",
    "predicted",
    "predicted",
  ];
  return values.map((value, i) => ({
    timestamp: new Date(start + i * 10_800_000).toISOString(),
    value,
    kind: kinds[i],
  }));
}

export function KpTimeline() {
  return (
    <Surface>
      <SolarMiniChart
        points={buildKpPoints()}
        label="Planetary Kp: observed, estimated, and predicted"
        unit="Kp"
        min={0}
        max={9}
        intervalMs={10_800_000}
        maxGapMs={10_800_000}
      />
    </Surface>
  );
}

export function SolarFluxTrend() {
  const start = Date.parse("2026-09-06T00:00:00Z");
  const points = [138, 140, 141, 145, 148, 150, 149, 152].map((flux, i) => ({
    timestamp: new Date(start + i * 21_600_000).toISOString(),
    value: flux,
  }));
  return (
    <Surface>
      <SolarMiniChart
        points={points}
        label="10.7 cm solar flux"
        unit="sfu"
        maxGapMs={21_600_000 * 2}
      />
    </Surface>
  );
}

export function WaitingForReadings() {
  return (
    <Surface>
      <SolarMiniChart
        points={[]}
        label="Planetary Kp"
        unit="Kp"
        min={0}
        max={9}
        intervalMs={10_800_000}
        maxGapMs={10_800_000}
        minPlotHeight={96}
      />
    </Surface>
  );
}
