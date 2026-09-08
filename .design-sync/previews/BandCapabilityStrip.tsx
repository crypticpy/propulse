import { BandCapabilityStrip, Surface } from "propulse";

export function MixedLoss() {
  return (
    <Surface>
      <BandCapabilityStrip
        bands={[
          { band: "160m", lossDb: 0.9 },
          { band: "80m", lossDb: 1.1 },
          { band: "40m", lossDb: 1.6 },
          { band: "20m", lossDb: 2.4 },
          { band: "15m", lossDb: 3.5 },
          { band: "10m", lossDb: 4.9 },
          { band: "6m", lossDb: 7.2 },
        ]}
      />
    </Surface>
  );
}

export function Empty() {
  return (
    <Surface>
      <BandCapabilityStrip bands={[]} />
    </Surface>
  );
}
