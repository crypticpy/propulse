import { Stack, Surface, TextField } from "propulse";

export function Variants() {
  return (
    <Surface>
      <Stack>
        <TextField
          label="Equipment name"
          placeholder="Homebrew antenna tuner"
          required
          hint="Use a name you will recognize on the canvas."
        />
        <TextField
          label="Power rating"
          type="number"
          min="0"
          suffix="W"
          defaultValue="100"
          hint="Power in watts. Leave blank when unknown."
        />
      </Stack>
    </Surface>
  );
}

export function States() {
  return (
    <Surface>
      <Stack>
        <TextField
          label="Callsign"
          defaultValue="W1AW"
          disabled
          hint="Verified from your profile."
        />
        <TextField
          label="Port name"
          defaultValue=""
          error="Name each port so you can find it when connecting equipment."
        />
      </Stack>
    </Surface>
  );
}
