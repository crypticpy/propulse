import { HomeDaylight, Surface, Grid } from "propulse";

const NOW = Date.UTC(2026, 8, 8, 14, 0, 0);

export function AwaitingLocation() {
  return (
    <Surface>
      <HomeDaylight now={NOW} />
    </Surface>
  );
}

export function Grouped() {
  return (
    <Grid>
      <HomeDaylight now={NOW} />
      <HomeDaylight now={NOW + 6 * 3600000} />
    </Grid>
  );
}
