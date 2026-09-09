import { TrendSparkline, Surface, Inline } from "propulse";

function series(base: number, deltas: number[], startHoursAgo: number) {
  const now = Date.now();
  let value = base;
  return deltas.map((d, i) => {
    value += d;
    return {
      timestamp: new Date(
        now - (startHoursAgo - i) * 60 * 60_000,
      ).toISOString(),
      value,
    };
  });
}

export function RisingSfi() {
  const points = series(128, [0, 2, 1, 3, 4, 2, 5, 3], 7);
  return (
    <Surface>
      <Inline className="items-center">
        <span className="text-xs text-su-muted">SFI 24h</span>
        <TrendSparkline points={points} label="Solar flux index, last 24 hours" className="text-signal-green" />
      </Inline>
    </Surface>
  );
}

export function FallingKp() {
  const points = series(5, [0, -1, -1, 1, -1, -2, 0, -1], 7);
  return (
    <Surface>
      <Inline className="items-center">
        <span className="text-xs text-su-muted">Kp 24h</span>
        <TrendSparkline points={points} label="Planetary K index, last 24 hours" className="text-caution-amber" />
      </Inline>
    </Surface>
  );
}
