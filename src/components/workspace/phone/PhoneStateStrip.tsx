/**
 * Shared operating-state strip at phone density (#659, refs #658).
 *
 * Same fields as the workstation's `StateStrip` (session, band, target),
 * read from the same `operatingStateStore` cursor, stacked for a 390 pt
 * canvas instead of one inline row. The "Follow my other screens" switch
 * lives in `PhoneSetupMenu` instead of here, so the top three rows stay
 * fixed read lines at every page (no in-widget scrolling,
 * `hamclock-wall-spec.md` §2).
 *
 * #721: a fourth row turns this into the phone's remote for the *other*
 * screens' page flip. The protocol already carries `flipPage` end to end
 * (`operatingStateStore.flipPage` -> `useOperatingScreen`) — the phone only
 * ever sent `tune` (#660). Targets come straight off the shared roster
 * (`registrations`), filtered the same way `ContactScreen`'s TUNE picker
 * filters it, minus `canTune`:
 * - `capabilities.canCommand` — false on a wall (epic #652 rule 5), so a
 *   wall can never be offered here without re-deriving "is this a wall" at
 *   the phone.
 * - not this device's own registration: unlike TUNE (never true on a phone,
 *   so `pickTuneWorkspace` does not need this check), the phone's *own*
 *   roster entry has `canCommand: true` (`PhonePage`), and it already has
 *   PREVIOUS/NEXT for its own pages — offering itself here too would be a
 *   confusing second control for the same action.
 * - live within `REGISTRATION_TTL_MS`.
 *
 * Every registration on the roster is, by construction, the *active*
 * workspace on its device: `useOperatingScreen`/`PhonePage` register only
 * `useActiveWorkspace()`'s current workspace and unregister on switch (their
 * `useEffect`s key on `workspaceId`). So nothing offered here can be the
 * "background workspace" `useOperatingScreen` silently drops a `flipPage`
 * for — there is no registered-but-inactive workspace on the roster today.
 * If workspace switching (#657) ever registers more than the active one per
 * device, this filter needs revisiting.
 *
 * There is no shared count of a target's pages — the protocol has no such
 * field, and adding one is out of scope (#721 spends no new wire shape).
 * `pageByTarget` is this phone's own guess, started at 0 per target and
 * bumped by whichever button was pressed; `MAX_PAGE_INDEX` bounds it since
 * nothing here can confirm a page actually exists at that index — a
 * `flipPage` aimed past the target's last page already no-ops safely
 * (`useOperatingScreen`'s `pages[pageIndex]` lookup returns `undefined`).
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/station-ui";
import type { WorkspaceRegistration } from "@/lib/workspace/operatingChannel";
import { REGISTRATION_TTL_MS, useOperatingStateStore } from "@/stores/operatingStateStore";
import { usePhoneTick } from "./usePhoneTick";

const EMPTY = "—";

/** Nothing on the wire tells the phone how many pages a target has (see file docblock); this bounds the local guess. */
const MAX_PAGE_INDEX = 19;

function registrationKey(registration: WorkspaceRegistration): string {
  return `${registration.deviceId}::${registration.workspaceId}`;
}

/** Live, commandable screens other than this one — same filters `ContactScreen`'s tune picker applies, minus `canTune`. */
function pickFlipTargets(
  registrations: Record<string, WorkspaceRegistration>,
  ownDeviceId: string,
  now: number,
): WorkspaceRegistration[] {
  return Object.values(registrations)
    .filter((registration) => registration.deviceId !== ownDeviceId)
    .filter((registration) => registration.capabilities.canCommand)
    .filter((registration) => now - registration.lastSeen < REGISTRATION_TTL_MS)
    .sort(
      (a, b) => a.workspaceId.localeCompare(b.workspaceId) || a.deviceId.localeCompare(b.deviceId),
    );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="phone-state-row">
      <span className="su-hint">{label}</span>
      <span className="su-mono">{value}</span>
    </div>
  );
}

export function PhoneStateStrip() {
  const sessionId = useOperatingStateStore((state) => state.cursor.sessionId);
  const band = useOperatingStateStore((state) => state.cursor.band);
  const target = useOperatingStateStore((state) => state.cursor.target);
  const registrations = useOperatingStateStore((state) => state.registrations);
  const ownDeviceId = useOperatingStateStore((state) => state.deviceId);
  const followScreens = useOperatingStateStore((state) => state.followScreens);
  // Ages a target off this row (and swaps in the reason text) without a new
  // register/unregister event, same pattern as `ContactScreen`'s tune picker.
  const tick = usePhoneTick();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pageByTarget, setPageByTarget] = useState<Record<string, number>>({});

  const flipTargets = useMemo(
    () => pickFlipTargets(registrations, ownDeviceId, Date.now()),
    // `tick` isn't read; it forces a periodic re-check of `lastSeen` against
    // `REGISTRATION_TTL_MS`, same reasoning as `ContactScreen`'s tune picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registrations, ownDeviceId, tick],
  );
  const flipTarget = flipTargets.length > 0 ? flipTargets[selectedIndex % flipTargets.length] : null;

  function cycleFlipTarget() {
    setSelectedIndex((index) => (index + 1) % flipTargets.length);
  }

  function flip(direction: 1 | -1) {
    if (!flipTarget) return;
    const key = registrationKey(flipTarget);
    const current = pageByTarget[key] ?? 0;
    const next = Math.min(MAX_PAGE_INDEX, Math.max(0, current + direction));
    setPageByTarget((previous) => ({ ...previous, [key]: next }));
    useOperatingStateStore.getState().flipPage(flipTarget.workspaceId, next);
  }

  const screensReason = !followScreens
    ? "Follow screens is off on this phone."
    : flipTargets.length === 0
      ? "No other screen to flip yet."
      : null;

  return (
    <div className="su-surface phone-state-strip" aria-label="Shared operating state">
      <StateRow label="SESSION" value={sessionId ?? EMPTY} />
      <StateRow label="BAND" value={band ? band.toUpperCase() : EMPTY} />
      <StateRow label="TARGET" value={target?.callsign ?? EMPTY} />

      <div className="phone-state-row phone-screens-row">
        <span className="su-hint">SCREENS</span>
        {screensReason ? (
          <span className="su-mono phone-screens-reason">{screensReason}</span>
        ) : (
          flipTarget && (
            <div className="phone-screens-controls">
              <Button
                variant="secondary"
                aria-label={`Flip ${flipTarget.label} to the previous page`}
                onClick={() => flip(-1)}
              >
                BACK
              </Button>
              {flipTargets.length > 1 ? (
                <Button
                  variant="quiet"
                  onClick={cycleFlipTarget}
                  aria-label={`Screen to flip: ${flipTarget.label}. Tap to choose another screen.`}
                >
                  {flipTarget.label.toUpperCase()}
                </Button>
              ) : (
                <span className="su-mono phone-screens-label">{flipTarget.label.toUpperCase()}</span>
              )}
              <Button
                variant="secondary"
                aria-label={`Flip ${flipTarget.label} to the next page`}
                onClick={() => flip(1)}
              >
                FORWARD
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
