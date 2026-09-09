/**
 * Phone page 3: selection (#659, refs #632).
 *
 * Shows the shared cursor's `target`, written by `PhoneContactList`'s tap on
 * page 2 — the third leg of the #632 trace ("band -> contact list -> selection
 * writes the workflow cursor"). Full contact detail, log history and Tune
 * (the #632 trace's remaining legs) are #660's scope, not this one; this page
 * is intentionally a read of the cursor plus a stub notice saying so.
 */

import { EmptyState, Notice } from "@/components/station-ui";
import { useOperatingStateStore } from "@/stores/operatingStateStore";

export function PhoneSelectionPage() {
  const target = useOperatingStateStore((state) => state.cursor.target);
  const band = useOperatingStateStore((state) => state.cursor.band);

  if (!target) {
    return (
      <EmptyState title="NO CONTACT SELECTED">
        Pick a spot on the Contacts page first.
      </EmptyState>
    );
  }

  return (
    <div className="su-stack">
      <p className="su-eyebrow">SELECTED</p>
      <h2 className="phone-selection-call">{target.callsign}</h2>
      <p className="su-mono">
        {band ? band.toUpperCase() : "—"}
        {target.grid ? ` · ${target.grid}` : ""}
      </p>
      <Notice title="CONTACT (coming in #660)">
        Full contact detail, log history and Tune land in a later release.
      </Notice>
    </div>
  );
}
