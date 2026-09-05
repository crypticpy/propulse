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
      useMonitorStore.setState((s) => ({
        reports: Object.fromEntries(
          Object.entries(s.reports).filter(
            ([, report]) => Date.now() - report.receivedAt < STALE_MS,
          ),
        ),
      }));
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
  return useMonitorStore(
    (s) =>
      Object.values(s.reports)
        .filter(
          (report) => report.live && Date.now() - report.receivedAt < STALE_MS,
        )
        .sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null,
  );
}
