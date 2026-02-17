/**
 * ICOM Radio Discovery — Serial Port Scanning
 *
 * Scans for ICOM radios connected via USB serial ports.
 * Uses VID/PID matching and CI-V broadcast probing to identify
 * the radio model and CI-V address.
 */

import { SerialPort } from "serialport";
import { CivFrameParser } from "./civ/codec.js";
import { broadcastReadFrequency } from "./civ/commands.js";
import { ICOM_MODELS, CIV_CONTROLLER_ADDR, CivCmd } from "./civ/types.js";

// ─── USB VID/PID Table ────────────────────────────────────────────────────────

interface UsbDeviceHint {
  /** USB Vendor ID (uppercase hex) */
  vid: string;
  /** USB Product ID (uppercase hex) */
  pid: string;
  /** Human-readable description */
  hint: string;
}

/**
 * Known USB VID/PID combinations for ICOM radios.
 * Modern ICOM MK2 radios use native USB CDC/ACM. Older models use
 * Silicon Labs CP210x or FTDI USB-to-UART bridges.
 */
const ICOM_USB_DEVICES: UsbDeviceHint[] = [
  // Native ICOM USB (MK2 radios — IC-7300 MK2, IC-7610 MK2, etc.)
  { vid: "0C26", pid: "0052", hint: "ICOM Native USB (IC-7300 MK2)" },
  { vid: "0C26", pid: "0053", hint: "ICOM Native USB (IC-7610 MK2)" },
  { vid: "0C26", pid: "0054", hint: "ICOM Native USB (IC-9700 MK2)" },
  // Silicon Labs CP210x (original IC-7300, IC-9700, IC-7610, etc.)
  { vid: "10C4", pid: "EA60", hint: "CP2102 (IC-7300, IC-9700, IC-7610)" },
  { vid: "10C4", pid: "EA70", hint: "CP2105 (IC-705)" },
  // FTDI chips (various older ICOM)
  { vid: "0403", pid: "6001", hint: "FTDI FT232 (Various ICOM)" },
  { vid: "0403", pid: "6015", hint: "FTDI FT-X (Various ICOM)" },
];

// ─── Discovery Result ─────────────────────────────────────────────────────────

export interface DiscoveredRadio {
  /** Serial port path (e.g. "/dev/tty.SLAB_USBtoUART", "COM3") */
  port: string;
  /** CI-V address of the radio */
  radioAddress: number;
  /** Human-readable model name (e.g. "IC-7300") */
  modelName: string;
  /** USB Vendor ID (if available) */
  vid?: string;
  /** USB Product ID (if available) */
  pid?: string;
  /** Default baud rate for this radio */
  baudRate: number;
}

// ─── Default Baud Rates ───────────────────────────────────────────────────────

/** Known default baud rates by CI-V address */
const DEFAULT_BAUD_RATES: Record<number, number> = {
  0x94: 19200, // IC-7300
  0xb6: 115200, // IC-7300 MK2
  0xa4: 115200, // IC-705
  0xa2: 115200, // IC-9700
  0x98: 115200, // IC-7610
  0x8e: 19200, // IC-7851
  0x96: 19200, // IC-R8600
  0x70: 19200, // IC-7100
};

// ─── Port Matching ────────────────────────────────────────────────────────────

/** Check if a serial port matches any known ICOM USB VID/PID or manufacturer */
function matchesIcomVidPid(
  portInfo: Awaited<ReturnType<typeof SerialPort.list>>[0],
): UsbDeviceHint | null {
  const vid = portInfo.vendorId?.toUpperCase();
  const pid = portInfo.productId?.toUpperCase();

  // Exact VID/PID match
  if (vid && pid) {
    const exact = ICOM_USB_DEVICES.find((d) => d.vid === vid && d.pid === pid);
    if (exact) return exact;
  }

  // Fallback: manufacturer string contains "Icom" (catches future models)
  const mfg = (portInfo as { manufacturer?: string }).manufacturer ?? "";
  if (/icom/i.test(mfg)) {
    return {
      vid: vid ?? "????",
      pid: pid ?? "????",
      hint: `ICOM USB (${mfg})`,
    };
  }

  return null;
}

// ─── Probe ────────────────────────────────────────────────────────────────────

/**
 * Probe a serial port for an ICOM radio.
 * Sends a broadcast read-frequency command (to address 0x00) and waits
 * for a response to determine the radio's CI-V address.
 *
 * Returns the radio address if found, or null if no response.
 */
async function probePort(
  portPath: string,
  baudRate: number,
  timeoutMs = 2000,
): Promise<number | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const parser = new CivFrameParser();

    const port = new SerialPort({
      path: portPath,
      baudRate,
      autoOpen: false,
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          port.close();
        } catch {
          // ignore close errors
        }
        resolve(null);
      }
    }, timeoutMs);

    port.on("error", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    });

    port.on("data", (data: Buffer) => {
      const frames = parser.append(data);
      for (const frame of frames) {
        // Look for a frequency response (cmd 0x03 echo) from any radio
        if (
          frame.command === CivCmd.READ_FREQ &&
          frame.to === CIV_CONTROLLER_ADDR &&
          !resolved
        ) {
          resolved = true;
          clearTimeout(timer);
          const radioAddr = frame.from;
          try {
            port.close();
          } catch {
            // ignore
          }
          resolve(radioAddr);
          return;
        }
        // Also accept OK response (some radios respond with just FB)
        if (frame.isOk && frame.to === CIV_CONTROLLER_ADDR && !resolved) {
          resolved = true;
          clearTimeout(timer);
          const radioAddr = frame.from;
          try {
            port.close();
          } catch {
            // ignore
          }
          resolve(radioAddr);
          return;
        }
      }
    });

    port.open((err) => {
      if (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
        return;
      }

      // Send broadcast read-frequency command
      const cmd = broadcastReadFrequency(CIV_CONTROLLER_ADDR);
      port.write(cmd, (writeErr) => {
        if (writeErr && !resolved) {
          resolved = true;
          clearTimeout(timer);
          try {
            port.close();
          } catch {
            // ignore
          }
          resolve(null);
        }
      });
    });
  });
}

// ─── Main Discovery Function ──────────────────────────────────────────────────

/**
 * Scan all serial ports for connected ICOM radios.
 *
 * 1. Lists all available serial ports
 * 2. Filters by known ICOM USB VID/PID combinations
 * 3. For each candidate, probes with CI-V broadcast to get radio address
 * 4. Returns discovered radios with model names
 */
export async function scanForIcomRadios(): Promise<DiscoveredRadio[]> {
  const ports = await SerialPort.list();
  const candidates = ports
    .map((p) => ({ port: p, hint: matchesIcomVidPid(p) }))
    .filter(
      (c): c is { port: (typeof ports)[0]; hint: UsbDeviceHint } =>
        c.hint !== null,
    );

  if (candidates.length === 0) return [];

  // Deduplicate multi-port devices (e.g. IC-7300 MK2 exposes 2 USB CDC/ACM
  // ports with the same serial number). Keep the lowest-numbered port for each
  // serial, which is typically the CI-V control port.
  const seenSerials = new Set<string>();
  const deduped = candidates.filter(({ port }) => {
    const sn = port.serialNumber;
    if (sn && seenSerials.has(sn)) return false;
    if (sn) seenSerials.add(sn);
    return true;
  });

  const results: DiscoveredRadio[] = [];

  // Probe each candidate sequentially (serial ports are exclusive)
  for (const { port } of deduped) {
    // Native USB (VID 0C26) uses 115200. CP210x defaults vary.
    const isNativeUsb = port.vendorId?.toUpperCase() === "0C26";
    const baudRates = isNativeUsb ? [115200, 19200] : [19200, 115200, 9600];

    for (const baudRate of baudRates) {
      const radioAddress = await probePort(port.path, baudRate);
      if (radioAddress !== null) {
        const modelName =
          ICOM_MODELS[radioAddress] ?? `ICOM (0x${radioAddress.toString(16)})`;
        const defaultBaud = DEFAULT_BAUD_RATES[radioAddress] ?? baudRate;

        results.push({
          port: port.path,
          radioAddress,
          modelName,
          vid: port.vendorId?.toUpperCase(),
          pid: port.productId?.toUpperCase(),
          baudRate: defaultBaud,
        });
        break; // Found radio at this port, move to next port
      }
    }
  }

  return results;
}

/**
 * List all serial ports that match ICOM USB VID/PID combinations,
 * without probing (faster, for UI display before connect).
 */
export async function listIcomCandidatePorts(): Promise<
  Array<{
    path: string;
    hint: string;
    vid?: string;
    pid?: string;
  }>
> {
  const ports = await SerialPort.list();
  return ports
    .map((p) => ({ port: p, hint: matchesIcomVidPid(p) }))
    .filter(
      (c): c is { port: (typeof ports)[0]; hint: UsbDeviceHint } =>
        c.hint !== null,
    )
    .map(({ port, hint }) => ({
      path: port.path,
      hint: hint.hint,
      vid: port.vendorId?.toUpperCase(),
      pid: port.productId?.toUpperCase(),
    }));
}
