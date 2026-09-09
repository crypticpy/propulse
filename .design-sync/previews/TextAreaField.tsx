import { Surface, TextAreaField } from "propulse";

export function Basic() {
  return (
    <Surface>
      <TextAreaField
        label="Station story"
        rows={4}
        placeholder="What do you enjoy operating?"
        hint="Shown on your public shack page."
        defaultValue="Weekend DXer chasing 20 m and 40 m CW. Portable FT8 when the bands are quiet."
      />
    </Surface>
  );
}
