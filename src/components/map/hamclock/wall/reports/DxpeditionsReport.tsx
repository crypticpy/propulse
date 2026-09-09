import { useMemo } from "react";
import {
  formatDateRange,
  useDxpeditions,
} from "@/hooks/useDxpeditions";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  getSchedulePhase,
  scheduleCountdown,
} from "@/lib/hamclock/schedule";
import {
  NG3K_ADXO_URL,
  activeCount,
  scheduledDxpeditions,
} from "@/lib/hamclock/wallCalendar";
import { useVisibleRows } from "../useVisibleRows";
import { reportFooter } from "../tokens";
import { WallReport } from "./WallReport";

export function DxpeditionsReport({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { entries, status, dataUpdatedAt, isLoading, error } =
    useDxpeditions();
  const now = useUTCClock();
  const rows = useMemo(
    () => scheduledDxpeditions(entries, now),
    [entries, now],
  );
  const live = activeCount(rows, now);
  // "empty" is a schedule that loaded fine and parsed to zero operations —
  // a different condition from unreachable/too-large, and not a load
  // failure (#609 review N7, mirrored from ContestsReport per #726). The
  // zero-rows branch below already has the correct copy for it ("No
  // announced operations").
  const unavailable =
    error != null || (status !== "ok" && status !== "empty");
  const { footer, updated } = reportFooter(
    "NG3K ADXO · RETRIEVED",
    unavailable ? null : dataUpdatedAt > 0 ? dataUpdatedAt : null,
    now,
  );
  const [ref, visible] = useVisibleRows<HTMLDivElement>(rows.length);

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="DXpeditions report"
      tone={unavailable ? "warn" : live > 0 ? "good" : "info"}
      hero={unavailable || isLoading ? "—" : live}
      verdict={
        unavailable ? "UNAVAILABLE" : live > 0 ? "ON AIR" : rows.length ? "NEXT" : "NONE"
      }
      facts={[
        { label: "LOADED", value: isLoading ? "—" : rows.length },
        { label: "ON AIR", value: unavailable ? "—" : live },
        { label: "SOURCE", value: "NG3K" },
      ]}
      footer={footer}
      updated={updated}
      pinId="dxpeditions"
      pinElement={<DxpeditionsReport open onClose={onClose} />}
    >
      <p className="hcr-note">
        {unavailable
          ? "DXpedition schedule unavailable. NG3K ADXO did not load."
          : "Announced operations from NG3K ADXO. A listing is not a confirmation the station is on air."}
      </p>
      <div className="hca-list" ref={ref}>
        {rows.slice(0, visible).map(({ entry, window }) => {
          const active = getSchedulePhase(window, now) === "active";
          return (
            <div
              className="hca-row"
              key={`${entry.callsign}:${entry.startDate}`}
            >
              <div className="hca-identity">
                <strong>
                  {active ? "NOW · " : ""}
                  {entry.callsign}
                </strong>
                <span>{entry.entity}</span>
              </div>
              <div className="hca-detail">
                <span>{scheduleCountdown(window, now)}</span>
                <span>{formatDateRange(entry.startDate, entry.endDate)}</span>
                {(entry.bands || entry.modes) && (
                  <span>
                    {[entry.bands, entry.modes].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="hcr-note">
            {isLoading
              ? "Reading announced operations…"
              : unavailable
                ? "No operations while the schedule is down."
                : "No announced operations."}
          </p>
        )}
      </div>
      <p className="hcr-note">
        TOP {visible} OF {rows.length} LOADED · ACTIVE FIRST
      </p>
      <a
        className="hcr-link-button"
        href={NG3K_ADXO_URL}
        target="_blank"
        rel="noreferrer"
      >
        NG3K ADXO
      </a>
    </WallReport>
  );
}
