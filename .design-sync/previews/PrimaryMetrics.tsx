import { PrimaryMetrics } from "propulse";

export function QuietSun() {
  return (
    <PrimaryMetrics
      kIndex={2.3}
      solarFlux={142}
      sunspotNumber={88}
      bz={2.1}
      solarFluxData={[
        { time_tag: "2026-09-07T00:00:00Z", flux: 135 },
        { time_tag: "2026-09-07T12:00:00Z", flux: 138 },
        { time_tag: "2026-09-08T00:00:00Z", flux: 142 },
      ]}
      bzData={[
        { time_tag: "2026-09-08T00:00:00Z", bz: 1.2 },
        { time_tag: "2026-09-08T04:00:00Z", bz: 2.1 },
      ]}
    />
  );
}

export function GeomagneticStorm() {
  return (
    <PrimaryMetrics
      kIndex={7.3}
      solarFlux={210}
      sunspotNumber={168}
      bz={-8.6}
    />
  );
}

export function Loading() {
  return (
    <PrimaryMetrics kIndex={3} solarFlux={140} sunspotNumber={90} loading />
  );
}

export function PartiallyLoading() {
  return (
    <PrimaryMetrics
      kIndex={3.3}
      solarFlux={150}
      sunspotNumber={null}
      bz={-1.4}
      loadingStates={{ kp: false, sfi: false, ssn: true, bz: false }}
    />
  );
}
