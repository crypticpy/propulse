import { Button, Notice, Stack, Surface } from "propulse";

export function EquipmentReview() {
  return (
    <Surface>
      <Stack>
        <h3>IC-7300 · Home HF</h3>
        <p className="su-hint">
          Transceiver · Owned · 100 W · Firmware 1.42
        </p>
        <Notice title="Changes not yet in use" tone="warning">
          Save your draft, then review it before it powers your forecasts.
        </Notice>
        <Button variant="primary">Save changes</Button>
      </Stack>
    </Surface>
  );
}

export function FormFooter() {
  return (
    <Stack>
      <h3>Add antenna</h3>
      <p>Give this antenna a name you will recognize on the canvas.</p>
      <Button variant="primary">Save antenna</Button>
      <Button variant="quiet">Discard changes</Button>
    </Stack>
  );
}
