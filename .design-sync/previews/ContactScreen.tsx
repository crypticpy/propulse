import { useEffect } from "react";
import { ContactScreen, StationProvider } from "propulse";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";

// ContactScreen takes no props: target/roster/spot come entirely from the
// shared operating-state cursor + `useDXStore`. `useActiveLocation()` reads
// `useUserStore().station`, which IS persisted (localStorage) — seeding it
// here would leak a fake QTH into every later capture in the same browser
// session (NOTES.md "Persisted-store leak between captures"), so both cells
// below leave it unset and show the component's own real "Set your QTH in
// Settings" branch. That still renders a populated card: target header,
// TUNE button state + reason, and the live-frequency preview line all come
// from the two stores that are safe to seed (`useDXStore.spots`,
// `useOperatingStateStore`, neither persists the fields written here).
//
// `useOperatingStateStore.getState().reset()` runs first in BOTH cells
// (matches `ContactScreen.test.tsx`'s own `beforeEach`) so the "disabled"
// cell can never inherit the "enabled" cell's registration if a capture run
// mounts both stories in one page/session — cursor/registrations are not
// persisted, but they are one page-lifetime JS singleton across every story
// in this file.
function seedSpot(): DXSpot {
  return {
    id: "contact-s1",
    spotter: "W1AW",
    dx: "PY2ABC",
    frequency: 14195,
    mode: "USB",
    comment: "599 loud",
    time: new Date(Date.now() - 3 * 60_000),
    band: "20m",
  };
}

export function TuneEnabled() {
  useEffect(() => {
    const store = useOperatingStateStore.getState();
    store.reset();
    useDXStore.setState({ spots: [seedSpot()] });
    const unregister = store.registerWorkspace({
      workspaceId: "workstation-default",
      canvasType: "workstation",
      label: "Workstation",
      capabilities: { canTune: true, canCommand: true },
    });
    store.setBand("20m");
    store.setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: null,
      lon: null,
      spotId: "contact-s1",
    });
    return unregister;
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <ContactScreen />
    </StationProvider>
  );
}

export function TuneDisabled() {
  useEffect(() => {
    const store = useOperatingStateStore.getState();
    // No `registerWorkspace` call — reset() guarantees no stale roster from
    // another story in this file, so TUNE reads "no workstation with a rig
    // connected", the reason a phone alone on a session actually sees.
    store.reset();
    useDXStore.setState({ spots: [seedSpot()] });
    store.setBand("20m");
    store.setTarget({
      callsign: "PY2ABC",
      grid: "GG66",
      lat: null,
      lon: null,
      spotId: "contact-s1",
    });
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <ContactScreen />
    </StationProvider>
  );
}
