import { HomeStation, Surface, Grid } from "propulse";

export function Default() {
  return (
    <Surface>
      <HomeStation />
    </Surface>
  );
}

export function Grouped() {
  return (
    <Grid>
      <HomeStation />
      <HomeStation />
    </Grid>
  );
}
