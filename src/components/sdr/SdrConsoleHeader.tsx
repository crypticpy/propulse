/**
 * Persistent header bar for the SDR Console.
 * Renders above all skins — device selection, daemon controls, skin switcher, settings.
 */

import { Link } from "react-router-dom";
import type { DeviceInfo } from "@/lib/radio/protocol";
import type { SdrSkinName } from "@/components/sdr/skins/types";
import { SkinSwitcher } from "@/components/sdr/skins/SkinSwitcher";

export interface SdrConsoleHeaderProps {
  // Daemon
  daemonConnected: boolean;
  daemonConnecting: boolean;
  daemonUrl: string;
  // Device
  devices: DeviceInfo[];
  selectedDeviceId: string | null;
  selectedDevice: DeviceInfo | null;
  connectedDeviceId: string | null;
  canControlDevice: boolean;
  canControlConnected: boolean;

  // Callbacks
  onDeviceSelect: (deviceId: string | null) => void;
  onConnectRadio: () => void;
  onDisconnectRadio: () => void;
  onOpenDevicePicker: () => void;
  onOpenSdrSettings: () => void;

  // Skin
  activeSkin: SdrSkinName;
  onSkinChange: (skin: SdrSkinName) => void;
  isMobile: boolean;
}

export function SdrConsoleHeader({
  daemonConnected,
  daemonConnecting,
  daemonUrl,
  devices,
  selectedDeviceId,
  selectedDevice,
  connectedDeviceId,
  canControlDevice,
  canControlConnected,
  onDeviceSelect,
  onConnectRadio,
  onDisconnectRadio,
  onOpenDevicePicker,
  onOpenSdrSettings,
  activeSkin,
  onSkinChange,
  isMobile,
}: SdrConsoleHeaderProps) {
  const radioName = selectedDevice?.name ?? selectedDevice?.device_id ?? null;
  const isConnected = !!connectedDeviceId;

  return (
    <div className="h-10 shrink-0 bg-[#0d0d14] border-b border-white/10 px-3 flex items-center gap-2 text-gray-300 select-none">
      {/* Title */}
      {!isMobile && (
        <h2 className="text-sm font-semibold text-white whitespace-nowrap mr-1">
          SDR Console
        </h2>
      )}

      {/* Separator */}
      {!isMobile && <div className="w-px h-5 bg-white/10 shrink-0" />}

      {/* Device dropdown */}
      <select
        value={selectedDeviceId ?? ""}
        onChange={(e) => onDeviceSelect(e.target.value || null)}
        disabled={!daemonConnected || devices.length === 0}
        className="px-2 py-1 bg-black/40 border border-white/10 rounded text-[11px] text-gray-200 max-w-[180px] truncate disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {devices.length === 0 ? (
          <option value="">No devices</option>
        ) : (
          devices.map((d) => (
            <option key={d.device_id} value={d.device_id}>
              {d.name}
            </option>
          ))
        )}
      </select>

      {/* Connect / Disconnect */}
      {isConnected ? (
        <button
          type="button"
          onClick={onDisconnectRadio}
          disabled={!canControlConnected}
          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-alert-red/15 border border-alert-red/30 text-alert-red hover:bg-alert-red/25 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnectRadio}
          disabled={!canControlDevice || isConnected}
          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Connect
        </button>
      )}

      {/* Connection status dot + radio name */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
            daemonConnected
              ? "bg-signal-green shadow-[0_0_4px_theme(colors.signal-green)]"
              : daemonConnecting
                ? "bg-caution-amber animate-pulse"
                : "bg-gray-600"
          }`}
        />
        <span className="text-[11px] text-gray-400 truncate max-w-[120px]">
          {daemonConnected
            ? (radioName ?? "Connected")
            : daemonConnecting
              ? "Connecting..."
              : "Offline"}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-white/10 shrink-0" />

      {/* Daemon button */}
      <button
        type="button"
        onClick={onOpenDevicePicker}
        className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 whitespace-nowrap"
      >
        Daemon
      </button>

      {/* Daemon URL */}
      {!isMobile && (
        <span className="text-[10px] text-gray-500 font-mono truncate max-w-[160px]">
          {daemonUrl}
        </span>
      )}

      {/* Setup link */}
      {!isMobile && (
        <Link
          to="/setup"
          className="text-[10px] text-gray-500 hover:text-gray-300 shrink-0"
        >
          Setup
        </Link>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Skin switcher */}
      <SkinSwitcher
        activeSkin={activeSkin}
        onSkinChange={onSkinChange}
        isMobile={isMobile}
      />

      {/* Settings gear */}
      <button
        type="button"
        onClick={onOpenSdrSettings}
        className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
        title="SDR Settings"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.992 6.992 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
