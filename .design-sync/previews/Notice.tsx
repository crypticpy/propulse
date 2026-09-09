import { Notice, Stack } from "propulse";

export function Tones() {
  return (
    <Stack>
      <Notice title="Interactive design review" tone="info">
        Every control on this page is live. Nothing you change here is saved
        to your station or your log.
      </Notice>
      <Notice title="Connection saved" tone="success">
        The IC-7300 is now wired to the LDG AT-200 through the feedline you
        picked. Band capability has been recalculated.
      </Notice>
      <Notice title="Changes not yet in use" tone="warning">
        Your operating setup still points at the previous draft. Apply the
        draft to make the new antenna switch active.
      </Notice>
      <Notice title="We could not save this change" tone="danger">
        The station service did not respond. Your edits are still on this
        page. Try again in a moment.
      </Notice>
    </Stack>
  );
}

export function LiveStatus() {
  return (
    <Notice title="Action received" live>
      Primary action activated. Screen readers announce this region as it
      updates.
    </Notice>
  );
}

export function TitleOnly() {
  return (
    <Stack>
      <Notice title="Reduced motion is active" />
      <Notice title="Preferences are temporary" tone="warning" />
    </Stack>
  );
}
