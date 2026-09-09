import { WorkStationPanel, Surface } from "propulse";

const spot = {
  id: "spot-1",
  spotter: "N0CALL",
  dx: "VK6LC",
  dxGrid: "OF87",
  frequency: 14195.0,
  mode: "SSB",
  comment: "5x9 rag chew",
  time: new Date(),
  band: "20m",
  dxLat: -31.9,
  dxLon: 115.9,
};

export function WithTarget() {
  return (
    <Surface>
      <div style={{ width: 340 }}>
        <WorkStationPanel spot={spot} onClose={() => {}} onSetTarget={() => {}} />
      </div>
    </Surface>
  );
}

export function WithoutTarget() {
  return (
    <Surface>
      <div style={{ width: 340 }}>
        <WorkStationPanel spot={spot} onClose={() => {}} />
      </div>
    </Surface>
  );
}
