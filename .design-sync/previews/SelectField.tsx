import { SelectField, Stack, Surface } from "propulse";

export function Basic() {
  return (
    <Surface>
      <Stack>
        <SelectField label="Type" required defaultValue="tuner">
          <option value="">Choose a type</option>
          <option value="radio">Radio</option>
          <option value="tuner">Antenna tuner</option>
          <option value="antenna">Antenna</option>
          <option value="cable">Cable</option>
          <option value="switch">Antenna switch</option>
        </SelectField>
        <SelectField label="Connector" defaultValue="SO-239">
          <option>Unknown</option>
          <option>SO-239</option>
          <option>BNC</option>
          <option>N-type</option>
        </SelectField>
      </Stack>
    </Surface>
  );
}

export function WithError() {
  return (
    <Surface>
      <SelectField
        label="Band"
        defaultValue=""
        error="Choose the band this contact was made on."
      >
        <option value="">Choose a band</option>
        <option value="20m">20 m</option>
        <option value="40m">40 m</option>
      </SelectField>
    </Surface>
  );
}
