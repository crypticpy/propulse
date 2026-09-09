import { Checkbox, Stack, Surface } from "propulse";

export function Basic() {
  return (
    <Surface>
      <Stack>
        <Checkbox label="Add to Home HF draft" defaultChecked />
        <Checkbox label="Include in the public shack" />
      </Stack>
    </Surface>
  );
}

export function WithHint() {
  return (
    <Surface>
      <Checkbox
        label="Include in the public shack"
        hint="Only the details you choose will appear."
      />
    </Surface>
  );
}
