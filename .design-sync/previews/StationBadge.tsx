import { Inline, StationBadge, Stack, Surface } from "propulse";

export function Tones() {
  return (
    <Surface>
      <Inline>
        <StationBadge tone="neutral">Planned</StationBadge>
        <StationBadge tone="info">Public preview</StationBadge>
        <StationBadge tone="success">Connected</StationBadge>
        <StationBadge tone="warning">Draft only</StationBadge>
        <StationBadge tone="danger">Offline</StationBadge>
      </Inline>
    </Surface>
  );
}

export function InContext() {
  return (
    <Surface>
      <Stack>
        <Inline>
          <strong>IC-7300</strong>
          <StationBadge tone="success">Connected</StationBadge>
        </Inline>
        <Inline>
          <strong>Home HF</strong>
          <StationBadge tone="warning">Draft only</StationBadge>
        </Inline>
      </Stack>
    </Surface>
  );
}
