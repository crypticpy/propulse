import { PhoneSetupMenu, StationProvider } from "propulse";

// `open`/`onClose` are the only props; band-visibility content comes from
// `useWorkspaceStore.phoneVisibleBands`, which already defaults to every
// band (not part of the store's persisted snapshot — only `workspaces` and
// `activeWorkspaceId` are — so its default is populated with no seeding
// needed). The dialog portals to `document.body` via
// `CentreOverlay`/`HamClockDialog`, same pattern as `HamClockDialog`'s own
// preview, which stayed contained in the card with no `cardMode` override.
export function Open() {
  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <PhoneSetupMenu open onClose={() => {}} />
    </StationProvider>
  );
}
