import { PropagationIndex } from "propulse";

export function Supportive() {
  return (
    <PropagationIndex
      solarFlux={172}
      kIndex={1.7}
      bz={2.4}
      onExpand={() => {}}
      onExpandSummary={() => {}}
    />
  );
}

export function Disrupted() {
  return (
    <PropagationIndex
      solarFlux={92}
      kIndex={7.3}
      bz={-9.1}
      onExpand={() => {}}
    />
  );
}

export function MixedConditions() {
  return (
    <PropagationIndex
      solarFlux={112}
      kIndex={4.3}
      bz={-2.8}
      onExpand={() => {}}
    />
  );
}
