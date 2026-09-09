import { ActionBar, Button, Surface } from "propulse";

export function SaveCancel() {
  return (
    <Surface>
      <ActionBar>
        <Button variant="primary">Done</Button>
        <Button variant="quiet">Cancel</Button>
      </ActionBar>
    </Surface>
  );
}

export function WithLeading() {
  return (
    <Surface>
      <ActionBar leading={<span className="su-hint">3 antennas selected</span>}>
        <Button variant="danger">Remove</Button>
        <Button>Move to portable kit</Button>
      </ActionBar>
    </Surface>
  );
}
