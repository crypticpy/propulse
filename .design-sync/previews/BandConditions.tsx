import { BandConditions } from "propulse";

export function QuietSun() {
  return <BandConditions kIndex={2} solarFlux={142} onExpand={() => {}} />;
}

export function GeomagneticStorm() {
  return <BandConditions kIndex={7} solarFlux={88} onExpand={() => {}} />;
}

export function Loading() {
  return <BandConditions kIndex={3} solarFlux={120} loading />;
}
