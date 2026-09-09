import { ProgressBar, Stack, Surface } from "propulse";

export function Colors() {
  return (
    <Surface>
      <Stack>
        <ProgressBar value={82} label="Aurora Probability" color="green" showValue />
        <ProgressBar value={45} label="Geomagnetic Storm Risk" color="amber" showValue />
        <ProgressBar value={18} label="Blackout Risk" color="red" showValue />
        <ProgressBar value={60} label="DXCC Progress" color="orange" showValue />
      </Stack>
    </Surface>
  );
}

export function Minimal() {
  return (
    <Surface>
      <ProgressBar value={70} color="cyan" />
    </Surface>
  );
}
