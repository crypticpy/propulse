/**
 * Phone canvas shell (#659, epic #652, refs #632).
 *
 * A fixed 390 pt, no-rails canvas (`CANVAS_RULES.phone`, `canvasRules.ts`)
 * that stacks the first three pages of the #632 trace: band ladder ->
 * contact list -> selection. Unlike the workstation, these three pages are
 * not built from the operator's own widget picks (the
 * `workspaceStore`/`autoDock` page machinery) — no other phone-form widget
 * exists yet to choose between — so `PhonePage` flips through a fixed
 * sequence with big PREVIOUS/NEXT buttons and page dots (owner round 2:
 * pages stack registry `phoneSize` widgets; today there are exactly three
 * phone-only ones, one per page).
 *
 * Registers this screen with the shared operating state (#658) directly via
 * `registerWorkspace`, rather than through `useOperatingScreen`: that hook
 * derives `canvasType`/`workspaceId` from `useActiveWorkspace()`, and the one
 * `Workspace` object the store ships today is canvasType "workstation" —
 * read by the desktop canvas too, on every device including a real phone,
 * since each device's `workspaceStore` seeds that same single workspace. A
 * real phone must show up on the shared roster as canvasType "phone",
 * `canTune: false`. `WorkspacePage` calls `useOperatingScreen()` only in its
 * workstation branch, so this is the phone's single roster entry.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/station-ui";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { ContactScreen } from "./ContactScreen";
import "./phone.css";
import { PhoneBandLadder } from "./PhoneBandLadder";
import { PhoneContactList } from "./PhoneContactList";
import { PhoneSelectionPage } from "./PhoneSelectionPage";
import { PhoneSetupMenu } from "./PhoneSetupMenu";
import { PhoneStateStrip } from "./PhoneStateStrip";

/** This canvas's registration id on the shared operating-state roster — distinct from the workstation's `DEFAULT_WORKSPACE_ID`. */
export const PHONE_WORKSPACE_ID = "phone-canvas";

const PHONE_PAGES = [
  { id: "band", title: "BAND LADDER", render: () => <PhoneBandLadder /> },
  { id: "contacts", title: "CONTACTS", render: () => <PhoneContactList /> },
  { id: "selection", title: "SELECTION", render: () => <PhoneSelectionPage /> },
  // #660: the full decision-layer report + TUNE. Reached with NEXT/dots like
  // every other phone page — `selectSpot` (page 2) only writes the cursor,
  // it does not auto-advance, matching the band ladder's tap-then-flip
  // pattern on page 1.
  { id: "contact", title: "CONTACT", render: () => <ContactScreen /> },
] as const;

/**
 * `PhoneBandLadder` / `PhoneContactList` only read the shared `useDXStore`
 * feed, same rule as the workstation's `WorkspaceDxFeedHost`
 * (`WorkspacePage.tsx`) — neither starts it itself. This is the one place
 * that starts it for the phone canvas, mounted unconditionally: unlike the
 * workstation (where a DX-sourced widget may or may not be placed), every
 * phone page here reads spot data.
 */
function PhoneDxFeedHost() {
  useDXCluster();
  return null;
}

export function PhonePage() {
  const [pageIndex, setPageIndex] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(
    () =>
      useOperatingStateStore.getState().registerWorkspace({
        workspaceId: PHONE_WORKSPACE_ID,
        canvasType: "phone",
        label: "Phone",
        // Owner rule (epic #652 #5): only the wall is view-only; the phone
        // both consumes and commands. No bridge host runs on a phone.
        capabilities: { canTune: false, canCommand: true },
      }),
    [],
  );

  useEffect(
    () =>
      useOperatingStateStore.subscribe((state, previous) => {
        const received = state.lastCommand;
        if (!received || received === previous.lastCommand) return;
        if (received.command.type !== "flipPage") return;
        if (received.command.workspaceId !== PHONE_WORKSPACE_ID) return;
        const clamped = Math.min(Math.max(received.command.pageIndex, 0), PHONE_PAGES.length - 1);
        setPageIndex(clamped);
      }),
    [],
  );

  const page = PHONE_PAGES[pageIndex];

  return (
    <div className="phone-page">
      <PhoneDxFeedHost />
      <PhoneStateStrip />

      <div className="phone-page-body" aria-label={page.title}>
        {page.render()}
      </div>

      <nav className="phone-page-nav" aria-label="Phone pages">
        <Button
          variant="secondary"
          aria-label="Previous page"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
        >
          PREVIOUS
        </Button>
        <div className="phone-page-dots" role="tablist" aria-label="Pages">
          {PHONE_PAGES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === pageIndex}
              aria-label={`Page ${i + 1} of ${PHONE_PAGES.length}: ${p.title}`}
              className="phone-page-dot"
              data-active={i === pageIndex}
              onClick={() => setPageIndex(i)}
            />
          ))}
        </div>
        <Button
          variant="secondary"
          aria-label="Next page"
          disabled={pageIndex === PHONE_PAGES.length - 1}
          onClick={() => setPageIndex((i) => Math.min(PHONE_PAGES.length - 1, i + 1))}
        >
          NEXT
        </Button>
      </nav>

      <Button variant="quiet" className="phone-setup-open" onClick={() => setSetupOpen(true)}>
        SETUP
      </Button>
      {setupOpen && <PhoneSetupMenu open onClose={() => setSetupOpen(false)} />}
    </div>
  );
}
