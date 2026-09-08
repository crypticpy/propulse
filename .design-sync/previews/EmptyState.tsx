import { ActionLink, Button, EmptyState, Grid } from "propulse";

export function Basic() {
  return (
    <Grid>
      <EmptyState title="A fresh canvas">
        Add your first piece of gear to begin.
      </EmptyState>
    </Grid>
  );
}

export function WithAction() {
  return (
    <Grid>
      <EmptyState
        title="No spots logged yet"
        action={
          <ActionLink href="/design-system/add-equipment">
            Add equipment
          </ActionLink>
        }
      >
        Connect a radio to start seeing contacts here.
      </EmptyState>
    </Grid>
  );
}

export function TitleOnly() {
  return (
    <Grid>
      <EmptyState title="Your first piece of gear starts here" />
      <EmptyState
        title="No connections yet"
        action={<Button variant="quiet">Start wiring</Button>}
      />
    </Grid>
  );
}
