import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUTCClock } from "@/hooks/useUTCClock";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { subscribeLogEntries } from "@/lib/db/logStore";
import {
  buildContactHistory,
  contactLocation,
  readHamClockContactHistory,
} from "@/lib/hamclock/recentContacts";
import { resolveUnits } from "@/lib/hamclock/units";
import { getBandColor } from "@/lib/utils/spotColors";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useMapStore } from "@/stores/mapStore";
import { HamClockButton } from "../controls";
import { reportFooter } from "../tokens";
import { useElementSize } from "../useElementSize";
import { WallReport } from "./WallReport";

export function RecentContactsReport({
  open,
  onClose,
  initialDay = null,
}: {
  open: boolean;
  onClose: () => void;
  initialDay?: string | null;
}) {
  const now = useUTCClock(30_000);
  const today = now.toISOString().slice(0, 10);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const location = useActiveLocation();
  const units = useHamClockDisplayStore((s) => s.units);
  const query = useQuery({
    queryKey: ["hamclock-contact-history", today],
    queryFn: () => readHamClockContactHistory(today),
    enabled: open,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });
  const { refetch } = query;
  useEffect(
    () =>
      open
        ? subscribeLogEntries(() => {
            void refetch();
          })
        : undefined,
    [open, refetch],
  );
  const minute = Math.floor(now.getTime() / 60_000);
  const history = useMemo(
    () =>
      buildContactHistory(
        query.data?.entries ?? [],
        new Date(minute * 60_000),
        selectedDay,
      ),
    [query.data, minute, selectedDay],
  );
  const { summary } = history;
  const target = contactLocation(summary.last?.grid);
  const resolvedUnits = resolveUnits(units, location?.grid);
  const best = summary.bestDx;
  const distance = best
    ? `${Math.round(best.km * (resolvedUnits === "imperial" ? 0.621371 : 1)).toLocaleString()} ${resolvedUnits === "imperial" ? "mi" : "km"}`
    : "LOCATION UNAVAILABLE";
  const period = selectedDay ?? "THIS MONTH";
  const { footer, updated } = reportFooter(
    "LOCAL LOGBOOK · READ · UTC / MONDAY WEEK",
    query.data?.readAt,
  );
  const loaded = Boolean(query.data);
  const hasHistory = history.totalInRange > 0;
  const gap = summary.longestGapMinutes;

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Recent contacts report · logbook"
      hero={
        <>
          {loaded
            ? (selectedDay
                ? summary.count
                : history.todayCount
              ).toLocaleString()
            : "—"}
          <span className="hcr-unit">
            {selectedDay ? "QSOS ON DAY" : "QSOS TODAY"}
          </span>
        </>
      }
      verdict={
        query.isError ? "LOG READ FAILED" : !loaded ? "READING LOG" : undefined
      }
      tone="accent"
      footer={footer}
      updated={updated}
      pinId="recent-contacts"
      pinElement={
        <RecentContactsReport open onClose={onClose} initialDay={selectedDay} />
      }
      facts={
        loaded
          ? [
              { label: "TODAY · UTC", value: history.todayCount },
              { label: "THIS WEEK · UTC", value: history.weekCount },
              { label: "THIS MONTH · UTC", value: history.monthCount },
              {
                label: selectedDay ? "DAY DXCC" : "MONTH DXCC",
                value: summary.uniqueDxcc,
              },
              {
                label: selectedDay ? "DAY TOP BAND" : "MONTH TOP BAND",
                value: summary.topBand
                  ? `${summary.topBand.value} · ${summary.topBand.count}`
                  : "—",
              },
              {
                label: selectedDay ? "DAY TOP MODE" : "MONTH TOP MODE",
                value: summary.topMode
                  ? `${summary.topMode.value} · ${summary.topMode.count}`
                  : "—",
              },
            ]
          : []
      }
    >
      {query.isError && (
        <p className="hcr-note" role="status">
          Could not refresh the local logbook.
          {loaded ? " Showing the last successful read." : " Try again below."}
        </p>
      )}
      {!loaded ? (
        <div className="hcr-box">
          <p className="hcr-note">
            {query.isError
              ? "NO LOGBOOK AVAILABLE"
              : "Reading locally stored contacts…"}
          </p>
          <HamClockButton onClick={() => void refetch()}>
            RETRY LOG READ
          </HamClockButton>
        </div>
      ) : !hasHistory ? (
        <div className="hcr-box">
          <p className="hcr-note">
            {query.data?.totalCount === 0
              ? "NO CONTACTS LOGGED"
              : "NO CONTACTS IN THIS PERIOD"}
          </p>
          <p className="hcr-note">
            Open the logbook to view older entries or log your first contact.
            This report covers the last 30 days and the current calendar month.
          </p>
        </div>
      ) : (
        <>
          <div className="hcr-cols hcr-cols--even">
            <div className="hcr-box">
              <h4>{period} · LAST CONTACT</h4>
              <HamClockButton
                disabled={!target}
                onClick={() => {
                  if (target && summary.last) {
                    useMapStore.getState().setTarget({
                      ...target,
                      name: summary.last.callsign,
                      grid: summary.last.grid,
                    });
                    useMapStore
                      .getState()
                      .setCenterLocation(target.lat, target.lon);
                  }
                }}
              >
                {summary.last
                  ? `${summary.last.callsign} · ${summary.last.band} · ${summary.last.timeOn} UTC`
                  : "NO CONTACTS ON DAY"}
              </HamClockButton>
              <p className="hcr-note">
                {summary.last && !target
                  ? "Location unavailable · contact remains in the log."
                  : "Select the last contact to set its logged grid as the map target."}
              </p>
            </div>
            <div className="hcr-box">
              <h4>{period} · BEST DX</h4>
              <p className="hcr-note">
                {best ? `${best.entry.callsign} · ${distance}` : distance}
              </p>
              <p className="hcr-note">
                {summary.located}/{summary.count} with both logged grids ·{" "}
                {summary.unresolvedDxcc} unresolved DXCC
              </p>
              <p className="hcr-note">
                Longest gap between contacts:{" "}
                {gap === null
                  ? "—"
                  : `${Math.floor(gap / 60)}h ${Math.floor(gap % 60)}m`}
              </p>
            </div>
          </div>
          <ContactDays
            days={history.days}
            selectedDay={selectedDay}
            onSelect={setSelectedDay}
          />
        </>
      )}
    </WallReport>
  );
}

function ContactDays({
  days,
  selectedDay,
  onSelect,
}: {
  days: ReturnType<typeof buildContactHistory>["days"];
  selectedDay: string | null;
  onSelect: (date: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const measured = useElementSize(ref);
  const width = measured.width || 900;
  const height = measured.height || 180;
  const max = Math.max(1, ...days.map((day) => day.count));
  const plotHeight = Math.max(1, height - 34);
  const step = width / days.length;
  return (
    <div className="hcr-chart">
      <p className="hcr-chart-title">
        QSOS — 30 D · LOGBOOK · UTC · PEAK {max}
      </p>
      <div className="hcr-plot" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Daily contact counts; band labels and exact counts in the accompanying table"
        >
          {days.map((day, index) => (
            <g key={day.date}>
              <rect
                x={index * step + step * 0.15}
                y={plotHeight * (1 - day.count / max)}
                width={step * 0.7}
                height={(plotHeight * day.count) / max}
                fill={day.band ? getBandColor(day.band) : "var(--hc-dim)"}
              />
              {(index === 0 || index === 14 || index === 29) && (
                <text
                  x={(index + 0.5) * step}
                  y={height - 5}
                  textAnchor={
                    index === 0 ? "start" : index === 29 ? "end" : "middle"
                  }
                  fill="var(--hc-dim)"
                  fontSize={Math.max(12, height * 0.09)}
                >
                  {day.date.slice(5)}
                  {index === 29 ? " TODAY" : ""}
                </text>
              )}
              {day.date === selectedDay && (
                <line
                  x1={(index + 0.5) * step}
                  x2={(index + 0.5) * step}
                  y1={0}
                  y2={plotHeight}
                  stroke="var(--hc-fg)"
                  strokeDasharray="4 4"
                />
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="hcr-contact-day-control">
        <label htmlFor={inputId}>{selectedDay ?? "SELECT A DAY"}</label>
        <input
          id={inputId}
          type="range"
          min={0}
          max={29}
          value={
            selectedDay
              ? Math.max(
                  0,
                  days.findIndex((day) => day.date === selectedDay),
                )
              : 29
          }
          aria-valuetext={
            selectedDay ?? "No day selected; showing current month"
          }
          onChange={(event) => onSelect(days[Number(event.target.value)].date)}
        />
        <HamClockButton onClick={() => onSelect(days[29].date)}>
          TODAY
        </HamClockButton>
        <HamClockButton onClick={() => onSelect(null)}>
          MONTH SUMMARY
        </HamClockButton>
      </div>
      <table className="sr-only">
        <caption>QSOs — 30 D · LOGBOOK · UTC</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Contacts</th>
            <th>Dominant band</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{day.count}</td>
              <td>{day.band ?? "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
