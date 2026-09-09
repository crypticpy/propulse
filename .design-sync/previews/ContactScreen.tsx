import { useEffect } from "react";
import { ContactScreen, StationProvider } from "propulse";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useProfileStore } from "@/stores/profileStore";
import type { DXSpot } from "@/types/dxcluster";
import type { UserStation } from "@/types/user";

// Single-story card (Opus review, #699 fix round): this file originally
// exported both TuneEnabled and TuneDisabled, but both cells share one
// page-lifetime Zustand singleton — a second cell's `reset()` wipes the
// first cell's already-rendered seed via the live store subscription, not
// just its initial props, so a two-cell capture showed the wrong state on
// whichever cell mounted first. There is no existing `config.json` shape
// for splitting one preview file's stories into isolated single-story
// cards (see the multi-export barrels there — those are distinct named
// components, not one component's story variants), so the TuneDisabled
// cell was dropped rather than invented one. It can come back once that
// override shape exists — see `.design-sync/NOTES.md`'s 2026-09-09 wave
// entry for the state it showed.
//
// `useActiveLocation()` (via the `useUserStore` bridge) reads
// `useProfileStore().station`, which IS persisted (localStorage) — without
// it the decision layer's verdict/reason line renders nothing (`location`
// is null), so per review direction this preview seeds a fixture station
// directly with `useProfileStore.setState` (not the `setStation` action,
// which layers on extra derived-field side effects we don't want here) and
// restores the exact previous value on unmount, keeping the mutation
// scoped to this capture's mount lifetime.
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

function fixtureStation(): UserStation {
  return {
    callsign: "K5ABC",
    homeLocationId: "home",
    activeLocationId: null,
    savedLocations: [
      {
        id: "home",
        name: "Home",
        grid: "EM12",
        lat: 32.7,
        lon: -97.3,
        type: "home",
        createdAt: new Date().toISOString(),
      },
    ],
    grid: "EM12",
    lat: 32.7,
    lon: -97.3,
  };
}

export function TuneEnabled() {
  useEffect(() => {
    const store = useOperatingStateStore.getState();
    store.reset();
    useDXStore.setState({ spots: [seedSpot()] });
    const prevStation = useProfileStore.getState().station;
    useProfileStore.setState({ station: fixtureStation() });
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
    return () => {
      unregister();
      useProfileStore.setState({ station: prevStation });
    };
  }, []);

  return (
    <StationProvider className="workspace-page workspace-page-phone" style={{ width: 390 }}>
      <ContactScreen />
    </StationProvider>
  );
}
