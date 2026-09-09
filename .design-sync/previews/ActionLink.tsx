import { ActionLink, Inline, Stack, Surface } from "propulse";

export function Variants() {
  return (
    <Surface>
      <Inline>
        <ActionLink href="/design-system/add-equipment" variant="primary">
          Add equipment
        </ActionLink>
        <ActionLink href="/log" variant="secondary">
          Open logbook
        </ActionLink>
        <ActionLink href="/settings" variant="quiet">
          Station settings
        </ActionLink>
      </Inline>
    </Surface>
  );
}

export function WithArrow() {
  return (
    <Stack>
      <ActionLink href="/design-system/add-equipment" variant="primary">
        Try the equipment page{" "}
        <span aria-hidden="true" className="review-mono">
          &rarr;
        </span>
      </ActionLink>
      <ActionLink href="/log/import" variant="secondary">
        Import a Cabrillo log{" "}
        <span aria-hidden="true" className="review-mono">
          &rarr;
        </span>
      </ActionLink>
    </Stack>
  );
}
