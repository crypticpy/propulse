export const FRAME_TYPE_FFT = 0x01;
export const FRAME_TYPE_AUDIO = 0x02;

export type RadioType = "sdr" | "transceiver";

export interface GainStage {
  name: string;
  label?: string;
  min: number;
  max: number;
  step: number;
}

export type RadioCommandCapability =
  | "tune"
  | "mode"
  | "gain"
  | "squelch"
  | "agc"
  | "antenna"
  | "filter"
  | "nr"
  | "nb"
  | "ptt"
  | "vfo"
  | "rit"
  | "xit"
  | "split"
  | "anf"
  | "qsk"
  | "vox"
  | "if_shift"
  | "cw_speed";

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
  /** Optional command-level feature negotiation. Missing advanced flags are unsupported. */
  commands?: Partial<Record<RadioCommandCapability, boolean>>;
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
  vfo?: "A" | "B";
  gains: Record<string, number>;
  agc: boolean;
  agcMode?: number;
  ptt?: boolean;
  filter?: RadioFilter;
  nr?: RadioNr;
  nb?: RadioNb;
  squelch?: number;
  signal_dbm?: number;
  rit?: { enabled: boolean; offsetHz: number };
  xit?: { enabled: boolean; offsetHz: number };
  split?: boolean;
  anf?: boolean;
  qsk?: boolean;
  vox?: boolean;
  lock?: boolean;
  txAntenna?: string;
  txMeter?: { powerW?: number; swr?: number; alc?: number };
  cwSpeed?: number;
  ifShift?: number;
}

export interface DaemonHelloMessage {
  type: "hello";
  version: string;
  daemon_id: string;
  features?: string[];
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

export interface DevicesAddedMessage {
  type: "devices:added";
  device_id: string;
  name: string;
}

export interface DevicesRemovedMessage {
  type: "devices:removed";
  device_id: string;
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

export interface WsjtxStatus {
  frequency: number;
  mode: string;
  dxCall?: string;
  dxGrid?: string;
  txEnabled: boolean;
  decoding: boolean;
  rxDF: number;
  txDF: number;
  instanceId?: string;
}

export interface WsjtxDecode {
  isNew: boolean;
  time: number;
  snr: number;
  deltaTime: number;
  deltaFrequency: number;
  mode: string;
  message: string;
  lowConfidence: boolean;
  callsign?: string;
  grid?: string;
  instanceId?: string;
}

export interface WsjtxQsoLogged {
  callsign: string;
  grid?: string;
  frequency: number;
  mode: string;
  reportSent: string;
  reportReceived: string;
  txPower: string;
  comments: string;
  timestamp: string;
  adifRecord?: string;
  instanceId?: string;
}

export interface WsjtxStatusMessage {
  type: "wsjtx:status";
  status: WsjtxStatus;
}

export interface WsjtxDecodeMessage {
  type: "wsjtx:decode";
  decode: WsjtxDecode;
}

export interface WsjtxQsoLoggedMessage {
  type: "wsjtx:qso_logged";
  qso: WsjtxQsoLogged;
}

export interface WsjtxClearMessage {
  type: "wsjtx:clear";
  window?: string;
  instanceId?: string;
}

export interface ClusterSpot {
  id?: string;
  key?: string;
  spotter: string;
  spotterGrid?: string;
  dx: string;
  dxGrid?: string;
  /** Frequency in kHz */
  freq: number;
  comment: string;
  time: string;
  mode?: string;
  band?: string;
}

export interface ClusterSpotMessage {
  type: "cluster:spot";
  spotter: string;
  spotterGrid?: string;
  dx: string;
  dxGrid?: string;
  /** Frequency in kHz */
  freq: number;
  comment: string;
  time: string;
  mode?: string;
  band?: string;
  id?: string;
  key?: string;
}

export interface ClusterStatusMessage {
  type: "cluster:status";
  node?: string;
  connected: boolean;
  spotsReceived: number;
  lastSpotTime?: string;
  key?: string;
}

export type DaemonIncomingMessage =
  | DaemonHelloMessage
  | DaemonResponseMessage
  | DevicesListMessage
  | DevicesAddedMessage
  | DevicesRemovedMessage
  | RadioStateMessage
  | RadioSmeterMessage
  | DaemonStatusMessage
  | DaemonDiscoveryDaemonsMessage
  | WsjtxStatusMessage
  | WsjtxDecodeMessage
  | WsjtxQsoLoggedMessage
  | WsjtxClearMessage
  | ClusterSpotMessage
  | ClusterStatusMessage
  | { type: string; [k: string]: unknown };

export function isDevicesListMessage(
  msg: DaemonIncomingMessage,
): msg is DevicesListMessage {
  return (
    msg.type === "devices:list" &&
    Array.isArray((msg as DevicesListMessage).devices)
  );
}

export function isDevicesAddedMessage(
  msg: DaemonIncomingMessage,
): msg is DevicesAddedMessage {
  return (
    msg.type === "devices:added" &&
    typeof (msg as DevicesAddedMessage).device_id === "string"
  );
}

export function isDevicesRemovedMessage(
  msg: DaemonIncomingMessage,
): msg is DevicesRemovedMessage {
  return (
    msg.type === "devices:removed" &&
    typeof (msg as DevicesRemovedMessage).device_id === "string"
  );
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

export function isWsjtxStatusMessage(
  msg: DaemonIncomingMessage,
): msg is WsjtxStatusMessage {
  return (
    msg.type === "wsjtx:status" &&
    typeof (msg as WsjtxStatusMessage).status === "object"
  );
}

export function isWsjtxDecodeMessage(
  msg: DaemonIncomingMessage,
): msg is WsjtxDecodeMessage {
  return (
    msg.type === "wsjtx:decode" &&
    typeof (msg as WsjtxDecodeMessage).decode === "object"
  );
}

export function isClusterSpotMessage(
  msg: DaemonIncomingMessage,
): msg is ClusterSpotMessage {
  return (
    msg.type === "cluster:spot" &&
    typeof (msg as ClusterSpotMessage).freq === "number"
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
    if ((data.byteLength - 18) % 4 !== 0) return null;
    const centerHz = dv.getFloat64(2, true);
    const spanHz = dv.getFloat64(10, true);
    const bins = new Float32Array(data.slice(18));
    return { kind: "fft", devIdx, centerHz, spanHz, bins };
  }

  if (frameType === FRAME_TYPE_AUDIO) {
    if (data.byteLength < 6) return null;
    const sampleRate = dv.getUint32(2, true);
    const samples = new Int16Array(data, 6);
    return { kind: "audio", devIdx, sampleRate, samples };
  }

  return null;
}
