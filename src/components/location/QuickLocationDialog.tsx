/**
 * On-demand current-location editor. This is deliberately split from the
 * always-mounted trigger so geocoding and device-location support do not
 * inflate the application entry bundle.
 */

import { useCallback, useState } from "react";
import {
  useActiveLocation,
  useHomeLocation,
  useIsTemporaryActive,
} from "@/hooks/useActiveLocation";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { useProfileStore } from "@/stores/profileStore";
import { DetailModal } from "@/components/ui/DetailModal";
import { LocationInput } from "@/components/settings/LocationInput";

interface QuickLocationDialogProps {
  onClose: () => void;
}

export function QuickLocationDialog({ onClose }: QuickLocationDialogProps) {
  const activeLocation = useActiveLocation();
  const homeLocation = useHomeLocation();
  const isTemporaryActive = useIsTemporaryActive();
  const setCurrentLocation = useProfileStore(
    (state) => state.setCurrentLocation,
  );
  const clearTemporaryLocation = useProfileStore(
    (state) => state.clearTemporaryLocation,
  );
  const [grid, setGrid] = useState(
    () => activeLocation?.grid ?? homeLocation?.grid ?? "",
  );
  const [coordinates, setCoordinates] = useState<{
    lat: number;
    lon: number;
  } | null>(() =>
    activeLocation
      ? { lat: activeLocation.lat, lon: activeLocation.lon }
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  const handleGridChange = useCallback((nextGrid: string) => {
    setGrid(nextGrid);
    // Direct grid edits use the locator center; richer input modes replace
    // this with their exact coordinates through onCoordinates.
    setCoordinates(null);
  }, []);

  const applyLocation = useCallback(() => {
    const normalizedGrid = grid.trim().toUpperCase();
    if (!isValidGrid(normalizedGrid)) {
      setError("Enter a valid 4- or 6-character Maidenhead grid.");
      return;
    }
    const resolved = coordinates ?? gridToLatLon(normalizedGrid);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setCurrentLocation({
      grid: normalizedGrid,
      lat: resolved.lat,
      lon: resolved.lon,
      timezone,
    });
    onClose();
  }, [coordinates, grid, onClose, setCurrentLocation]);

  const useHome = useCallback(() => {
    clearTemporaryLocation();
    onClose();
  }, [clearTemporaryLocation, onClose]);

  return (
    <DetailModal
      isOpen
      onClose={onClose}
      title="Update Current Location"
      subtitle="Use this temporary position across propagation, weather, and nearby activity. Your saved home QTH will not change."
      size="md"
      zIndexClassName="z-[550]"
    >
      {!homeLocation ? (
        <div className="rounded-xl border border-caution-amber/30 bg-caution-amber/10 p-4 text-sm text-caution-amber">
          Set up your home station first, then you can apply a travel location.
        </div>
      ) : (
        <div className="space-y-5">
          <LocationInput
            value={grid}
            onChange={handleGridChange}
            onCoordinates={setCoordinates}
            error={error}
            onError={setError}
          />

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-alert-red/30 bg-alert-red/10 px-3 py-2 text-sm text-alert-red"
            >
              {error}
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-400">
            <span className="text-gray-500">Home remains </span>
            <span className="font-mono text-gray-200">{homeLocation.grid}</span>
            {isTemporaryActive && activeLocation && (
              <span className="ml-2 text-caution-amber">
                · currently using {activeLocation.grid}
              </span>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {isTemporaryActive && (
              <button
                type="button"
                onClick={useHome}
                className="min-h-11 rounded-lg border border-signal-green/30 bg-signal-green/10 px-4 py-2 text-sm font-medium text-signal-green transition-colors hover:bg-signal-green/20"
              >
                Use Home QTH
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyLocation}
              className="min-h-11 rounded-lg border border-plasma-orange/50 bg-plasma-orange/20 px-4 py-2 text-sm font-semibold text-plasma-orange transition-colors hover:bg-plasma-orange/30"
            >
              Use This Location
            </button>
          </div>
        </div>
      )}
    </DetailModal>
  );
}

export default QuickLocationDialog;
