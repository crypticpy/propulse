import { SetupStatus, Surface } from "propulse";

export function Dirty() {
  return (
    <Surface>
      <SetupStatus editing="Home HF" using="Portable kit" dirty />
    </Surface>
  );
}

export function Clean() {
  return (
    <Surface>
      <SetupStatus editing="Home HF" using="Home HF" dirty={false} />
    </Surface>
  );
}
