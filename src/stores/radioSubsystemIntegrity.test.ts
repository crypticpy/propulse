import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceInfo } from "@/lib/radio/protocol";
import type { RadioEquipment, UserRadio } from "@/types/radio";
import type { StationChain } from "@/types/stationChain";
import type { StationPreset } from "@/types/shack";
import type { RadioConfig } from "@/hooks/useRadioSetup";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
vi.stubGlobal("localStorage", storage);
vi.mock("@/lib/db/imageStore", () => ({
  deleteImage: vi.fn(async () => {}),
}));

const { deleteImage } = await import("@/lib/db/imageStore");
const { useRadioStore } = await import("./radioStore");
const { useSettingsStore } = await import("./settingsStore");
const { useShackStore } = await import("./shackStore");
const { buildRadioTestPayload, parseRadioTestResult } = await import(
  "@/hooks/useRadioSetup"
);

const commands = {
  tune: true,
  mode: true,
  ptt: true,
  gain: false,
  filter: true,
  agc: true,
  squelch: true,
  antenna: false,
  nr: true,
  nb: true,
  vfo: false,
  rit: false,
  xit: false,
  split: false,
  anf: false,
  qsk: false,
  vox: false,
  if_shift: false,
  cw_speed: false,
} as const;

function device(deviceId: string): DeviceInfo {
  return {
    device_id: deviceId,
    name: `Device ${deviceId}`,
    driver: "dummy",
    type: "transceiver",
    available: true,
    capabilities: {
      can_transmit: true,
      can_stream_iq: false,
      can_stream_fft: true,
      can_stream_audio: true,
      frequency_range: [100_000, 60_000_000],
      sample_rates: [],
      modes: ["USB"],
      antennas: [],
      gain_stages: [],
      commands,
    },
  };
}

beforeEach(() => {
  storage.clear();
  vi.mocked(deleteImage).mockClear();
  useRadioStore.getState().reset();
  useShackStore.setState({
    radios: [],
    customRadios: [],
    activeRadioId: null,
    stationPresets: [],
    activePresetId: null,
    stationChains: [],
    activeChainId: null,
    equipmentHistory: [],
  });
});

describe("radio transport reconciliation", () => {
  it("clears stale connected state and prunes removed devices", () => {
    const first = device("first");
    const second = device("second");
    useRadioStore.getState().setDevices([first, second]);
    useRadioStore.getState().setSelectedDeviceId("first");
    useRadioStore.getState().setConnectedDeviceId("first");
    useRadioStore.getState().upsertRadioState("first", {
      connected: true,
      freq: 14_074_000,
      mode: "USB",
      gains: {},
      agc: true,
    });

    useRadioStore.getState().markTransportDisconnected();
    expect(useRadioStore.getState().connectedDeviceId).toBeNull();
    expect(useRadioStore.getState().radioStateById.first?.connected).toBe(false);

    useRadioStore.getState().setDevices([second]);
    expect(useRadioStore.getState().selectedDeviceId).toBe("second");
    expect(useRadioStore.getState().radioStateById.first).toBeUndefined();
  });
});

describe("radio inventory deletion integrity", () => {
  const ownedRadio: UserRadio = {
    id: "owned-radio",
    equipmentId: "custom-radio",
    imageId: "primary-image",
    galleryImageIds: ["gallery-image"],
    addedAt: "2026-01-01T00:00:00.000Z",
  };
  const customRadio = {
    id: "custom-radio",
    displayName: "Custom Test Radio",
    manufacturer: "Test",
    model: "T-1",
    receiver: {
      rmdr: 90,
      imdr3: 85,
      blockingGain: 120,
      sensitivity: 0.2,
      noiseFloorDbm: -135,
    },
    maxPower: 100,
    minPower: 1,
    modes: ["SSB"],
    bands: ["20m"],
    tier: "midrange",
  } satisfies RadioEquipment;
  const preset = {
    id: "preset",
    name: "Preset",
    radioId: ownedRadio.id,
    antennaId: "antenna",
    accessoryIds: [],
    operatingPowerWatts: 50,
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies StationPreset;
  const chain = {
    id: "chain",
    name: "Chain",
    nodes: [{ type: "radio", radioId: ownedRadio.id }],
    feedlineRuns: [],
    operatingPowerWatts: 50,
    shackAccessoryIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies StationChain;

  it("removes presets and chain references for a deleted instance", () => {
    useShackStore.setState({
      radios: [ownedRadio],
      activeRadioId: ownedRadio.id,
      stationPresets: [preset],
      activePresetId: preset.id,
      stationChains: [chain],
    });

    useShackStore.getState().removeRadio(ownedRadio.id);

    const state = useShackStore.getState();
    expect(state.radios).toEqual([]);
    expect(state.stationPresets).toEqual([]);
    expect(state.activePresetId).toBeNull();
    expect(state.stationChains[0].nodes).toEqual([]);
    expect(deleteImage).toHaveBeenCalledWith("primary-image");
    expect(deleteImage).toHaveBeenCalledWith("gallery-image");
  });

  it("cascades custom-definition deletion through every owned reference", () => {
    useShackStore.setState({
      radios: [ownedRadio],
      customRadios: [customRadio],
      activeRadioId: ownedRadio.id,
      stationPresets: [preset],
      activePresetId: preset.id,
      stationChains: [chain],
    });

    useShackStore.getState().removeCustomRadio(customRadio.id);

    const state = useShackStore.getState();
    expect(state.customRadios).toEqual([]);
    expect(state.radios).toEqual([]);
    expect(state.stationPresets).toEqual([]);
    expect(state.stationChains[0].nodes).toEqual([]);
    expect(deleteImage).toHaveBeenCalledTimes(2);
  });
});

describe("ICOM network credential persistence", () => {
  it("never writes the runtime password to propulse-settings", () => {
    const secret = "not-for-local-storage";
    useSettingsStore.getState().updatePreferences({
      catIcomNetworkHost: "192.0.2.10",
      catIcomNetworkPassword: secret,
    });

    const persisted = storage.getItem("propulse-settings") ?? "";
    expect(persisted).toContain("192.0.2.10");
    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain("catIcomNetworkPassword");
  });
});

describe("CAT setup protocol", () => {
  const config: RadioConfig = {
    catBackend: "icom-serial",
    hamlibHost: "127.0.0.1",
    hamlibPort: 4532,
    civPort: 4580,
    flrigHost: "127.0.0.1",
    flrigPort: 12345,
    icomSerialPort: "/dev/ttyUSB0",
    icomBaudRate: 115200,
    icomRadioAddress: 0xa4,
    icomNetworkHost: "192.0.2.20",
    icomNetworkUsername: "operator",
    icomNetworkPassword: "session-secret",
  };

  it("preserves the configured CI-V address in real test payloads", () => {
    expect(buildRadioTestPayload(config)).toEqual({
      backend: "icom-serial",
      serialPort: "/dev/ttyUSB0",
      baudRate: 115200,
      radioAddress: 0xa4,
    });
  });

  it("requires a correlated rig test ACK instead of generic success", () => {
    expect(
      parseRadioTestResult(
        { type: "response", id: "test-1", success: true },
        "test-1",
      ),
    ).toBeNull();
    expect(
      parseRadioTestResult(
        {
          type: "rig:test.ack",
          id: "another-request",
          payload: { success: true },
        },
        "test-1",
      ),
    ).toBeNull();
    expect(
      parseRadioTestResult(
        {
          type: "rig:test:ack",
          id: "test-1",
          payload: {
            success: true,
            rigModel: "IC-7300",
            frequency: 14_074_000,
            mode: "USB",
            hasSpectrum: true,
          },
        },
        "test-1",
      ),
    ).toMatchObject({
      status: "success",
      rigModel: "IC-7300",
      hasSpectrum: true,
    });
  });

  it("reports correlated setup failures", () => {
    expect(
      parseRadioTestResult(
        {
          type: "error",
          id: "test-2",
          payload: { message: "No radio backend responded" },
        },
        "test-2",
      ),
    ).toEqual({
      status: "error",
      errorMessage: "No radio backend responded",
    });
  });
});
