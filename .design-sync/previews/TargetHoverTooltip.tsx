import { TargetHoverTooltip } from "propulse";

export function GoodSignal() {
  return (
    <div style={{ width: 900, height: 700, position: "relative" }}>
      <TargetHoverTooltip
        visible
        position={{ x: 380, y: 280 }}
        label="JA1XYZ"
        grid="PM95"
        contextLabel="Cluster spot · 14.074 MHz FT8"
        difficulty={3}
        optimalSignal={{
          band: "20m",
          status: "good",
          sUnit: { value: 6, text: "S6", dBm: -55 },
          snrEstimate: -8,
          confidence: 72,
          notes: "Modeled single-hop F2 skip, short path.",
          isEstimated: true,
        }}
        distanceKm={10897}
        bearing={305}
        interactive
      />
    </div>
  );
}

export function Unavailable() {
  return (
    <div style={{ width: 900, height: 700, position: "relative" }}>
      <TargetHoverTooltip
        visible
        position={{ x: 380, y: 280 }}
        label="VK6LC"
        grid="OF88"
        difficulty={5}
        optimalSignal={null}
        signalUnavailableReason="No modeled HF path — station QTH not set."
        distanceKm={17462}
        bearing={241}
      />
    </div>
  );
}
