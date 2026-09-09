import { SpotBadge, Surface, Inline } from "propulse";

export function Types() {
  return (
    <Surface>
      <Inline>
        <SpotBadge type="atno" />
        <SpotBadge type="new" />
        <SpotBadge type="band-new" />
        <SpotBadge type="worked" />
        <SpotBadge type="alert" />
        <SpotBadge type="needed" />
        <SpotBadge type="verified" />
        <SpotBadge type="multi-spot" />
      </Inline>
    </Surface>
  );
}

export function Sizes() {
  return (
    <Surface>
      <Inline>
        <SpotBadge type="needed" size="xs" />
        <SpotBadge type="needed" size="sm" />
        <SpotBadge type="atno" size="xs" />
        <SpotBadge type="atno" size="sm" />
      </Inline>
    </Surface>
  );
}
