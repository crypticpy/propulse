import type { WeatherAlert } from "@/lib/api/weather";
import { useVisibleRows } from "../useVisibleRows";
import { SEVERITY_TONE } from "./alertSeverity";

export interface NwsAlertBoxProps {
  title: string;
  /** Already ranked worst first. */
  alerts: readonly WeatherAlert[];
  error: boolean;
  emptyLabel: string;
}

/**
 * The active NWS alert set as a box that owns its report slot and draws only
 * as many whole rows as fit it (`useVisibleRows`): the report never scrolls,
 * and the heading says how many of the set are on screen.
 */
export function NwsAlertBox({
  title,
  alerts,
  error,
  emptyLabel,
}: NwsAlertBoxProps) {
  const [listRef, visible] = useVisibleRows<HTMLDivElement>(alerts.length);
  return (
    <div className="hcr-box hcr-box--fill">
      <h4>
        {title} · {alerts.length}
        {visible < alerts.length ? ` · top ${visible} of ${alerts.length}` : ""}
      </h4>
      {error ? (
        <p className="hcr-note">NWS alert feed unreachable. Retrying.</p>
      ) : alerts.length === 0 ? (
        <p className="hcr-empty hc-dim-text">{emptyLabel}</p>
      ) : (
        <div className="hcr-list" ref={listRef}>
          {alerts.slice(0, visible).map((alert) => (
            <div
              key={alert.id}
              className={`hcr-item ${SEVERITY_TONE[alert.severity]}`}
            >
              <b>
                {alert.event} · {alert.severity}
              </b>
              <span>{alert.areaDesc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
