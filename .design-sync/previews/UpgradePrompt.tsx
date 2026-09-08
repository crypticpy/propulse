import { UpgradePrompt, Surface } from "propulse";

export function Full() {
  return (
    <Surface>
      <UpgradePrompt feature="Contest Multiplier Analysis" />
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface>
      <UpgradePrompt feature="Satellite Pass Predictions" compact />
    </Surface>
  );
}
