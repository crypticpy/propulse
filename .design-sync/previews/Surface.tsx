import { Button, KeyValueList, Notice, Stack, Surface } from "propulse";

export function EquipmentCard() {
  return (
    <Surface>
      <KeyValueList
        items={[
          { label: "Type", value: "Transceiver" },
          { label: "Ownership", value: "Owned" },
          { label: "Power rating", value: "100 W · User entered" },
        ]}
      />
    </Surface>
  );
}

export function AlertCard() {
  return (
    <Surface>
      <Stack>
        <Notice title="Connection saved" tone="success">
          Radio ANT 1 is connected to the tuner RF IN.
        </Notice>
        <Button variant="quiet">Undo</Button>
      </Stack>
    </Surface>
  );
}
