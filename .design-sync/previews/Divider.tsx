import { Button, Divider, Stack, Surface } from "propulse";

export function BetweenSections() {
  return (
    <Surface>
      <Stack>
        <p className="su-eyebrow">STATION</p>
        <p>IC-7300 · Home HF · 100 W</p>
        <Divider />
        <p className="su-eyebrow">OPERATOR</p>
        <p>N0CALL · Alex Rivera · EM12</p>
        <Divider />
        <Button variant="quiet">Edit station</Button>
      </Stack>
    </Surface>
  );
}
