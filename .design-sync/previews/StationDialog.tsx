import { Button, KeyValueList, Stack, StationDialog } from "propulse";

export function EquipmentInspector() {
  return (
    <StationDialog
      open
      onClose={() => {}}
      title="IC-7300"
      description="Review data only. No inventory or operating setup has changed."
    >
      <Stack>
        <KeyValueList
          items={[
            { label: "Type", value: "Transceiver" },
            { label: "Ownership", value: "Owned" },
            { label: "Power rating", value: "100 W · User entered" },
          ]}
        />
        <Button variant="danger">Remove saved example</Button>
      </Stack>
    </StationDialog>
  );
}

export function ConfirmRemoval() {
  return (
    <StationDialog
      open
      onClose={() => {}}
      title="Remove this antenna?"
      description="This action removes the antenna from your station. Your log stays intact."
      footer={
        <>
          <Button>Keep antenna</Button>
          <Button variant="danger">Remove antenna</Button>
        </>
      }
    >
      <p>Destructive actions name the item and explain the consequence.</p>
    </StationDialog>
  );
}
