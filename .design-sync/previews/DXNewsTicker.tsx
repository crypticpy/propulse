import { DXNewsTicker, Surface } from "propulse";

// DXNewsTicker takes className/visible -- headline content comes from the
// DX news feed hook itself. This sandbox has no feed loaded, so this is
// the honest empty/loading ticker state.
export function Default() {
  return (
    <Surface style={{ width: 480 }}>
      <DXNewsTicker />
    </Surface>
  );
}

export function Hidden() {
  return (
    <Surface style={{ width: 480 }}>
      <DXNewsTicker visible={false} />
    </Surface>
  );
}
