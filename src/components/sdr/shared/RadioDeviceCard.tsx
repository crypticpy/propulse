/**
 * RadioDeviceCard -- Device selector + connect/disconnect controls.
 * Shared between Classic and Flexible skins.
 */

import { Card } from "@/components/ui";
import type { DeviceInfo } from "@/lib/radio/protocol";

export interface RadioDeviceCardProps {
  devices: DeviceInfo[];
  selectedDeviceId: string | null;
  selectedDevice: DeviceInfo | null;
  connectedDeviceId: string | null;
  daemonConnected: boolean;
  canControlDevice: boolean;
  canControlConnected: boolean;
  onDeviceSelect: (deviceId: string | null) => void;
  onConnectRadio: () => void;
  onDisconnectRadio: () => void;
}

export function RadioDeviceCard({
  devices,
  selectedDeviceId,
  selectedDevice,
  connectedDeviceId,
  daemonConnected,
  canControlDevice,
  canControlConnected,
  onDeviceSelect,
  onConnectRadio,
  onDisconnectRadio,
}: RadioDeviceCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold text-su-text">Device</div>

      <label className="block text-xs text-su-muted">Radio</label>
      <select
        value={selectedDeviceId ?? ""}
        onChange={(e) => onDeviceSelect(e.target.value || null)}
        disabled={!daemonConnected}
        className="w-full px-3 py-2 bg-deep-space border border-su-line/40 rounded-lg text-su-text text-sm"
      >
        {devices.length === 0 && <option value="">No devices</option>}
        {devices.map((d) => (
          <option key={d.device_id} value={d.device_id}>
            {d.name}
          </option>
        ))}
      </select>

      {selectedDevice && (
        <div className="text-xs text-su-muted">
          <div className="flex justify-between">
            <span>Driver</span>
            <span className="text-su-muted font-mono">
              {selectedDevice.driver}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Type</span>
            <span className="text-su-muted font-mono">
              {selectedDevice.type}
            </span>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onConnectRadio}
          disabled={!canControlDevice || !!connectedDeviceId}
          className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-su-line/10 border border-su-line/40 text-su-text hover:bg-su-line/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Connect
        </button>
        <button
          type="button"
          onClick={onDisconnectRadio}
          disabled={!canControlConnected}
          className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-alert-red/10 border border-alert-red/30 text-su-text hover:bg-alert-red/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Disconnect
        </button>
      </div>
    </Card>
  );
}
