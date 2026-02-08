export const FRAME_TYPE_FFT = 0x01;
export const FRAME_TYPE_AUDIO = 0x02;

export type RadioType = "sdr" | "transceiver";

export interface GainStage {
  name: string;
  min: number;
  max: number;
  step: number;
}

export interface RadioCapabilities {
  can_transmit: boolean;
  can_stream_iq: boolean;
  can_stream_fft: boolean;
  can_stream_audio: boolean;
  antennas: string[];
  modes: string[];
  frequency_range: [number, number];
  sample_rates: number[];
  gain_stages: GainStage[];
}

export interface DeviceInfo {
  device_id: string;
  name: string;
  driver: string;
  type: RadioType;
  serial?: string;
  port?: string;
  available: boolean;
  capabilities: RadioCapabilities;
}

export interface RadioFilter {
  low: number;
  high: number;
}

export interface RadioNr {
  enabled: boolean;
  level: number;
}

export interface RadioNb {
  enabled: boolean;
  threshold?: number;
}

export interface RadioState {
  connected: boolean;
  freq: number;
  mode: string;
  antenna?: string;
  gains: Record<string, number>;
  agc: boolean;
  ptt?: boolean;
  filter?: RadioFilter;
  nr?: RadioNr;
  nb?: RadioNb;
  squelch?: number;
  signal_dbm?: number;
}

export interface DaemonHelloMessage {
  type: "hello";
  version: string;
  daemon_id: string;
}

export interface DaemonResponseMessage {
  type: "response";
  id: string;
  success: boolean;
  error?: string;
}

export interface DevicesListMessage {
  type: "devices:list";
  devices: DeviceInfo[];
}

export interface RadioStateMessage {
  type: "radio:state";
  device_id: string;
  state: RadioState;
}

export interface RadioSmeterMessage {
  type: "radio:smeter";
  device_id: string;
  dbm: number;
}

export interface DaemonStatusMessage {
  type: "daemon:status";
  version: string;
  uptime_secs: number;
  platform: string;
  connected_radios: number;
  active_streams: number;
  cpu_percent: number;
  memory_mb: number;
}

export interface DaemonDiscoveryDaemonsMessage {
  type: "discovery:daemons";
  daemons: Array<{
    fullname: string;
    hostname: string;
    port: number;
    addresses: string[];
    txt: Record<string, string>;
  }>;
}

export type DaemonIncomingMessage =
  | DaemonHelloMessage
  | DaemonResponseMessage
  | DevicesListMessage
  | RadioStateMessage
  | RadioSmeterMessage
  | DaemonStatusMessage
  | DaemonDiscoveryDaemonsMessage
  | { type: string; [k: string]: unknown };

export function isDevicesListMessage(
  msg: DaemonIncomingMessage,
): msg is DevicesListMessage {
  return msg.type === "devices:list" && Array.isArray((msg as DevicesListMessage).devices);
}

export function isRadioStateMessage(
  msg: DaemonIncomingMessage,
): msg is RadioStateMessage {
  return (
    msg.type === "radio:state" &&
    typeof (msg as RadioStateMessage).device_id === "string" &&
    typeof (msg as RadioStateMessage).state === "object"
  );
}

export function isRadioSmeterMessage(
  msg: DaemonIncomingMessage,
): msg is RadioSmeterMessage {
  return (
    msg.type === "radio:smeter" &&
    typeof (msg as RadioSmeterMessage).device_id === "string" &&
    typeof (msg as RadioSmeterMessage).dbm === "number"
  );
}

export function isDaemonStatusMessage(
  msg: DaemonIncomingMessage,
): msg is DaemonStatusMessage {
  return (
    msg.type === "daemon:status" &&
    typeof (msg as DaemonStatusMessage).version === "string" &&
    typeof (msg as DaemonStatusMessage).uptime_secs === "number"
  );
}

export function isDaemonResponseMessage(
  msg: DaemonIncomingMessage,
): msg is DaemonResponseMessage {
  return (
    msg.type === "response" &&
    typeof (msg as DaemonResponseMessage).id === "string" &&
    typeof (msg as DaemonResponseMessage).success === "boolean"
  );
}

export function isDaemonDiscoveryDaemonsMessage(
  msg: DaemonIncomingMessage,
): msg is DaemonDiscoveryDaemonsMessage {
  return (
    msg.type === "discovery:daemons" &&
    Array.isArray((msg as DaemonDiscoveryDaemonsMessage).daemons)
  );
}

export type RadioBinaryFrame =
  | {
      kind: "fft";
      devIdx: number;
      centerHz: number;
      spanHz: number;
      bins: Float32Array;
    }
  | { kind: "audio"; devIdx: number; sampleRate: number; samples: Int16Array };

export function generateCommandId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseBinaryFrame(data: ArrayBuffer): RadioBinaryFrame | null {
  if (data.byteLength < 2) return null;
  const dv = new DataView(data);
  const frameType = dv.getUint8(0);
  const devIdx = dv.getUint8(1);

  if (frameType === FRAME_TYPE_FFT) {
    if (data.byteLength < 18) return null;
    const centerHz = dv.getFloat64(2, true);
    const spanHz = dv.getFloat64(10, true);
    const binCount = Math.floor((data.byteLength - 18) / 4);
    const bins = new Float32Array(binCount);
    for (let i = 0; i < binCount; i++) {
      bins[i] = dv.getFloat32(18 + i * 4, true);
    }
    return { kind: "fft", devIdx, centerHz, spanHz, bins };
  }

  if (frameType === FRAME_TYPE_AUDIO) {
    if (data.byteLength < 6) return null;
    const sampleRate = dv.getUint32(2, true);
    const sampleCount = Math.floor((data.byteLength - 6) / 2);
    const samples = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = dv.getInt16(6 + i * 2, true);
    }
    return { kind: "audio", devIdx, sampleRate, samples };
  }

  return null;
}
