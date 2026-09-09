import { NVISAnalysis } from "propulse";

// NVISAnalysis takes lat/lon/sfi directly and computes everything else --
// no store dependency. Station coordinates below are grid square EM12
// (central Texas) per the brief's reference station.
export function ActiveConditions() {
  return (
    <div style={{ width: 380 }}>
      <NVISAnalysis lat={32.5} lon={-97.0} sfi={142} />
    </div>
  );
}

export function LowSfi() {
  return (
    <div style={{ width: 380 }}>
      <NVISAnalysis lat={32.5} lon={-97.0} sfi={68} />
    </div>
  );
}
