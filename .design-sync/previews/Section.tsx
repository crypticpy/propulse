import { Button, KeyValueList, Section, Surface } from "propulse";

export function WithDescription() {
  return (
    <Section
      title="The core palette"
      description="Semantic roles keep screens coherent across themes and personal accents."
    >
      <Surface>
        <KeyValueList
          items={[
            { label: "Body", value: "16 px base · respects text scaling" },
            { label: "Spacing", value: "4 / 8 / 16 / 24 / 32 px" },
          ]}
        />
      </Surface>
    </Section>
  );
}

export function WithActions() {
  return (
    <Section
      title="Saved examples"
      description="Inspect the values captured by this form."
      actions={<Button variant="quiet">Clear all</Button>}
    >
      <Surface>
        <KeyValueList
          items={[
            { label: "Antennas", value: "3" },
            { label: "Bands covered", value: "160 m through 70 cm" },
          ]}
        />
      </Surface>
    </Section>
  );
}
