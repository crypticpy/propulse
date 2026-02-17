/**
 * Audio Device Resolver — Maps Radio Serial Ports to OS Audio Devices
 *
 * When a ham radio is connected via USB, its audio codec typically appears
 * as a separate OS audio input device. This module resolves which OS audio
 * device belongs to a given radio by matching USB VID/PID and device name
 * patterns.
 *
 * Supported manufacturers:
 *   - ICOM (IC-7300, IC-7300 MK2, IC-7610, IC-9700, IC-705, etc.)
 *   - Yaesu (FT-991A, FTDX101D, FTDX10, etc.)
 *   - Kenwood (TS-890S, TS-990S, TS-590SG, etc.)
 *   - Elecraft (K3, K3S, K4, KX3, KX2)
 *   - FlexRadio (FLEX-6000 series — network audio, name-based matching only)
 *
 * Platform behaviour:
 *   - macOS:   ffmpeg avfoundation device indices ("0", "1", "2")
 *   - Linux:   PulseAudio source names or ALSA device paths
 *   - Windows: DirectShow device names
 */

import { SerialPort } from "serialport";
import { AudioCapture, type AudioDeviceInfo } from "./audioCapture.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A hint linking a USB VID/PID pair to an audio device name pattern. */
export interface AudioDeviceHint {
  /** USB Vendor ID (uppercase hex, e.g. "08BB") */
  vid: string;
  /** USB Product ID (uppercase hex, e.g. "2901") */
  pid: string;
  /** Regex pattern to match against OS audio device names */
  namePattern: RegExp;
  /** Human-readable manufacturer name */
  manufacturer: string;
}

/** A resolved audio device match. */
export interface AudioDeviceMatch {
  /** Platform-specific ffmpeg device identifier (index, name, or path) */
  deviceId: string;
  /** Human-readable device name from the OS */
  deviceName: string;
  /** How the match was determined */
  matchMethod: "vid-pid" | "name" | "manufacturer";
}

// ─── Manufacturer Hint Tables ────────────────────────────────────────────────

/**
 * ICOM audio device hints.
 *
 * Original IC-7300/IC-7610/IC-9700 use a TI PCM2901/PCM2902 USB audio codec
 * (Burr-Brown) that appears as "USB Audio CODEC" on all platforms. MK2 models
 * use ICOM's native USB composite device (VID 0C26) which presents both a
 * serial CDC/ACM port and a UAC audio interface.
 */
export const ICOM_AUDIO_HINTS: readonly AudioDeviceHint[] = [
  // TI/Burr-Brown PCM2901 — IC-7300, IC-7610, IC-9700 (original)
  {
    vid: "08BB",
    pid: "2901",
    namePattern: /USB Audio CODEC|ICOM|IC-\d{4}/i,
    manufacturer: "ICOM",
  },
  // TI/Burr-Brown PCM2902 — some ICOM models (alternate codec)
  {
    vid: "08BB",
    pid: "2902",
    namePattern: /USB Audio CODEC|ICOM|IC-\d{4}/i,
    manufacturer: "ICOM",
  },
  // ICOM native USB — IC-7300 MK2
  {
    vid: "0C26",
    pid: "0052",
    namePattern: /ICOM|IC-7300|USB Audio/i,
    manufacturer: "ICOM",
  },
  // ICOM native USB — IC-7610 MK2
  {
    vid: "0C26",
    pid: "0053",
    namePattern: /ICOM|IC-7610|USB Audio/i,
    manufacturer: "ICOM",
  },
  // ICOM native USB — IC-9700 MK2
  {
    vid: "0C26",
    pid: "0054",
    namePattern: /ICOM|IC-9700|USB Audio/i,
    manufacturer: "ICOM",
  },
] as const;

/**
 * Yaesu audio device hints.
 *
 * The FT-991A, FTDX101D, and FTDX10 use a TI PCM2901 USB audio codec
 * internally. The audio device appears as "USB Audio CODEC" on macOS/Linux,
 * or may include "Yaesu" in the name on some Windows driver installations.
 */
export const YAESU_AUDIO_HINTS: readonly AudioDeviceHint[] = [
  // TI/Burr-Brown PCM2901 — FT-991A, FTDX101D, FTDX10
  {
    vid: "08BB",
    pid: "2901",
    namePattern: /USB Audio CODEC|Yaesu|FT-?\d{3,4}/i,
    manufacturer: "Yaesu",
  },
  // TI/Burr-Brown PCM2902 — some Yaesu models
  {
    vid: "08BB",
    pid: "2902",
    namePattern: /USB Audio CODEC|Yaesu|FT-?\d{3,4}/i,
    manufacturer: "Yaesu",
  },
] as const;

/**
 * Kenwood audio device hints.
 *
 * The TS-890S and TS-990S use a TI PCM2901 USB audio codec. Some models
 * may also use a PCM2902 variant. The TS-590SG uses a built-in USB audio
 * interface that may appear with "Kenwood" in the device name.
 */
export const KENWOOD_AUDIO_HINTS: readonly AudioDeviceHint[] = [
  // TI/Burr-Brown PCM2901 — TS-890S, TS-990S
  {
    vid: "08BB",
    pid: "2901",
    namePattern: /USB Audio CODEC|Kenwood|TS-\d{3}/i,
    manufacturer: "Kenwood",
  },
  // TI/Burr-Brown PCM2902 — some Kenwood models
  {
    vid: "08BB",
    pid: "2902",
    namePattern: /USB Audio CODEC|Kenwood|TS-\d{3}/i,
    manufacturer: "Kenwood",
  },
] as const;

/**
 * Elecraft audio device hints.
 *
 * Elecraft K3/K3S/K4 radios use built-in USB audio interfaces. The K4
 * exposes a native USB audio class device. The K3/KX-series use external
 * USB audio adapters or SignaLink interfaces, so name matching is the
 * primary strategy.
 */
export const ELECRAFT_AUDIO_HINTS: readonly AudioDeviceHint[] = [
  {
    vid: "0000",
    pid: "0000",
    namePattern: /Elecraft|K[34]|KX[23]/i,
    manufacturer: "Elecraft",
  },
] as const;

/**
 * FlexRadio audio device hints.
 *
 * FLEX-6000 series radios deliver audio over the network (SmartSDR DAX),
 * which installs a virtual audio device on the host. Match by name only
 * since there is no USB serial port involved.
 */
export const FLEXRADIO_AUDIO_HINTS: readonly AudioDeviceHint[] = [
  {
    vid: "0000",
    pid: "0000",
    namePattern: /FlexRadio|FLEX-?\d{4}|SmartSDR|DAX/i,
    manufacturer: "FlexRadio",
  },
] as const;

/**
 * Master lookup of all manufacturer hint tables, keyed by canonical
 * manufacturer name (lowercase). Add new manufacturers here.
 */
export const MANUFACTURER_HINTS: Readonly<
  Record<string, readonly AudioDeviceHint[]>
> = {
  icom: ICOM_AUDIO_HINTS,
  yaesu: YAESU_AUDIO_HINTS,
  kenwood: KENWOOD_AUDIO_HINTS,
  elecraft: ELECRAFT_AUDIO_HINTS,
  flexradio: FLEXRADIO_AUDIO_HINTS,
};

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Detect which manufacturer hint set to use based on the serial port's
 * manufacturer string. Returns the lowercase key into MANUFACTURER_HINTS,
 * or null if no match.
 */
function detectManufacturer(manufacturer: string): string | null {
  const lower = manufacturer.toLowerCase();
  if (lower.includes("icom")) return "icom";
  if (lower.includes("yaesu")) return "yaesu";
  if (lower.includes("kenwood")) return "kenwood";
  if (lower.includes("elecraft")) return "elecraft";
  if (lower.includes("flex")) return "flexradio";

  // Silicon Labs and FTDI chips are used by multiple manufacturers.
  // We cannot determine the manufacturer from the USB-to-UART bridge alone.
  return null;
}

/**
 * Retrieve the serial port info for a given port path.
 * Returns vendor ID, product ID, and manufacturer string.
 */
async function getSerialPortInfo(portPath: string): Promise<{
  vid: string | undefined;
  pid: string | undefined;
  manufacturer: string | undefined;
  serialNumber: string | undefined;
} | null> {
  try {
    const ports = await SerialPort.list();
    const match = ports.find((p) => p.path === portPath);
    if (!match) return null;

    return {
      vid: match.vendorId?.toUpperCase(),
      pid: match.productId?.toUpperCase(),
      manufacturer: (match as { manufacturer?: string }).manufacturer,
      serialNumber: match.serialNumber,
    };
  } catch {
    return null;
  }
}

// ─── Main Resolution Function ────────────────────────────────────────────────

/**
 * Resolve which OS audio device belongs to the radio connected at the
 * given serial port.
 *
 * Matching strategy (tried in order):
 *   1. **Name match** — Check if any OS audio device name matches a hint's
 *      `namePattern` for the detected (or specified) manufacturer.
 *   2. **Manufacturer match** — If the serial port's manufacturer string
 *      contains a known brand, search audio device names for that brand.
 *
 * @param serialPortPath - OS serial port path (e.g. "/dev/tty.usbmodem14201")
 * @param manufacturer   - Optional manufacturer override (e.g. "ICOM"). If
 *                         omitted, the manufacturer is auto-detected from the
 *                         serial port's USB descriptor strings.
 * @returns The matched audio device, or null if no match was found.
 */
export async function resolveAudioDevice(
  serialPortPath: string,
  manufacturer?: string,
): Promise<AudioDeviceMatch | null> {
  // Step 1: Get serial port info (VID/PID/manufacturer)
  const portInfo = await getSerialPortInfo(serialPortPath);

  // Step 2: Get available OS audio devices
  const audioDevices = await AudioCapture.listAudioDevices();
  if (audioDevices.length === 0) return null;

  // Step 3: Determine which hint set to use
  let hintsKey: string | null = null;

  if (manufacturer) {
    // Caller provided a manufacturer override
    hintsKey = manufacturer.toLowerCase();
    // Normalize common variations
    if (hintsKey.includes("icom")) hintsKey = "icom";
    else if (hintsKey.includes("yaesu")) hintsKey = "yaesu";
    else if (hintsKey.includes("kenwood")) hintsKey = "kenwood";
    else if (hintsKey.includes("elecraft")) hintsKey = "elecraft";
    else if (hintsKey.includes("flex")) hintsKey = "flexradio";
  } else if (portInfo?.manufacturer) {
    // Auto-detect from serial port manufacturer string
    hintsKey = detectManufacturer(portInfo.manufacturer);
  }

  const hints = hintsKey ? MANUFACTURER_HINTS[hintsKey] : undefined;

  // Step 4: Try matching strategies in order

  // Strategy 1: Name pattern match using hint table
  if (hints) {
    for (const hint of hints) {
      for (const device of audioDevices) {
        if (hint.namePattern.test(device.name)) {
          return {
            deviceId: device.id,
            deviceName: device.name,
            matchMethod: "name",
          };
        }
      }
    }
  }

  // Strategy 2: Manufacturer keyword match
  // If we know the manufacturer (from serial port or parameter), search for
  // audio devices whose name contains that manufacturer's name or radio model
  // patterns. This catches cases where the hint table's patterns are incomplete.
  if (hintsKey) {
    const mfgPatterns: Record<string, RegExp> = {
      icom: /ICOM|IC-\d{4}/i,
      yaesu: /Yaesu|FT-?\d{3,4}/i,
      kenwood: /Kenwood|TS-\d{3}/i,
      elecraft: /Elecraft|K[34]|KX[23]/i,
      flexradio: /FlexRadio|FLEX-?\d{4}|DAX/i,
    };

    const pattern = mfgPatterns[hintsKey];
    if (pattern) {
      for (const device of audioDevices) {
        if (pattern.test(device.name)) {
          return {
            deviceId: device.id,
            deviceName: device.name,
            matchMethod: "manufacturer",
          };
        }
      }
    }
  }

  // No hints matched — if we have VID/PID from the serial port, try a
  // heuristic: look for "USB Audio" devices (covers TI PCM2901/PCM2902
  // codecs that share the same system as ICOM/Yaesu/Kenwood radios).
  if (portInfo?.vid && portInfo?.pid) {
    // Check all manufacturer tables for a VID/PID match
    for (const tableHints of Object.values(MANUFACTURER_HINTS)) {
      for (const hint of tableHints) {
        if (hint.vid === portInfo.vid && hint.pid === portInfo.pid) {
          // Found a matching VID/PID in a hint table — search audio devices
          // using that hint's namePattern
          for (const device of audioDevices) {
            if (hint.namePattern.test(device.name)) {
              return {
                deviceId: device.id,
                deviceName: device.name,
                matchMethod: "vid-pid",
              };
            }
          }
        }
      }
    }
  }

  return null;
}

// ─── UI Helper ───────────────────────────────────────────────────────────────

/**
 * List all OS audio devices, annotating which one(s) match the connected
 * radio. Useful for building a device selector UI.
 *
 * @param serialPortPath - Optional serial port path. When provided, each
 *                         audio device is checked for a radio match and the
 *                         `radioMatch` field is set to the manufacturer name.
 * @returns Array of audio devices with optional `radioMatch` annotation.
 */
export async function listAudioDevicesWithRadioMatch(
  serialPortPath?: string,
): Promise<Array<AudioDeviceInfo & { radioMatch?: string }>> {
  const audioDevices = await AudioCapture.listAudioDevices();

  if (!serialPortPath) {
    return audioDevices.map((d) => ({ ...d }));
  }

  // Resolve the matching device so we can annotate it
  const match = await resolveAudioDevice(serialPortPath);

  // Also get manufacturer info for the annotation
  const portInfo = await getSerialPortInfo(serialPortPath);
  const mfgKey = portInfo?.manufacturer
    ? detectManufacturer(portInfo.manufacturer)
    : null;
  const mfgLabel = mfgKey
    ? mfgKey.charAt(0).toUpperCase() + mfgKey.slice(1)
    : "Radio";

  return audioDevices.map((device) => ({
    ...device,
    radioMatch: match && device.id === match.deviceId ? mfgLabel : undefined,
  }));
}
