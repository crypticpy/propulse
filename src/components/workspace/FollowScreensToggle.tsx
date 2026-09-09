/**
 * The "Follow my other screens" kill switch (#658, #633).
 *
 * Off means this screen is entirely local: it neither sends its cursor nor
 * applies anything another screen sends. Spelled out ON/OFF on a big target
 * per the owner's UI rules, via the shared `HamClockToggleRow` rather than a
 * one-off switch.
 *
 * `StateStrip` mounts it today because the workspace SETTINGS dialog is
 * another task's file (#657). It takes no props so that dialog can drop it in
 * a row list unchanged.
 */

// Reused outside the wall route, same as `CentreOverlay.tsx` and
// `TuneButton.tsx`: the `hcc-*` chrome lives in these stylesheets.
import "@/styles/hamclock-themes.css";
import "@/styles/hamclock-wall-controls.css";
import { HamClockToggleRow } from "@/components/map/hamclock/wall/controls/HamClockToggleRow";
import { selectLiveRegistrations, useOperatingStateStore } from "@/stores/operatingStateStore";

export function FollowScreensToggle() {
  const followScreens = useOperatingStateStore((state) => state.followScreens);
  const setFollowScreens = useOperatingStateStore((state) => state.setFollowScreens);
  const otherScreens = useOperatingStateStore(
    (state) =>
      selectLiveRegistrations(state).filter((r) => r.deviceId !== state.deviceId).length,
  );

  const detail = !followScreens
    ? "This screen is on its own — nothing is sent and nothing is applied."
    : otherScreens === 0
      ? "Band, target and page flips are shared. No other screen is listening yet."
      : `Band, target and page flips are shared with ${otherScreens} other screen${otherScreens === 1 ? "" : "s"}.`;

  return (
    <HamClockToggleRow
      label="Follow my other screens"
      detail={detail}
      checked={followScreens}
      onChange={setFollowScreens}
    />
  );
}
