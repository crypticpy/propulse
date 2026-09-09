import { EquipmentGlyph, Grid, Surface } from "propulse";

export function AllKinds() {
  return (
    <Grid>
      <Surface>
        <EquipmentGlyph kind="radio" style={{ width: 96, height: 54 }} />
        <p className="su-hint">Radio</p>
      </Surface>
      <Surface>
        <EquipmentGlyph kind="tuner" style={{ width: 96, height: 54 }} />
        <p className="su-hint">Tuner</p>
      </Surface>
      <Surface>
        <EquipmentGlyph kind="antenna" style={{ width: 96, height: 54 }} />
        <p className="su-hint">Antenna</p>
      </Surface>
      <Surface>
        <EquipmentGlyph kind="cable" style={{ width: 96, height: 54 }} />
        <p className="su-hint">Cable</p>
      </Surface>
    </Grid>
  );
}
