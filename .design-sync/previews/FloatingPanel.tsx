import { FloatingPanel, MetricCard } from "propulse";

export function Default() {
  return (
    <FloatingPanel
      id="band-conditions"
      title="Band Conditions"
      defaultPosition={{ x: 5, y: 10 }}
      defaultSize={{ width: 320, height: 240 }}
      onCollapse={() => {}}
      onFocus={() => {}}
    >
      <div className="p-3">
        <MetricCard label="SOLAR FLUX" value={142} unit="sfu" description="High" color="#00ff88" />
      </div>
    </FloatingPanel>
  );
}

export function Collapsed() {
  return (
    <FloatingPanel
      id="dx-cluster"
      title="DX Cluster"
      defaultPosition={{ x: 40, y: 15 }}
      defaultSize={{ width: 320, height: 240 }}
      collapsed
      onCollapse={() => {}}
    >
      <div className="p-3 text-sm text-su-text">DX cluster spots</div>
    </FloatingPanel>
  );
}
