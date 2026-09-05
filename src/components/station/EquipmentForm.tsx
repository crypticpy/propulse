import { useEffect, useRef, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  ActionBar,
  Button,
  Checkbox,
  Dialog,
  Disclosure,
  EquipmentGlyph,
  Grid,
  IconButton,
  ImagePicker,
  Inline,
  Notice,
  ReorderControls,
  Section,
  SelectField,
  Stack,
  TextAreaField,
  TextField,
} from "@/components/station-ui";
import type { EquipmentKind } from "@/components/station-ui";
import "./equipment-form.css";

/** Form input only. W01 owns the persisted equipment/port contracts. */
export interface EquipmentFormValues {
  name: string;
  kind: EquipmentKind | "";
  ownership: "owned" | "planned" | "borrowed";
  ports: { id: string; name: string; connector: string }[];
  powerWatts: string;
  notes: string;
  photo: File | null;
  addToDraft: boolean;
}
const blank = (): EquipmentFormValues => ({
  name: "",
  kind: "",
  ownership: "owned",
  ports: [
    { id: "port-1", name: "RF IN", connector: "Unknown" },
    { id: "port-2", name: "RF OUT", connector: "Unknown" },
  ],
  powerWatts: "",
  notes: "",
  photo: null,
  addToDraft: false,
});

function portNameError(
  ports: EquipmentFormValues["ports"],
): string | undefined {
  if (ports.some((port) => !port.name.trim()))
    return "Name each port so you can find it when connecting equipment.";
  if (
    new Set(ports.map((port) => port.name.trim().toLowerCase())).size !==
    ports.length
  )
    return "Use a different name for each port.";
  return undefined;
}

export function EquipmentForm({
  onSave,
}: {
  onSave: (values: EquipmentFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const nextPort = useRef(3);
  const form = useRef<HTMLFormElement>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const [preview, setPreview] = useState<string>();
  const [photoKey, setPhotoKey] = useState(0);
  const [focusPort, setFocusPort] = useState<string>();
  useEffect(() => {
    if (!values.photo) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(values.photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [values.photo]);
  useEffect(() => {
    if (focusPort) {
      form.current
        ?.querySelector<HTMLInputElement>(`[name="${focusPort}"]`)
        ?.focus();
      setFocusPort(undefined);
    }
  }, [focusPort]);
  const update = <K extends keyof EquipmentFormValues>(
    key: K,
    value: EquipmentFormValues[K],
  ) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaved("");
    setErrors((previous) => {
      const next = { ...previous };
      if (key === "ports" && previous.ports) {
        const error = portNameError(value as EquipmentFormValues["ports"]);
        if (error) next.ports = error;
        else delete next.ports;
      } else delete next[key];
      delete next.save;
      return next;
    });
  };
  const movePort = (index: number, delta: number) => {
    const ports = [...values.ports];
    [ports[index], ports[index + delta]] = [ports[index + delta], ports[index]];
    update("ports", ports);
    setFocusPort(ports[index + delta].id);
  };
  const reset = () => {
    setValues(blank());
    setErrors({});
    setSaved("");
    setPhotoKey((key) => key + 1);
    setResetOpen(false);
  };
  return (
    <>
      <form
        ref={form}
        noValidate
        className="equipment-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving.current) return;
          const nextErrors: Record<string, string> = {};
          if (!values.name.trim())
            nextErrors.name = "Give this equipment a name.";
          if (!values.kind) nextErrors.kind = "Choose an equipment type.";
          const portsError = portNameError(values.ports);
          if (portsError) nextErrors.ports = portsError;
          if (
            values.powerWatts &&
            (!Number.isFinite(Number(values.powerWatts)) ||
              Number(values.powerWatts) <= 0)
          )
            nextErrors.powerWatts =
              "Enter a power rating greater than zero, or leave it unknown.";
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length) {
            requestAnimationFrame(() => {
              const target = form.current?.querySelector<HTMLElement>(
                "[aria-invalid='true']",
              );
              target?.closest("details")?.setAttribute("open", "");
              target?.focus();
            });
            return;
          }
          saving.current = true;
          setPending(true);
          setSaved("");
          try {
            await onSave({
              ...values,
              name: values.name.trim(),
              ports: values.ports.map((port) => ({
                ...port,
                name: port.name.trim(),
              })),
            });
            setSaved(`${values.name.trim()} saved to this review session.`);
          } catch {
            setErrors({
              save: "The equipment could not be saved. Your entries are still here; try again.",
            });
          } finally {
            saving.current = false;
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending} className="equipment-form-fields">
          <Stack>
            <Section
              title="Basics"
              description="Start with what you know. You can fill in the rest later."
            >
              <div className="equipment-basics">
                <Stack>
                  <TextField
                    label="Name"
                    name="name"
                    required
                    autoComplete="off"
                    placeholder="e.g. Homebrew antenna tuner"
                    value={values.name}
                    error={errors.name}
                    maxLength={120}
                    onChange={(event) => update("name", event.target.value)}
                  />
                  <Grid>
                    <SelectField
                      label="Type"
                      name="kind"
                      required
                      value={values.kind}
                      error={errors.kind}
                      onChange={(event) =>
                        update(
                          "kind",
                          event.target.value as EquipmentFormValues["kind"],
                        )
                      }
                    >
                      <option value="">Choose a type</option>
                      <option value="radio">Radio</option>
                      <option value="tuner">Antenna tuner</option>
                      <option value="antenna">Antenna</option>
                      <option value="cable">Cable</option>
                      <option value="switch">Antenna switch</option>
                    </SelectField>
                    <SelectField
                      label="Ownership"
                      value={values.ownership}
                      onChange={(event) =>
                        update(
                          "ownership",
                          event.target
                            .value as EquipmentFormValues["ownership"],
                        )
                      }
                    >
                      <option value="owned">Owned</option>
                      <option value="planned">Planned</option>
                      <option value="borrowed">Borrowed</option>
                    </SelectField>
                  </Grid>
                </Stack>
                <ImagePicker
                  key={photoKey}
                  previewUrl={preview}
                  fileName={values.photo?.name}
                  onChange={(file) => update("photo", file)}
                  placeholder={<EquipmentGlyph kind={values.kind || "tuner"} />}
                />
              </div>
            </Section>
            <Section
              title="Connections"
              description="Name the sockets on your equipment. Unknown connectors are fine."
              actions={
                <Button
                  disabled={values.ports.length >= 16}
                  onClick={() => {
                    const id = `port-${nextPort.current++}`;
                    update("ports", [
                      ...values.ports,
                      { id, name: "", connector: "Unknown" },
                    ]);
                    setFocusPort(id);
                  }}
                >
                  <Plus size={17} aria-hidden="true" />
                  Add port
                </Button>
              }
            >
              {errors.ports && (
                <Notice tone="danger" title="Check port names" live>
                  {errors.ports}
                </Notice>
              )}
              {values.ports.length === 0 && (
                <p className="su-hint">
                  No ports yet. You can add connections whenever you are ready.
                </p>
              )}
              <Stack>
                {values.ports.map((port, index) => (
                  <div className="equipment-port-row" key={port.id}>
                    <TextField
                      label={`Port ${index + 1} name`}
                      name={port.id}
                      value={port.name}
                      maxLength={40}
                      error={
                        errors.ports
                          ? "Check that this name is filled in and unique."
                          : undefined
                      }
                      onChange={(event) =>
                        update(
                          "ports",
                          values.ports.map((item) =>
                            item.id === port.id
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <SelectField
                      label={`Port ${index + 1} connector`}
                      value={port.connector}
                      onChange={(event) =>
                        update(
                          "ports",
                          values.ports.map((item) =>
                            item.id === port.id
                              ? { ...item, connector: event.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      {[
                        "Unknown",
                        "SO-239",
                        "PL-259",
                        "BNC",
                        "N-type",
                        "SMA",
                        "Binding posts",
                        "Other",
                      ].map((connector) => (
                        <option key={connector}>{connector}</option>
                      ))}
                    </SelectField>
                    <Inline>
                      <ReorderControls
                        label={port.name || `port ${index + 1}`}
                        first={index === 0}
                        last={index === values.ports.length - 1}
                        onMoveUp={() => movePort(index, -1)}
                        onMoveDown={() => movePort(index, 1)}
                      />
                      <IconButton
                        label={`Remove ${port.name || `port ${index + 1}`}`}
                        onClick={() => {
                          const remaining = values.ports.filter(
                            (item) => item.id !== port.id,
                          );
                          update("ports", remaining);
                          if (remaining.length)
                            setFocusPort(
                              remaining[Math.min(index, remaining.length - 1)]
                                .id,
                            );
                          else
                            form.current
                              ?.querySelector<HTMLButtonElement>(
                                ".su-section-heading button",
                              )
                              ?.focus();
                        }}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </IconButton>
                    </Inline>
                  </div>
                ))}
              </Stack>
            </Section>
            <Disclosure
              title="Technical details"
              summary="Optional · power rating"
            >
              <TextField
                label="Power rating"
                name="powerWatts"
                type="number"
                min="0"
                step="any"
                suffix="W"
                hint="Power in watts. Leave blank when unknown. This is your entry, not a verified rating."
                value={values.powerWatts}
                error={errors.powerWatts}
                onChange={(event) => update("powerWatts", event.target.value)}
              />
            </Disclosure>
            <Disclosure
              title="Private details"
              summary="Optional · personal notes"
            >
              <TextAreaField
                label="Personal notes"
                hint="Keep purchase information, maintenance notes or reminders here."
                rows={4}
                maxLength={2000}
                value={values.notes}
                onChange={(event) => update("notes", event.target.value)}
              />
            </Disclosure>
            <p className="equipment-privacy">
              <ShieldCheck size={18} aria-hidden="true" />
              Your inventory starts private. You decide what appears on your
              public shack.
            </p>
            <Checkbox
              label="Add to Home HF draft"
              hint="Keeps your current operating setup unchanged."
              checked={values.addToDraft}
              onChange={(event) => update("addToDraft", event.target.checked)}
            />
            {errors.save && (
              <Notice tone="danger" title="Save failed" live>
                {errors.save}
              </Notice>
            )}
            {saved && (
              <Notice tone="success" title="Saved example" live>
                {saved} You can inspect it in the saved examples below.
              </Notice>
            )}
            <ActionBar
              leading={
                <span className="su-hint">Custom / homebrew equipment</span>
              }
            >
              <Button onClick={() => setResetOpen(true)}>Reset form</Button>
              <Button type="submit" variant="primary" pending={pending}>
                Save example
              </Button>
            </ActionBar>
          </Stack>
        </fieldset>
      </form>
      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset this form?"
        description="Your unsaved entries and photo will be cleared. Saved examples stay in this review session."
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Keep editing</Button>
            <Button variant="danger" onClick={reset}>
              Reset form
            </Button>
          </>
        }
      >
        <p>Start again with blank equipment details.</p>
      </Dialog>
    </>
  );
}
