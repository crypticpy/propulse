import { SolarSeriesChart, Surface } from "propulse";

function hourlySeries(base: number, deltas: number[]) {
  const now = Date.now();
  let value = base;
  return deltas.map((d, i) => {
    value += d;
    return {
      timestamp: new Date(now - (deltas.length - i) * 60 * 60_000).toISOString(),
      value: Math.max(0, value),
      kind: (i >= deltas.length - 3 ? "predicted" : "observed") as
        | "observed"
        | "predicted",
    };
  });
}

export function SfiTrend() {
  const points = hourlySeries(
    122,
    [0, 2, 3, 1, 4, 2, 5, 3, 6, 4, 2, 3, 1, 2, 0, -1, 1, 2, 3, 1, 2, 1, 0, 1],
  );
  return (
    <Surface>
      <SolarSeriesChart points={points} label="Solar Flux Index" unit="SFI" />
    </Surface>
  );
}

export function KpBarsPlotOnly() {
  const points = hourlySeries(1, [
    0, 0, 1, 0, 1, 1, 0, -1, 1, 2, 1, 0, -1, 0, 1, 1, 0, -1, -1, 0, 1, 0, 0, 1,
  ]).map((p) => ({ ...p, value: Math.min(9, Math.max(0, Math.round(p.value))) }));
  return (
    <Surface>
      <SolarSeriesChart
        points={points}
        label="Planetary Kp Index"
        unit="Kp"
        min={0}
        max={9}
        intervalMs={3 * 60 * 60_000}
        thresholds={[{ value: 5, label: "Storm" }]}
        chrome="plot"
      />
    </Surface>
  );
}
