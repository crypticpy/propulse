import { MetricCard } from "propulse";

export function QuietSun() {
  return (
    <MetricCard
      label="SOLAR FLUX"
      value={142}
      unit="sfu"
      trend="up"
      description="High"
      color="#00ff88"
      tooltip="10.7 cm solar flux index, a proxy for ionizing radiation reaching the ionosphere."
    />
  );
}

export function GeomagneticStorm() {
  return (
    <MetricCard
      label="K-INDEX"
      value="7.0"
      unit="Kp"
      trend="down"
      description="Severe storm"
      color="#ff4455"
      tooltip="Planetary K-index; values at or above 5 indicate geomagnetic storming."
    />
  );
}

export function Loading() {
  return <MetricCard label="SUNSPOT NUMBER" value="--" unit="SSN" loading />;
}

export function Expandable() {
  return (
    <MetricCard
      label="IMF Bz"
      value="-4.2"
      unit="nT"
      trend="down"
      description="Southward"
      color="#ffaa00"
      delay={100}
      onClick={() => {}}
    />
  );
}
