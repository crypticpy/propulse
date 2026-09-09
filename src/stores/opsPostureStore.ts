import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { OpsPosture } from "@/lib/map/contactMapPolicy";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import type { DXSpot } from "@/types/dxcluster";

export interface CameraSnapshot {
  x: number;
  y: number;
  z: number;
}

export type LogIntentSpot = DXSpot;

interface OpsPostureState {
  posture: OpsPosture;
  /**
   * Call being worked in Contact. Null in Observe/Desk. Projected from
   * `operatingStateStore`'s `cursor.contact` (#658) — write it through
   * `enterContact` / `exitContact`, never with `setState`.
   */
  contactCallsign: string | null;
  /** Projected from `cursor.contact.band`. See `contactCallsign`. */
  contactBand: string | null;
  /** Bumps when Work should reframe, even for the same station. */
  frameGeneration: number;
  cameraSnapshot: CameraSnapshot | null;
  userPanned: boolean;
  /** Observe vs Desk origin so Esc/log can restore the right posture. */
  enteredFrom: "observe" | "desk";
  pendingReplace: LogIntentSpot | null;
  /** Last non-contact posture. Reloads restore Desk vs Observe, never Contact. */
  deskPreferred: boolean;
  enterContact: (spot: {
    callsign: string;
    band?: string | null;
  }) => void;
  exitContact: (next?: OpsPosture) => void;
  setDesk: () => void;
  captureCameraSnapshot: (snapshot: CameraSnapshot) => void;
  clearCameraSnapshot: () => void;
  markUserPanned: () => void;
  setPendingReplace: (spot: LogIntentSpot | null) => void;
  reset: () => void;
}

const INITIAL: Pick<
  OpsPostureState,
  | "posture"
  | "contactCallsign"
  | "contactBand"
  | "frameGeneration"
  | "cameraSnapshot"
  | "userPanned"
  | "enteredFrom"
  | "pendingReplace"
  | "deskPreferred"
> = {
  posture: "observe",
  contactCallsign: null,
  contactBand: null,
  frameGeneration: 0,
  cameraSnapshot: null,
  userPanned: false,
  enteredFrom: "observe",
  pendingReplace: null,
  deskPreferred: false,
};

/**
 * Map/logger attention posture. Contact is ephemeral. Desk vs Observe is
 * persisted so a reload returns the operator to the radio desk, not Observe.
 * Camera snapshot stays here (not mapOperationalStore) so the ops popout
 * BroadcastChannel never replays globe vectors.
 */
export const useOpsPostureStore = create<OpsPostureState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      enterContact: ({ callsign, band }) => {
        const current = get().posture;
        const enteredFrom =
          current === "contact"
            ? get().enteredFrom
            : current === "desk"
              ? "desk"
              : "observe";
        const contactCallsign = callsign.trim().toUpperCase();
        const contactBand = band?.trim() || null;
        // The shared cursor is the source of truth for who is being worked;
        // the local copy below keeps existing selectors synchronous.
        useOperatingStateStore.getState().setContact({
          callsign: contactCallsign,
          band: contactBand,
        });
        if (contactBand) useOperatingStateStore.getState().setBand(contactBand);
        set({
          posture: "contact",
          contactCallsign,
          contactBand,
          frameGeneration: get().frameGeneration + 1,
          cameraSnapshot: null,
          userPanned: false,
          pendingReplace: null,
          enteredFrom,
        });
      },

      exitContact: (next) => {
        const fallback: OpsPosture =
          get().enteredFrom === "desk" || get().deskPreferred
            ? "desk"
            : "observe";
        const posture = next ?? fallback;
        useOperatingStateStore.getState().setContact(null);
        set({
          posture,
          contactCallsign: null,
          contactBand: null,
          pendingReplace: null,
          enteredFrom: posture === "desk" ? "desk" : "observe",
          deskPreferred: posture === "desk",
        });
      },

      setDesk: () => {
        useOperatingStateStore.getState().setContact(null);
        set({
          posture: "desk",
          contactCallsign: null,
          contactBand: null,
          pendingReplace: null,
          enteredFrom: "desk",
          deskPreferred: true,
        });
      },

      captureCameraSnapshot: (cameraSnapshot) => {
        if (get().cameraSnapshot) return;
        set({ cameraSnapshot });
      },

      clearCameraSnapshot: () => set({ cameraSnapshot: null, userPanned: false }),

      markUserPanned: () => {
        if (get().posture !== "contact") return;
        set({ userPanned: true });
      },

      setPendingReplace: (pendingReplace) => set({ pendingReplace }),

      reset: () => {
        useOperatingStateStore.getState().setContact(null);
        set({ ...INITIAL });
      },
    }),
    {
      name: "propulse-ops-posture",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ deskPreferred: state.deskPreferred }),
      merge: (persisted, current) => {
        const stored = persisted as { deskPreferred?: boolean } | undefined;
        const deskPreferred = Boolean(stored?.deskPreferred);
        return {
          ...current,
          deskPreferred,
          posture: deskPreferred ? "desk" : current.posture,
          enteredFrom: deskPreferred ? "desk" : current.enteredFrom,
        };
      },
    },
  ),
);

/**
 * `operatingStateStore.cursor.contact` is the single source of truth for the
 * station being worked (#658); `contactCallsign` / `contactBand` are its
 * projection here, so the existing consumers keep their selectors and a
 * contact chosen on another screen lands in the map's Contact posture too.
 *
 * Posture itself stays local: a remote screen picking a station should not
 * yank this one into Contact framing. Every consumer of these two fields
 * gates on `posture === "contact"` (`contactSpotOpacity`,
 * `shouldWipeDraftOnQsy`), so a shared call with a local Observe posture is
 * inert until this operator enters Contact.
 */
useOperatingStateStore.subscribe((state, previous) => {
  const contact = state.cursor.contact;
  if (contact === previous.cursor.contact) return;
  const { contactCallsign, contactBand } = useOpsPostureStore.getState();
  const nextCallsign = contact?.callsign ?? null;
  const nextBand = contact?.band ?? null;
  if (contactCallsign === nextCallsign && contactBand === nextBand) return;
  useOpsPostureStore.setState({
    contactCallsign: nextCallsign,
    contactBand: nextBand,
  });
});
