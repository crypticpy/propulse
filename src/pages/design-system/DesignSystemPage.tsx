import { useTextScale } from "@/hooks/useTextScale";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowRight, Plus, Settings2 } from "lucide-react";
import {
  EquipmentForm,
  type EquipmentFormValues,
} from "@/components/station/EquipmentForm";
import {
  ActionBar,
  ActionLink,
  Avatar,
  Badge,
  Button,
  Checkbox,
  ChoiceGroup,
  ConnectionPreview,
  Dialog,
  Divider,
  EmptyState,
  EquipmentTile,
  Grid,
  IconButton,
  Inline,
  KeyValueList,
  Notice,
  PageHeader,
  PortButton,
  ProvenanceBadge,
  Section,
  SectionNav,
  SelectField,
  SetupStatus,
  Skeleton,
  Stack,
  StationProvider,
  Surface,
  Switch,
  Table,
  Tabs,
  TextAreaField,
  TextField,
} from "@/components/station-ui";
import { Header } from "@/components/layout/Header";
import type { StationDensity, StationTextSize } from "@/components/station-ui";
import type { ThemeId } from "@/lib/themes";
import "./design-system.css";

export function DesignSystemPage() {
  useTextScale();
  const { pathname } = useLocation();
  const equipment = pathname === "/design-system/add-equipment";
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [textSize, setTextSize] = useState<StationTextSize>("standard");
  const [density, setDensity] = useState<StationDensity>("comfortable");
  const [accent, setAccent] = useState("#ff6b35");
  const [examples, setExamples] = useState<EquipmentFormValues[]>([]);
  const [selected, setSelected] = useState<EquipmentFormValues | null>(null);
  return (
    <>
      <nav aria-label="Skip navigation">
        <a href="#review-main" className="review-skip">
          Skip to content
        </a>
      </nav>
      <div className="station-review-header">
        <Header publicView />
      </div>
      <StationProvider
        theme={theme}
        density={density}
        textSize={textSize}
        accent={accent}
        className="station-review"
      >
        <div className="review-shell">
          <section className="review-toolbar" aria-label="Review controls">
            <SectionNav
              label="Design review"
              items={[
                {
                  href: "/design-system",
                  label: "Primitives",
                  current: !equipment,
                },
                {
                  href: "/design-system/add-equipment",
                  label: "Add equipment",
                  current: equipment,
                },
              ]}
            />
            <div className="review-settings">
              <SelectField
                label="Text size"
                value={textSize}
                onChange={(event) =>
                  setTextSize(event.target.value as StationTextSize)
                }
              >
                <option value="standard">Standard</option>
                <option value="large">Larger</option>
                <option value="extra-large">Largest</option>
              </SelectField>
              <SelectField
                label="Preview theme"
                value={theme}
                onChange={(event) => setTheme(event.target.value as ThemeId)}
              >
                <option value="dark">Deep space</option>
                <option value="light">Daylight</option>
                <option value="high-contrast">High contrast</option>
                <option value="midnight">Midnight</option>
              </SelectField>
              <SelectField
                label="Density"
                value={density}
                onChange={(event) =>
                  setDensity(event.target.value as StationDensity)
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </SelectField>
              <SelectField
                label="Accent"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
              >
                <option value="#ff6b35">Plasma</option>
                <option value="#8b5cf6">Cosmic</option>
                <option value="#22c55e">Aurora</option>
                <option value="#3b82f6">Ocean</option>
              </SelectField>
            </div>
          </section>
          <main
            id="review-main"
            className={
              equipment ? "review-content review-equipment" : "review-content"
            }
            tabIndex={-1}
          >
            {equipment ? (
              <Stack>
                <PageHeader
                  eyebrow="WORKBENCH / MY GEAR"
                  title="Add equipment"
                  description="Start with what you know. Make it yours as you go."
                />
                <Notice title="Interactive design review" tone="info">
                  Try the form and save an example. Entries stay in this page
                  session and disappear on reload; nothing is added to your
                  station or published.
                </Notice>
                <Surface>
                  <EquipmentForm
                    onSave={async (values) => {
                      setExamples((previous) => [...previous, values]);
                    }}
                  />
                </Surface>
                <Section
                  title="Saved examples"
                  description="Inspect the values captured by this form."
                >
                  {examples.length ? (
                    <Grid>
                      {examples.map((example, index) => (
                        <EquipmentTile
                          key={index}
                          opensDialog
                          name={example.name}
                          kind={example.kind || "tuner"}
                          detail={`${example.ports.length} ports · ${example.ownership}`}
                          onSelect={() => setSelected(example)}
                        />
                      ))}
                    </Grid>
                  ) : (
                    <EmptyState title="Your first piece of gear starts here">
                      Save an example above to see the completed form values.
                    </EmptyState>
                  )}
                </Section>
              </Stack>
            ) : (
              <Catalog />
            )}
          </main>
          <footer className="review-footer">
            ProPulse station foundation · v1 · Built for clear decisions,
            familiar controls and room to grow.
          </footer>
        </div>
        <Dialog
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.name ?? "Saved example"}
          description="Review data only. No inventory or operating setup has changed."
        >
          {selected && (
            <Stack>
              <KeyValueList
                items={[
                  { label: "Type", value: selected.kind },
                  { label: "Ownership", value: selected.ownership },
                  {
                    label: "Power rating",
                    value: selected.powerWatts
                      ? `${selected.powerWatts} W · User entered`
                      : "Unknown",
                  },
                  { label: "Photo", value: selected.photo?.name ?? "None" },
                  {
                    label: "Add to draft requested",
                    value: selected.addToDraft
                      ? "Home HF (example only)"
                      : "No",
                  },
                  { label: "Private notes", value: selected.notes || "None" },
                ]}
              />
              <Table caption="Equipment ports">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Connector</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.ports.map((port) => (
                    <tr key={port.id}>
                      <td>{port.name}</td>
                      <td>{port.connector}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Button
                variant="danger"
                onClick={() => {
                  setExamples((previous) =>
                    previous.filter((item) => item !== selected),
                  );
                  setSelected(null);
                }}
              >
                Remove saved example
              </Button>
            </Stack>
          )}
        </Dialog>
      </StationProvider>
    </>
  );
}

function Catalog() {
  const [tab, setTab] = useState("controls");
  const [choice, setChoice] = useState("owned");
  const [enabled, setEnabled] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [gear, setGear] = useState("tuner");
  const [port, setPort] = useState("RF IN");
  const [message, setMessage] = useState("");
  return (
    <Stack>
      <PageHeader
        eyebrow="THE STATION FOUNDATION"
        title="Made for your shack."
        description="One shared language for your gear, connections and operator story."
        actions={
          <ActionLink href="/design-system/add-equipment" variant="primary">
            Try the equipment page <ArrowRight size={18} aria-hidden="true" />
          </ActionLink>
        }
      />
      <div className="review-hero">
        <div>
          <p className="su-eyebrow">FAMILIAR, WITH ROOM TO EXPLORE</p>
          <h2>
            Less interface.
            <br />
            More operating.
          </h2>
          <p>
            A softened navy canvas. Clear labels. Orange for the next step.
            Every control adapts to the way you prefer to work.
          </p>
          <Inline>
            <Badge>44 px comfortable controls</Badge>
            <Badge>Keyboard ready</Badge>
            <Badge>Four themes</Badge>
          </Inline>
        </div>
        <Surface>
          <SetupStatus editing="Home HF" using="Portable kit" dirty />
          <ConnectionPreview
            endpoints={["Radio · ANT 1", "Tuner · RF IN", "Dipole · FEED"]}
          />
          <Inline>
            <ProvenanceBadge source="declared" />
            <ProvenanceBadge source="unknown" />
          </Inline>
        </Surface>
      </div>
      <Section
        title="The core palette"
        description="Semantic roles keep screens coherent across themes and personal accents."
      >
        <div className="review-swatches">
          {[
            "canvas",
            "panel",
            "input",
            "text",
            "muted",
            "accent",
            "info",
            "success",
            "warning",
            "danger",
          ].map((token) => (
            <div key={token}>
              <span style={{ background: `var(--su-${token})` }} />
              <code>{token}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title="A type system with a purpose">
        <Grid>
          <Surface>
            <p className="su-eyebrow">ORBITRON · HEADINGS</p>
            <h2>Your station, connected.</h2>
            <p>Inter keeps descriptions and controls familiar and readable.</p>
            <p className="review-mono">N0CALL · 14.074 MHz · EM29</p>
          </Surface>
          <Surface>
            <KeyValueList
              items={[
                { label: "Body", value: "16 px base · respects text scaling" },
                { label: "Spacing", value: "4 / 8 / 16 / 24 / 32 px" },
                { label: "Corners", value: "8 px controls · 12 px surfaces" },
                { label: "Focus", value: "Visible outline, never color alone" },
              ]}
            />
          </Surface>
        </Grid>
      </Section>
      <Section
        title="Components in context"
        description="Use the tabs with arrow keys. Try the controls, overlays and equipment selectors."
      >
        <Tabs
          label="Component categories"
          value={tab}
          onChange={setTab}
          items={[
            {
              value: "controls",
              label: "Controls & forms",
              content: (
                <Stack>
                  <Grid>
                    <Surface>
                      <Stack>
                        <h3>Actions</h3>
                        <Inline>
                          <Button
                            variant="primary"
                            onClick={() =>
                              setMessage("Primary action activated.")
                            }
                          >
                            <Plus size={18} aria-hidden="true" />
                            Add equipment
                          </Button>
                          <Button
                            onClick={() =>
                              setMessage("Secondary action activated.")
                            }
                          >
                            Save draft
                          </Button>
                          <Button
                            variant="quiet"
                            onClick={() =>
                              setMessage("Quiet action activated.")
                            }
                          >
                            Cancel
                          </Button>
                          <IconButton
                            label="Open settings"
                            onClick={() => setInspectorOpen(true)}
                          >
                            <Settings2 size={18} aria-hidden="true" />
                          </IconButton>
                        </Inline>
                        <Inline>
                          <Button disabled>Unavailable</Button>
                          <Button pending>Saving</Button>
                          <Button
                            variant="danger"
                            onClick={() => setDialog(true)}
                          >
                            Remove equipment
                          </Button>
                        </Inline>
                        {message && (
                          <Notice title="Action received" live>
                            {message}
                          </Notice>
                        )}
                        <ChoiceGroup
                          label="Ownership"
                          value={choice}
                          onChange={setChoice}
                          options={[
                            { value: "owned", label: "Owned" },
                            { value: "planned", label: "Planned" },
                            { value: "borrowed", label: "Borrowed" },
                          ]}
                        />
                        <Checkbox
                          label="Include in the public shack"
                          hint="Only the details you choose will appear."
                        />
                        <Switch
                          label="Show station activity"
                          checked={enabled}
                          onChange={(event) => setEnabled(event.target.checked)}
                        />
                      </Stack>
                    </Surface>
                    <Surface>
                      <Stack>
                        <TextField
                          label="Equipment name"
                          placeholder="Homebrew antenna tuner"
                          required
                          hint="Use a name you will recognize on the canvas."
                        />
                        <SelectField label="Connector" defaultValue="Unknown">
                          <option>Unknown</option>
                          <option>SO-239</option>
                          <option>BNC</option>
                        </SelectField>
                        <TextField
                          label="Example error state"
                          defaultValue=""
                          error="Give this equipment a name."
                        />
                        <TextAreaField
                          label="Station story"
                          rows={3}
                          placeholder="What do you enjoy operating?"
                        />
                      </Stack>
                    </Surface>
                  </Grid>
                </Stack>
              ),
            },
            {
              value: "feedback",
              label: "States & feedback",
              content: (
                <Stack>
                  <Inline>
                    {(
                      [
                        "neutral",
                        "info",
                        "success",
                        "warning",
                        "danger",
                      ] as const
                    ).map((tone) => (
                      <Badge key={tone} tone={tone}>
                        {tone}
                      </Badge>
                    ))}
                  </Inline>
                  <Inline>
                    {(
                      [
                        "measured",
                        "manufacturer",
                        "declared",
                        "estimated",
                        "unknown",
                      ] as const
                    ).map((source) => (
                      <ProvenanceBadge key={source} source={source} />
                    ))}
                  </Inline>
                  <Notice title="Changes not yet in use" tone="warning">
                    Save your draft, then review it before changing the setup
                    used for planning.
                  </Notice>
                  <Notice title="Connection saved" tone="success">
                    Radio ANT 1 is connected to the tuner RF IN.
                  </Notice>
                  <Notice title="We could not save this change" tone="danger">
                    Your entries are preserved. Check the connection and try
                    again.
                  </Notice>
                  <Grid>
                    <EmptyState
                      title="A fresh canvas"
                      action={
                        <ActionLink href="/design-system/add-equipment">
                          Add equipment
                        </ActionLink>
                      }
                    >
                      Add your first piece of gear to begin.
                    </EmptyState>
                    <Surface>
                      <Skeleton label="Loading equipment" lines={3} />
                    </Surface>
                  </Grid>
                </Stack>
              ),
            },
            {
              value: "station",
              label: "Station objects",
              content: (
                <Stack>
                  <Grid>
                    <EquipmentTile
                      name="Homebrew tuner"
                      kind="tuner"
                      detail="Owned · 2 ports"
                      selected={gear === "tuner"}
                      onSelect={() => setGear("tuner")}
                    />
                    <EquipmentTile
                      name="Portable dipole"
                      kind="antenna"
                      detail="Planned · 1 port"
                      selected={gear === "antenna"}
                      onSelect={() => setGear("antenna")}
                    />
                  </Grid>
                  <Inline>
                    {["RF IN", "RF OUT"].map((name) => (
                      <PortButton
                        key={name}
                        name={name}
                        detail="Connector unknown"
                        selected={port === name}
                        onClick={() => setPort(name)}
                      />
                    ))}
                  </Inline>
                  <ConnectionPreview
                    endpoints={["Radio · ANT 1", `Tuner · ${port}`]}
                  />
                  <Divider />
                  <Inline>
                    <Avatar name="Alex Rivera" />
                    <div>
                      <strong>Alex Rivera</strong>
                      <p className="review-mono su-hint">
                        N0CALL · Example operator
                      </p>
                    </div>
                    <Badge tone="info">Public preview</Badge>
                  </Inline>
                </Stack>
              ),
            },
            {
              value: "overlays",
              label: "Dialogs & details",
              content: (
                <Surface>
                  <Stack>
                    <h3>Focused decisions, familiar exits.</h3>
                    <p>
                      Dialogs inherit the preview theme, contain keyboard focus,
                      close with Escape and return focus to the trigger.
                    </p>
                    <Inline>
                      <Button onClick={() => setDialog(true)}>
                        Open confirmation
                      </Button>
                      <Button onClick={() => setInspectorOpen(true)}>
                        Open inspector
                      </Button>
                    </Inline>
                  </Stack>
                </Surface>
              ),
            },
          ]}
        />
      </Section>
      <Notice title="Ready for a visual review" tone="info">
        These shared primitives and the equipment page establish the foundation.
        Inventory persistence, canvas editing and public publishing remain
        tracked in the dependency plan.
      </Notice>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Remove this example?"
        description="This demonstrates a focused confirmation. Your real inventory is unchanged."
        footer={
          <>
            <Button onClick={() => setDialog(false)}>Keep example</Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialog(false);
                setMessage("Example removal confirmed.");
              }}
            >
              Remove example
            </Button>
          </>
        }
      >
        <p>Destructive actions name the item and explain the consequence.</p>
      </Dialog>
      <Dialog
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title="Equipment inspector"
        description="A centered dialog for focused editing."
      >
        <Stack>
          <EquipmentTile
            name="Homebrew tuner"
            kind="tuner"
            detail="Example · User entered"
            selected
            onSelect={() => {}}
          />
          <TextField label="Inspector name" defaultValue="Homebrew tuner" />
          <KeyValueList
            items={[
              {
                label: "Power rating",
                value: <ProvenanceBadge source="unknown" />,
              },
              { label: "Visibility", value: "Private" },
            ]}
          />
          <ActionBar>
            <Button variant="primary" onClick={() => setInspectorOpen(false)}>
              Done
            </Button>
          </ActionBar>
        </Stack>
      </Dialog>
    </Stack>
  );
}
