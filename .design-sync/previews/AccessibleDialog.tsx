import { AccessibleDialog, Stack, TextField, SelectField, Surface } from "propulse";

export function EditLocation() {
  return (
    <AccessibleDialog
      open
      onClose={() => {}}
      title="Edit Saved Location"
      description="Update the QTH used for path and propagation calculations."
      size="lg"
    >
      <Stack>
        <TextField label="Label" defaultValue="Home shack" />
        <TextField label="Grid square" defaultValue="EM12ov" />
        <SelectField label="Antenna" defaultValue="hex-beam">
          <option value="hex-beam">Hex Beam @ 12 m</option>
          <option value="dipole">80 m Dipole</option>
          <option value="vertical">40 m Vertical</option>
        </SelectField>
      </Stack>
    </AccessibleDialog>
  );
}

export function BareChrome() {
  return (
    <AccessibleDialog
      open
      onClose={() => {}}
      title="HamClock Report"
      chrome="bare"
      size="md"
      panelProps={{ className: "bg-su-panel/95 border border-su-line/40 rounded-2xl p-5" }}
    >
      <Surface>
        <Stack>
          <p className="text-xs uppercase tracking-wide text-su-muted">
            Band conditions &mdash; 20 m
          </p>
          <p className="text-sm text-su-text">
            SFI 142, Kp 3. Path to VK6LC (short path) is open with fair
            reliability through 22:00 UTC.
          </p>
        </Stack>
      </Surface>
    </AccessibleDialog>
  );
}
