import { Grid, KeyValueList, Surface } from "propulse";

export function StationSummary() {
  return (
    <Grid>
      <Surface>
        <KeyValueList
          items={[
            { label: "Type", value: "Transceiver" },
            { label: "Ownership", value: "Owned" },
            { label: "Power rating", value: "100 W" },
          ]}
        />
      </Surface>
      <Surface>
        <KeyValueList
          items={[
            { label: "Antennas", value: "3" },
            { label: "Bands covered", value: "160 m through 70 cm" },
            { label: "Grid square", value: "EM12" },
          ]}
        />
      </Surface>
    </Grid>
  );
}

export function PurposeCards() {
  return (
    <Grid>
      <Surface>
        <p className="su-eyebrow">ORBITRON · HEADINGS</p>
        <h2>Your station, connected.</h2>
        <p>Inter keeps descriptions and controls familiar and readable.</p>
      </Surface>
      <Surface>
        <p className="su-eyebrow">JETBRAINS MONO · NUMERICS</p>
        <p style={{ fontFamily: "var(--su-font-mono)" }}>
          N0CALL · 14.074 MHz · SFI 142
        </p>
      </Surface>
      <Surface>
        <p className="su-eyebrow">SPACING</p>
        <p>4 / 8 / 16 / 24 / 32 px rhythm across every surface.</p>
      </Surface>
    </Grid>
  );
}
