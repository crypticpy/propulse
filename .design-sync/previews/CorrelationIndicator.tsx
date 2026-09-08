import { CorrelationIndicator, Surface, Inline } from "propulse";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Inline className="items-center gap-2">
      <span className="w-14 text-[11px] font-mono text-su-muted">{label}</span>
      {children}
    </Inline>
  );
}

export function Confirmed() {
  return (
    <Surface style={{ width: 260, padding: 24 }}>
      <Row label="20m">
        <CorrelationIndicator
          agreement="confirmed"
          confidence={88}
          spotCount={14}
          details="14 live spots on 20m match the modeled F2 propagation window."
        />
      </Row>
    </Surface>
  );
}

export function Unverified() {
  return (
    <Surface style={{ width: 260, padding: 24 }}>
      <Row label="17m">
        <CorrelationIndicator
          agreement="unverified"
          confidence={45}
          spotCount={0}
          details="Model predicts marginal 17m propagation; no spots reported yet."
        />
      </Row>
    </Surface>
  );
}

export function Discrepancy() {
  return (
    <Surface style={{ width: 260, padding: 24 }}>
      <Row label="10m">
        <CorrelationIndicator
          agreement="discrepancy"
          confidence={62}
          spotCount={0}
          details="Model predicts 10m open via Sporadic-E, but no spots have been observed in 30 minutes."
        />
      </Row>
    </Surface>
  );
}

export function Surprise() {
  return (
    <Surface style={{ width: 260, padding: 24 }}>
      <Row label="80m">
        <CorrelationIndicator
          agreement="surprise"
          confidence={71}
          spotCount={5}
          details="5 spots reported on 80m even though the model predicted the band closed."
        />
      </Row>
    </Surface>
  );
}
