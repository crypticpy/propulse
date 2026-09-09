import { useUTCClock } from "@/hooks/useUTCClock";
import {
  launchPad,
  launchProvider,
  launchTimingLabel,
  netDateLabel,
  useLaunches,
} from "@/hooks/useLaunches";
import { reportFooter } from "../tokens";
import { useVisibleRows } from "../useVisibleRows";
import { WallReport, type WallReportFact } from "./WallReport";

export interface LaunchesReportProps {
  open: boolean;
  onClose: () => void;
}

export function LaunchesReport({ open, onClose }: LaunchesReportProps) {
  const { launches, next, status, stale, retrievedAt, isLoading } =
    useLaunches();
  const now = useUTCClock(60_000);
  const [listRef, visible] = useVisibleRows<HTMLDivElement>(launches.length);

  const idle = reportFooter(
    "LAUNCH LIBRARY 2 · THESPACEDEVS",
    retrievedAt ? Date.parse(retrievedAt) : null,
    now,
  );

  if (!next && !isLoading) {
    return (
      <WallReport
        open={open}
        onClose={onClose}
        title="Launch report"
        hero="—"
        verdict={status === "unavailable" ? "NO FEED" : "NONE"}
        footer={idle.footer}
        updated={idle.updated}
      >
        <p className="hcr-note">
          {status === "unavailable"
            ? "Launch Library 2 is unreachable right now."
            : "No upcoming launches in the current window."}
        </p>
      </WallReport>
    );
  }

  const facts: WallReportFact[] = [
    { label: "PROVIDER", value: next ? launchProvider(next) : "—" },
    { label: "PAD", value: next ? launchPad(next) : "—" },
    {
      label: "NET",
      value: next?.net ? netDateLabel(next.net, now) : "—",
    },
    { label: "STATUS", value: next ? next.status.toUpperCase() || "—" : "—" },
    {
      label: "WINDOW",
      value: launches.length ? `${visible} OF ${launches.length}` : "—",
    },
    { label: "FEED", value: stale ? "STALE" : status.toUpperCase() },
  ];

  const { footer, updated } = reportFooter(
    stale
      ? "LAUNCH LIBRARY 2 · LAST GOOD PAYLOAD"
      : "LAUNCH LIBRARY 2 · THESPACEDEVS",
    retrievedAt ? Date.parse(retrievedAt) : null,
    now,
  );

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Launch report"
      tone={stale ? "warn" : "info"}
      hero={next ? launchTimingLabel(next, now) : "—"}
      verdict={next ? next.status.toUpperCase() || "NEXT" : "LOADING"}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="launches"
      pinElement={<LaunchesReport open onClose={onClose} />}
    >
      <div className="hcr-box hcr-box--fill">
        <h4>
          NEXT LAUNCHES ·{" "}
          {visible < launches.length
            ? `top ${visible} of ${launches.length}`
            : launches.length || "—"}
        </h4>
        {isLoading && launches.length === 0 ? (
          <p className="hcr-note">Loading upcoming launches…</p>
        ) : (
          <div className="hcr-list" ref={listRef}>
            {launches.slice(0, visible).map((row) => (
              <div key={row.id} className="hcr-item">
                <b>{row.name}</b>
                <span>
                  {launchProvider(row)} · {launchPad(row)}
                </span>
                <span>
                  {launchTimingLabel(row, now)} · {row.status.toUpperCase() || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sr-only">
        <table aria-label="Upcoming launches">
          <thead>
            <tr>
              {["Name", "Provider", "Pad", "NET UTC", "T-minus", "Status"].map(
                (label) => (
                  <th key={label}>{label}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {launches.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{launchProvider(row)}</td>
                <td>{launchPad(row)}</td>
                <td>{row.net ?? "TBD"}</td>
                <td>{launchTimingLabel(row, now)}</td>
                <td>{row.statusName || row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WallReport>
  );
}
