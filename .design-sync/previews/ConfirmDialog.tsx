import { ConfirmDialog } from "propulse";

export function Destructive() {
  return (
    <ConfirmDialog
      open
      onConfirm={() => {}}
      onCancel={() => {}}
      title="Delete this QSO?"
      message="This will permanently remove the contact with JA1XYZ (20 m, CW, 14:02 UTC) from your logbook. This cannot be undone."
      variant="destructive"
    />
  );
}

export function Warning() {
  return (
    <ConfirmDialog
      open
      onConfirm={() => {}}
      onCancel={() => {}}
      title="Overwrite draft settings?"
      message="You have unsaved changes to your station profile. Applying the new preset will discard them."
      confirmLabel="Overwrite"
      cancelLabel="Keep editing"
      variant="warning"
    />
  );
}

export function Default() {
  return (
    <ConfirmDialog
      open
      onConfirm={() => {}}
      onCancel={() => {}}
      title="Reset band plan to defaults?"
      message="Your custom IARU Region 1 band edges will be replaced with the stock plan."
      confirmLabel="Reset"
      cancelLabel="Cancel"
      variant="default"
    />
  );
}
