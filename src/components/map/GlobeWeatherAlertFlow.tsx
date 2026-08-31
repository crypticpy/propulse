/**
 * GlobeWeatherAlertFlow
 *
 * Coordinates the globe's compact weather flyout with the full alert dialog.
 * The flyout deliberately remains mounted behind the modal so
 * AccessibleDialog can restore focus to the exact "View Full Alert" button
 * that opened it. While the modal is open, the flyout's document-level
 * outside-click and Escape handlers are suspended so they cannot unmount that
 * restoration target in response to events owned by the modal.
 */

import { useCallback, useState } from "react";
import type { WeatherAlert } from "@/lib/api/weather";
import { WeatherAlertFlyout } from "./WeatherAlertFlyout";
import { WeatherAlertModal } from "./WeatherAlertModal";

export interface GlobeWeatherAlertSelection {
  alert: WeatherAlert;
  screenPos: { x: number; y: number };
}

interface GlobeWeatherAlertFlowProps {
  selection: GlobeWeatherAlertSelection | null;
  onFlyoutClose: () => void;
}

export function GlobeWeatherAlertFlow({
  selection,
  onFlyoutClose,
}: GlobeWeatherAlertFlowProps) {
  const [modalAlert, setModalAlert] = useState<WeatherAlert | null>(null);

  const handleViewDetails = useCallback((alert: WeatherAlert) => {
    // Do not clear selection here: its flyout owns the durable opener that
    // AccessibleDialog will restore after the detail view closes.
    setModalAlert(alert);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalAlert(null);
  }, []);

  return (
    <>
      <WeatherAlertFlyout
        visible={Boolean(selection)}
        position={selection?.screenPos ?? { x: 0, y: 0 }}
        alert={selection?.alert ?? null}
        onClose={onFlyoutClose}
        onViewDetails={handleViewDetails}
        suspended={Boolean(modalAlert)}
      />
      <WeatherAlertModal alert={modalAlert} onClose={handleModalClose} />
    </>
  );
}

export default GlobeWeatherAlertFlow;
