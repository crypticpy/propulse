/**
 * Phone setup menu (#659, owner round 2: "pages + a setup menu").
 *
 * A centred dialog (`CentreOverlay`, the workspace's one non-flyout modal
 * shell) holding the phone's own band-visibility setting
 * (`workspaceStore.phoneVisibleBands` — distinct from the workstation's
 * `display.visibleBands`, per the owner's correction: "band visibility is the
 * phone workspace's own setting") and the shared "Follow my other screens"
 * switch.
 *
 * Chip-button band toggles reuse `DisplayTab.tsx`'s exact pattern (#657) —
 * one `HamClockToggleRow` per band would overflow `HamClockDialog`'s fixed,
 * non-scrolling body across all 11 bands.
 *
 * NOT implemented here: choosing which widget renders on which page. The
 * owner's round-2 note describes pages stacking registry `phoneSize`
 * widgets generally, but no second phone-form widget exists yet to pick
 * between — `PhonePage` ships a fixed band -> contacts -> selection
 * sequence today. See the #659 handoff for this as a follow-up.
 */

import { FollowScreensToggle } from "@/components/workspace/FollowScreensToggle";
import { CentreOverlay } from "@/components/workspace/CentreOverlay";
import { Button } from "@/components/station-ui";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { useWorkspaceStore } from "@/stores/workspaceStore";

export interface PhoneSetupMenuProps {
  open: boolean;
  onClose: () => void;
}

export function PhoneSetupMenu({ open, onClose }: PhoneSetupMenuProps) {
  const visibleBands = useWorkspaceStore((state) => state.phoneVisibleBands);
  const setPhoneVisibleBands = useWorkspaceStore((state) => state.setPhoneVisibleBands);

  function toggleBand(band: string) {
    setPhoneVisibleBands(
      visibleBands.includes(band) ? visibleBands.filter((b) => b !== band) : [...visibleBands, band],
    );
  }

  return (
    <CentreOverlay
      open={open}
      onClose={onClose}
      title="PHONE SETUP"
      purpose="Bands shown on this phone, and screen sharing."
    >
      <div className="su-stack phone-setup">
        <p className="su-eyebrow">VISIBLE BANDS</p>
        <div className="su-inline phone-setup-bands">
          {BAND_ORDER.map((band) => (
            <Button
              key={band}
              variant={visibleBands.includes(band) ? "primary" : "secondary"}
              onClick={() => toggleBand(band)}
            >
              {band.toUpperCase()}
            </Button>
          ))}
        </div>
        <Button variant="quiet" onClick={() => setPhoneVisibleBands([...BAND_ORDER])}>
          ALL BANDS
        </Button>

        <p className="su-eyebrow">SHARING</p>
        <FollowScreensToggle />
      </div>
    </CentreOverlay>
  );
}
