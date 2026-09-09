import { DXSpotList, Surface } from "propulse";

// No spots/data prop — DXSpotList reads live cluster spots from useDXStore,
// which is empty in this sandbox (no bridge/websocket connection). It
// renders its own honest "No spots match your filters" branch below a real
// filter bar, the same state the app shows before the first spot lands.
export function Docked() {
  return (
    <Surface style={{ width: 380 }}>
      <DXSpotList showHeader showFilters maxHeight="360px" />
    </Surface>
  );
}

export function Compact() {
  return (
    <Surface style={{ width: 300 }}>
      <DXSpotList compact showHeader={false} showFilters maxHeight="180px" />
    </Surface>
  );
}
