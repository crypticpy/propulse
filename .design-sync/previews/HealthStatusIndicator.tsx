import { HealthStatusIndicator, Inline, Surface } from "propulse";

// No props expose the health snapshot itself — it comes live from
// useHealthMonitor. Only `compact` is settable, so these two cells show the
// honest live states the hook resolves to outside the app shell.
export function Compact() {
  return (
    <Surface>
      <Inline>
        <HealthStatusIndicator compact />
      </Inline>
    </Surface>
  );
}

export function Full() {
  return (
    <Surface>
      <HealthStatusIndicator />
    </Surface>
  );
}
