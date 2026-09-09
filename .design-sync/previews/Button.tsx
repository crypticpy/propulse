import { Button, Inline, Stack } from "propulse";

export function Variants() {
  return (
    <Inline>
      <Button variant="primary">Add equipment</Button>
      <Button>Save draft</Button>
      <Button variant="quiet">Cancel</Button>
      <Button variant="danger">Remove equipment</Button>
    </Inline>
  );
}

export function States() {
  return (
    <Inline>
      <Button variant="primary" disabled>
        Unavailable
      </Button>
      <Button pending>Saving</Button>
      <Button variant="danger" disabled>
        Remove equipment
      </Button>
    </Inline>
  );
}

export function FormFooter() {
  return (
    <Stack>
      <Inline>
        <Button variant="primary" type="submit">
          Save station
        </Button>
        <Button variant="quiet">Discard changes</Button>
      </Inline>
    </Stack>
  );
}
