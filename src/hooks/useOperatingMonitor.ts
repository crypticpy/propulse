import { useEffect } from "react";
import { create } from "zustand";
import { useOperatingStore } from "@/stores/operatingStore";

interface RadioReport {
  sender: string;
  band: string;
  mode: string;
  frequency: number;
  live: boolean;
  receivedAt: number;
}
const useMonitorStore = create<{ reports: Record<string, RadioReport> }>(
  () => ({ reports: {} }),
);
const STALE_MS = 15_000;

function dropStaleReports(
  reports: Record<string, RadioReport>,
  now: number,
): Record<string, RadioReport> | null {
  let dropped = false;
  const next: Record<string, RadioReport> = {};
  for (const [sender, report] of Object.entries(reports)) {
    if (now - report.receivedAt < STALE_MS) {
      next[sender] = report;
    } else {
      dropped = true;
    }
  }
  return dropped ? next : null;
}

function pruneStaleReports(now = Date.now()) {
  useMonitorStore.setState((s) => {
    const reports = dropStaleReports(s.reports, now);
    return reports ? { reports } : s;
  });
}

function newestLiveReport(
  reports: Record<string, RadioReport>,
  now: number,
): RadioReport | null {
  return (
    Object.values(reports)
      .filter((report) => report.live && now - report.receivedAt < STALE_MS)
      .sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null
  );
}

/** Publish observations only. Receiving a report never changes the operating store. */
export function useOperatingMonitorBridge() {
  useEffect(() => {
    const sender = crypto.randomUUID();
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("propulse-operating-monitor-v1");
    const publish = () => {
      const s = useOperatingStore.getState();
      const report: RadioReport = {
        sender,
        band: s.activeBand,
        mode: s.activeMode,
        frequency: s.activeFrequency,
        live: s.activeSource === "cat" || s.activeSource === "wsjtx",
        receivedAt: Date.now(),
      };
      useMonitorStore.setState((current) => ({
        reports: { ...current.reports, [sender]: report },
      }));
      channel?.postMessage(report);
    };
    if (channel)
      channel.onmessage = ({ data }) => {
        if (data?.request === true) {
          publish();
          return;
        }
        if (
          !data ||
          typeof data.sender !== "string" ||
          typeof data.band !== "string" ||
          typeof data.mode !== "string" ||
          !Number.isFinite(data.frequency) ||
          typeof data.live !== "boolean"
        )
          return;
        const report: RadioReport = { ...data, receivedAt: Date.now() };
        useMonitorStore.setState((s) => ({
          reports: { ...s.reports, [report.sender]: report },
        }));
      };
    publish();
    channel?.postMessage({ request: true });
    const unsubscribe = useOperatingStore.subscribe(publish);
    const timer = setInterval(() => {
      publish();
      pruneStaleReports();
    }, 5000);
    return () => {
      clearInterval(timer);
      unsubscribe();
      channel?.postMessage({
        sender,
        band: "",
        mode: "",
        frequency: 0,
        live: false,
      });
      channel?.close();
      useMonitorStore.setState((s) => {
        const reports = { ...s.reports };
        delete reports[sender];
        return { reports };
      });
    };
  }, []);
}

export function useOperatingMonitor() {
  const radio = useMonitorStore((s) => newestLiveReport(s.reports, Date.now()));
  // Date.now() in the selector only re-runs on a store write. Schedule a
  // prune at the live report's stale deadline so Follow radio (and every
  // other consumer) drops the last band/mode when the radio goes quiet
  // without another monitor update.
  useEffect(() => {
    if (!radio) return;
    const delay = Math.max(0, radio.receivedAt + STALE_MS - Date.now());
    const id = window.setTimeout(() => pruneStaleReports(), delay);
    return () => window.clearTimeout(id);
  }, [radio]);
  return radio;
}

/** Test helper: plant a report without the bridge's 5 s keepalive. */
export function ingestOperatingMonitorReportForTests(
  report: Pick<RadioReport, "sender" | "band" | "mode" | "frequency"> &
    Partial<Pick<RadioReport, "live" | "receivedAt">>,
) {
  const next: RadioReport = {
    live: true,
    receivedAt: Date.now(),
    ...report,
  };
  useMonitorStore.setState((s) => ({
    reports: { ...s.reports, [next.sender]: next },
  }));
}

export function resetOperatingMonitorForTests() {
  useMonitorStore.setState({ reports: {} });
}

export const OPERATING_MONITOR_STALE_MS = STALE_MS;
