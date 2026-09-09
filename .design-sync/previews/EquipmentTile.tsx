import { useState } from "react";
import { EquipmentTile, Grid } from "propulse";

export function SelectableSet() {
  const [gear, setGear] = useState("tuner");
  return (
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
  );
}

export function OpensDialog() {
  return (
    <Grid>
      <EquipmentTile
        name="IC-7300"
        kind="radio"
        detail="Owned · 4 ports"
        opensDialog
        onSelect={() => {}}
      />
      <EquipmentTile
        name="LDG AT-200"
        kind="tuner"
        detail="Owned · 2 ports"
        opensDialog
        onSelect={() => {}}
      />
    </Grid>
  );
}
