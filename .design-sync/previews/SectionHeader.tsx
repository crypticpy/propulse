import { useState } from "react";
import { Badge, SectionHeader, Stack, Surface } from "propulse";

export function Plain() {
  return (
    <Surface>
      <SectionHeader
        title="Band Conditions"
        summary="20 m through 10 m, updated every 15 minutes"
      />
    </Surface>
  );
}

export function WithAction() {
  return (
    <Surface>
      <SectionHeader
        title="DX Cluster"
        summary="42 spots in the last hour"
        action={<Badge status="active">Live</Badge>}
      />
    </Surface>
  );
}

export function Toggle() {
  const [open, setOpen] = useState(true);
  return (
    <Stack>
      <SectionHeader
        title="Solar-Terrestrial Data"
        summary="SFI 142 · Kp 3 · A 8"
        toggle={{ open, onToggle: () => setOpen((v) => !v), controls: "std-panel" }}
      />
      <SectionHeader
        title="K-Index History"
        toggle={{
          open: false,
          onToggle: () => {},
          controls: "kindex-panel",
        }}
      />
    </Stack>
  );
}

export function StackedNarrow() {
  return (
    <div style={{ width: 300 }}>
      <Surface>
        <SectionHeader
          layout="stack"
          title="Daylight"
          summary="Solar altitude through the UTC day, with sunrise and sunset."
          action={<Badge status="fair">Location needed</Badge>}
        />
      </Surface>
    </div>
  );
}
