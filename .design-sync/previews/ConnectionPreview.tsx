import { ConnectionPreview, Surface } from "propulse";

export function ShortChain() {
  return (
    <Surface>
      <ConnectionPreview
        endpoints={["Radio · ANT 1", "Tuner · RF IN", "Dipole · FEED"]}
      />
    </Surface>
  );
}

export function CustomLabel() {
  return (
    <Surface>
      <ConnectionPreview
        label="Signal chain"
        endpoints={["IC-7300 · ANT 1", "LDG AT-200 · RF OUT", "40 m dipole"]}
      />
    </Surface>
  );
}
