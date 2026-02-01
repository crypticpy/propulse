/**
 * LogUploadModal - Multi-service log upload modal
 * Supports uploading to eQSL, Club Log, and downloading ADIF for LoTW
 */

import { useState, useMemo, useCallback } from "react";
import type { LogEntry } from "@/lib/db/types";
import { Card } from "@/components/ui";
import { useUserStore } from "@/stores/userStore";
import {
  uploadEntriesToEqsl,
  uploadEntriesToClublog,
  type UploadResult,
} from "@/lib/api/logUpload";

export interface LogUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LogEntry[];
}

type UploadService = "eqsl" | "clublog" | "qrz" | "lotw";
type DateRange = "all" | "7days" | "30days" | "custom";

interface ServiceConfig {
  id: UploadService;
  name: string;
  description: string;
  configured: boolean;
  comingSoon?: boolean;
  exportOnly?: boolean;
}

interface UploadProgress {
  service: UploadService;
  status: "pending" | "uploading" | "success" | "error";
  message?: string;
  count?: number;
}

/**
 * Filter entries by date range
 */
function filterEntriesByDateRange(
  entries: LogEntry[],
  range: DateRange,
  customStart?: string,
  customEnd?: string,
): LogEntry[] {
  if (range === "all") return entries;

  const now = new Date();
  let startDate: Date;

  switch (range) {
    case "7days":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30days":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "custom": {
      if (!customStart || !customEnd) return entries;
      const start = new Date(customStart);
      const end = new Date(customEnd);
      return entries.filter((e) => {
        const entryDate = new Date(e.date);
        return entryDate >= start && entryDate <= end;
      });
    }
    default:
      return entries;
  }

  return entries.filter((e) => new Date(e.date) >= startDate);
}

/**
 * Generate ADIF content from log entries
 */
function generateADIF(entries: LogEntry[]): string {
  const header = `ADIF Export from Propulse
<PROGRAMID:8>Propulse
<PROGRAMVERSION:5>1.0.0
<EOH>

`;

  const records = entries.map((entry) => {
    const fields: string[] = [];

    // Required fields
    fields.push(`<CALL:${entry.callsign.length}>${entry.callsign}`);
    fields.push(`<BAND:${entry.band.length}>${entry.band}`);
    fields.push(`<MODE:${entry.mode.length}>${entry.mode}`);

    // Date and time
    const qsoDate = entry.date.replace(/-/g, "");
    fields.push(`<QSO_DATE:8>${qsoDate}`);
    const timeOn = entry.timeOn.replace(":", "");
    fields.push(`<TIME_ON:4>${timeOn}`);

    // Frequency
    const freqMHz = (entry.frequency / 1000).toFixed(6);
    fields.push(`<FREQ:${freqMHz.length}>${freqMHz}`);

    // Optional fields
    if (entry.rstSent) {
      fields.push(`<RST_SENT:${entry.rstSent.length}>${entry.rstSent}`);
    }
    if (entry.rstRcvd) {
      fields.push(`<RST_RCVD:${entry.rstRcvd.length}>${entry.rstRcvd}`);
    }
    if (entry.name) {
      fields.push(`<NAME:${entry.name.length}>${entry.name}`);
    }
    if (entry.grid) {
      fields.push(`<GRIDSQUARE:${entry.grid.length}>${entry.grid}`);
    }
    if (entry.qth) {
      fields.push(`<QTH:${entry.qth.length}>${entry.qth}`);
    }
    if (entry.notes) {
      fields.push(`<COMMENT:${entry.notes.length}>${entry.notes}`);
    }
    if (entry.stationCallsign) {
      fields.push(
        `<STATION_CALLSIGN:${entry.stationCallsign.length}>${entry.stationCallsign}`,
      );
    }
    if (entry.operatorCallsign) {
      fields.push(
        `<OPERATOR:${entry.operatorCallsign.length}>${entry.operatorCallsign}`,
      );
    }

    return fields.join(" ") + " <EOR>";
  });

  return header + records.join("\n\n");
}

export function LogUploadModal({
  isOpen,
  onClose,
  entries,
}: LogUploadModalProps) {
  const [selectedServices, setSelectedServices] = useState<Set<UploadService>>(
    new Set(),
  );
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress[]>([]);

  // Get credentials and station from store (reactive)
  const serviceCredentials = useUserStore((state) => state.serviceCredentials);
  const station = useUserStore((state) => state.station);

  // Check if a service is configured based on store credentials
  const isServiceConfigured = useCallback(
    (service: UploadService): boolean => {
      if (service === "lotw") return true; // LoTW is always available (export only)
      if (service === "qrz") return false; // QRZ not implemented yet

      switch (service) {
        case "eqsl":
          return Boolean(
            serviceCredentials?.eqsl?.username &&
            serviceCredentials?.eqsl?.password,
          );
        case "clublog":
          return Boolean(
            serviceCredentials?.clublog?.email &&
            serviceCredentials?.clublog?.password &&
            (serviceCredentials?.clublog?.callsign || station?.callsign),
          );
        default:
          return false;
      }
    },
    [serviceCredentials, station],
  );

  const services: ServiceConfig[] = useMemo(
    () => [
      {
        id: "eqsl",
        name: "eQSL",
        description: "Upload to eQSL.cc electronic QSL service",
        configured: isServiceConfigured("eqsl"),
      },
      {
        id: "clublog",
        name: "Club Log",
        description: "Upload to Club Log for DXCC tracking",
        configured: isServiceConfigured("clublog"),
      },
      {
        id: "qrz",
        name: "QRZ Logbook",
        description: "Sync with QRZ.com logbook",
        configured: isServiceConfigured("qrz"),
        comingSoon: true,
      },
      {
        id: "lotw",
        name: "LoTW",
        description: "Download ADIF for Logbook of The World",
        configured: true,
        exportOnly: true,
      },
    ],
    [isServiceConfigured],
  );

  const filteredEntries = useMemo(
    () => filterEntriesByDateRange(entries, dateRange, customStart, customEnd),
    [entries, dateRange, customStart, customEnd],
  );

  const handleServiceToggle = useCallback((serviceId: UploadService) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (filteredEntries.length === 0 || selectedServices.size === 0) return;

    setUploading(true);
    const servicesToUpload = Array.from(selectedServices).filter(
      (s) => s !== "lotw",
    );

    // Initialize progress for all services
    const initialProgress: UploadProgress[] = servicesToUpload.map((s) => ({
      service: s,
      status: "pending",
    }));
    setProgress(initialProgress);

    // Perform actual uploads in parallel
    const uploadPromises = servicesToUpload.map(async (service) => {
      // Update to uploading
      setProgress((prev) =>
        prev.map((p) =>
          p.service === service ? { ...p, status: "uploading" } : p,
        ),
      );

      let result: UploadResult;

      try {
        switch (service) {
          case "eqsl": {
            const creds = serviceCredentials?.eqsl;
            if (!creds?.username || !creds?.password) {
              result = {
                success: false,
                service: "eqsl",
                message:
                  "eQSL credentials not configured. Please add them in Settings.",
              };
            } else {
              result = await uploadEntriesToEqsl(filteredEntries, creds);
            }
            break;
          }
          case "clublog": {
            const creds = serviceCredentials?.clublog;
            const callsign = creds?.callsign || station?.callsign || "";
            if (!creds?.email || !creds?.password || !callsign) {
              result = {
                success: false,
                service: "clublog",
                message:
                  "Club Log credentials not configured. Please add them in Settings.",
              };
            } else {
              result = await uploadEntriesToClublog(filteredEntries, {
                ...creds,
                callsign,
              });
            }
            break;
          }
          default:
            result = {
              success: false,
              service: service,
              message: "Service not implemented",
            };
        }
      } catch (error) {
        result = {
          success: false,
          service: service,
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        };
      }

      setProgress((prev) =>
        prev.map((p) =>
          p.service === service
            ? {
                ...p,
                status: result.success ? "success" : "error",
                message: result.message,
                count: result.success ? result.recordsUploaded : undefined,
              }
            : p,
        ),
      );
    });

    await Promise.all(uploadPromises);
    setUploading(false);
  }, [filteredEntries, selectedServices, serviceCredentials, station]);

  const handleLoTWExport = useCallback(() => {
    const adif = generateADIF(filteredEntries);
    const blob = new Blob([adif], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `propulse-lotw-export-${new Date().toISOString().split("T")[0]}.adi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredEntries]);

  const handleClose = useCallback(() => {
    setSelectedServices(new Set());
    setProgress([]);
    setUploading(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const hasUploadServices = Array.from(selectedServices).some(
    (s) => s !== "lotw",
  );
  const hasLoTW = selectedServices.has("lotw");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-lg p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Upload Logs
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Date Range Filter */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Date Range
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {(
              [
                { value: "all", label: "All" },
                { value: "7days", label: "Last 7 days" },
                { value: "30days", label: "Last 30 days" },
                { value: "custom", label: "Custom" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    dateRange === opt.value
                      ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                      : "bg-nebula-blue text-gray-300 border border-white/10 hover:border-white/20"
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {dateRange === "custom" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">
                  Start
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-3 py-2 bg-nebula-blue border border-white/10 rounded-lg
                           text-white text-sm focus:outline-none focus:border-plasma-orange/50"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">End</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-nebula-blue border border-white/10 rounded-lg
                           text-white text-sm focus:outline-none focus:border-plasma-orange/50"
                />
              </div>
            </div>
          )}

          {/* Entry count */}
          <p className="mt-3 text-sm text-gray-400">
            <span className="font-medium text-white">
              {filteredEntries.length}
            </span>{" "}
            {filteredEntries.length === 1 ? "entry" : "entries"} to upload
          </p>
        </div>

        {/* Service Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Services
          </label>
          <div className="space-y-2">
            {services.map((service) => (
              <div
                key={service.id}
                className={`
                  p-3 rounded-lg border transition-colors
                  ${
                    service.comingSoon
                      ? "bg-white/5 border-white/5 opacity-50 cursor-not-allowed"
                      : selectedServices.has(service.id)
                        ? "bg-plasma-orange/10 border-plasma-orange/30"
                        : "bg-nebula-blue border-white/10 hover:border-white/20"
                  }
                `}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedServices.has(service.id)}
                    onChange={() => handleServiceToggle(service.id)}
                    disabled={service.comingSoon || uploading}
                    className="mt-0.5 w-4 h-4 rounded border-gray-500 bg-nebula-blue
                             text-plasma-orange focus:ring-plasma-orange focus:ring-offset-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {service.name}
                      </span>
                      {service.comingSoon && (
                        <span className="px-2 py-0.5 bg-gray-600/50 text-gray-400 rounded text-xs">
                          Coming Soon
                        </span>
                      )}
                      {service.exportOnly && (
                        <span className="px-2 py-0.5 bg-aurora-purple/20 text-aurora-purple rounded text-xs">
                          Export Only
                        </span>
                      )}
                      {!service.configured && !service.comingSoon && (
                        <span className="px-2 py-0.5 bg-caution-amber/20 text-caution-amber rounded text-xs">
                          Not Configured
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {service.description}
                    </p>
                    {!service.configured &&
                      !service.comingSoon &&
                      !service.exportOnly && (
                        <a
                          href="/settings"
                          className="inline-flex items-center gap-1 text-sm text-plasma-orange hover:underline mt-1"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          Configure in Settings
                        </a>
                      )}
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Progress Display */}
        {progress.length > 0 && (
          <div className="mb-6 space-y-2">
            {progress.map((p) => (
              <div
                key={p.service}
                className={`
                  p-3 rounded-lg border flex items-center gap-3
                  ${
                    p.status === "success"
                      ? "bg-signal-green/10 border-signal-green/30"
                      : p.status === "error"
                        ? "bg-alert-red/10 border-alert-red/30"
                        : "bg-nebula-blue border-white/10"
                  }
                `}
              >
                {/* Status icon */}
                {p.status === "uploading" && (
                  <svg
                    className="w-5 h-5 text-plasma-orange animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                {p.status === "success" && (
                  <svg
                    className="w-5 h-5 text-signal-green"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
                {p.status === "error" && (
                  <svg
                    className="w-5 h-5 text-alert-red"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
                {p.status === "pending" && (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-500" />
                )}

                <div className="flex-1">
                  <span className="font-medium text-white">
                    {services.find((s) => s.id === p.service)?.name}
                  </span>
                  {p.message && (
                    <p
                      className={`text-sm ${p.status === "error" ? "text-alert-red" : "text-gray-400"}`}
                    >
                      {p.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {hasLoTW && (
            <button
              onClick={handleLoTWExport}
              disabled={filteredEntries.length === 0}
              className="flex-1 px-4 py-2.5 bg-aurora-purple/20 border border-aurora-purple/50 rounded-lg
                       text-aurora-purple hover:bg-aurora-purple/30
                       transition-colors font-medium flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download ADIF
            </button>
          )}

          {hasUploadServices && (
            <button
              onClick={handleUpload}
              disabled={
                filteredEntries.length === 0 ||
                uploading ||
                progress.some((p) => p.status === "success")
              }
              className="flex-1 px-4 py-2.5 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                       text-plasma-orange hover:bg-plasma-orange/30
                       transition-colors font-medium flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Upload
                </>
              )}
            </button>
          )}

          {!hasUploadServices && !hasLoTW && (
            <button
              disabled
              className="flex-1 px-4 py-2.5 bg-nebula-blue border border-white/10 rounded-lg
                       text-gray-500 cursor-not-allowed font-medium"
            >
              Select a service
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default LogUploadModal;
