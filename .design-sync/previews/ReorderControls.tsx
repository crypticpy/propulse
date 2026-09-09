import { Inline, ReorderControls, Stack, Surface } from "propulse";

export function AntennaList() {
  return (
    <Surface>
      <Stack>
        <Inline>
          <span>1. 40 m dipole</span>
          <ReorderControls
            label="40 m dipole"
            onMoveUp={() => {}}
            onMoveDown={() => {}}
            first
            last={false}
          />
        </Inline>
        <Inline>
          <span>2. 20 m vertical</span>
          <ReorderControls
            label="20 m vertical"
            onMoveUp={() => {}}
            onMoveDown={() => {}}
            first={false}
            last={false}
          />
        </Inline>
        <Inline>
          <span>3. 6 m loop</span>
          <ReorderControls
            label="6 m loop"
            onMoveUp={() => {}}
            onMoveDown={() => {}}
            first={false}
            last
          />
        </Inline>
      </Stack>
    </Surface>
  );
}
