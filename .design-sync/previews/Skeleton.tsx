import { Grid, Skeleton, Surface } from "propulse";

export function Default() {
  return (
    <Grid>
      <Surface>
        <Skeleton label="Loading equipment" lines={3} />
      </Surface>
      <Surface>
        <Skeleton label="Loading solar data" lines={5} />
      </Surface>
    </Grid>
  );
}
