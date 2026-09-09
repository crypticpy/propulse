import { Button, Inline, Notice, Surface } from "propulse";

export function ActionRow() {
  return (
    <Inline>
      <Button variant="primary">Add equipment</Button>
      <Button>Save draft</Button>
      <Button variant="quiet">Cancel</Button>
    </Inline>
  );
}

export function StatusPair() {
  return (
    <Surface>
      <Inline>
        <Notice title="Connection saved" tone="success">
          Radio ANT 1 is connected to the tuner RF IN.
        </Notice>
        <Notice title="Firmware check" tone="info">
          IC-7300 firmware 1.42 is current.
        </Notice>
      </Inline>
    </Surface>
  );
}
