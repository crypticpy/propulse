import { Button, PageHeader, Stack } from "propulse";

export function StationHeader() {
  return (
    <Stack>
      <PageHeader
        eyebrow="THE STATION FOUNDATION"
        title="Made for your shack."
        description="One shared language for your gear, connections and operator story."
        actions={<Button variant="primary">Add equipment</Button>}
      />
    </Stack>
  );
}

export function PlainTitle() {
  return (
    <Stack>
      <PageHeader
        title="Saved examples"
        description="Inspect the values captured by this form."
      />
    </Stack>
  );
}
