import { GlobeUnavailable } from "propulse";

export function WebglDisabled() {
  return (
    <div style={{ width: 420, height: 280 }}>
      <GlobeUnavailable
        reason="no-context"
        onRetry={() => {}}
        onUseFlatMap={() => {}}
      />
    </div>
  );
}

export function ContextLost() {
  return (
    <div style={{ width: 420, height: 280 }}>
      <GlobeUnavailable reason="threw" onRetry={() => {}} onUseFlatMap={() => {}} />
    </div>
  );
}
