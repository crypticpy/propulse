import { create } from "zustand";
import type { DeviceInfo, RadioState } from "@/lib/radio/protocol";
import type { DaemonStatusMessage } from "@/lib/radio/protocol";

export interface RadioStoreState {
  devices: DeviceInfo[];
  selectedDeviceId: string | null;
  connectedDeviceId: string | null;
  radioStateById: Record<string, RadioState>;
  smeterDbmById: Record<string, number>;
  lastDaemonStatus: DaemonStatusMessage | null;

  reset: () => void;
  setDevices: (devices: DeviceInfo[]) => void;
  setSelectedDeviceId: (deviceId: string | null) => void;
  setConnectedDeviceId: (deviceId: string | null) => void;
  upsertRadioState: (deviceId: string, state: RadioState) => void;
  setSmeterDbm: (deviceId: string, dbm: number) => void;
  setLastDaemonStatus: (status: DaemonStatusMessage) => void;
}

export const useRadioStore = create<RadioStoreState>()((set) => ({
  devices: [],
  selectedDeviceId: null,
  connectedDeviceId: null,
  radioStateById: {},
  smeterDbmById: {},
  lastDaemonStatus: null,

  reset: () =>
    set({
      devices: [],
      selectedDeviceId: null,
      connectedDeviceId: null,
      radioStateById: {},
      smeterDbmById: {},
      lastDaemonStatus: null,
    }),

  setDevices: (devices) =>
    set((s) => ({
      devices,
      selectedDeviceId:
        s.selectedDeviceId && devices.some((d) => d.device_id === s.selectedDeviceId)
          ? s.selectedDeviceId
          : devices[0]?.device_id ?? null,
    })),

  setSelectedDeviceId: (deviceId) => set({ selectedDeviceId: deviceId }),
  setConnectedDeviceId: (deviceId) => set({ connectedDeviceId: deviceId }),

  upsertRadioState: (deviceId, state) =>
    set((s) => ({
      radioStateById: { ...s.radioStateById, [deviceId]: state },
      connectedDeviceId: state.connected ? deviceId : s.connectedDeviceId === deviceId ? null : s.connectedDeviceId,
    })),

  setSmeterDbm: (deviceId, dbm) =>
    set((s) => ({ smeterDbmById: { ...s.smeterDbmById, [deviceId]: dbm } })),

  setLastDaemonStatus: (status) => set({ lastDaemonStatus: status }),
}));
