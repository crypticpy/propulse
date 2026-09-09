import { SolarOutlookBars, Surface } from "propulse";

function buildOutlook(kpPattern: number[]) {
  const start = Date.parse("2026-09-08T00:00:00Z");
  return kpPattern.map((kp, i) => ({
    date: new Date(start + i * 86_400_000).toISOString(),
    predicted_flux: 130 + Math.round(Math.sin(i / 4) * 25),
    predicted_planetary_a: kp >= 5 ? 30 + kp * 2 : 6 + kp,
    predicted_kp: kp,
  }));
}

export function SteadyConditions() {
  const outlook = buildOutlook([
    2, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 3, 2, 2, 3, 2, 2, 3, 2, 3, 2, 2, 3, 2, 2,
    3, 2,
  ]);
  return (
    <Surface>
      <SolarOutlookBars outlook={outlook} />
    </Surface>
  );
}

export function StormApproaching() {
  const outlook = buildOutlook([
    2, 2, 3, 3, 4, 5, 6, 5, 4, 3, 3, 2, 2, 3, 3, 4, 5, 4, 3, 2, 2, 3, 2, 2, 3,
    2, 2,
  ]);
  return (
    <Surface>
      <SolarOutlookBars outlook={outlook} />
    </Surface>
  );
}
