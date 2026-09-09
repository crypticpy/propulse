import { ClusterTile } from "propulse";

// No props: gated on useActiveLocation, same as BestBandTile. With no
// station configured this sandbox renders the tile's own "SET HOME IN
// SETTINGS" placeholder — the tile's minimal no-hero variant for that case.
export function Wall() {
  return (
    <div style={{ width: 340 }}>
      <ClusterTile />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 220 }}>
      <ClusterTile />
    </div>
  );
}
