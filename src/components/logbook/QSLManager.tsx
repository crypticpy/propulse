/**
 * QSLManager - Comprehensive QSL management panel
 *
 * Provides a unified interface for managing QSL confirmations across
 * LoTW, Club Log, and eQSL services. Displays connection status,
 * sync controls, statistics, and recent activity.
 */

import { useState, useMemo, useCallback } from "react";
import { Card } from "@/components/ui";
import { useUserStore, type ServiceCredentials } from "@/stores/userStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QSLManagerProps {
  className?: string;
}

type ServiceId = "lotw" | "clublog" | "eqsl";

type ServiceStatus = "synced" | "pending" | "error" | "not_configured";

interface ServiceInfo {
  id: ServiceId;
  name: string;
  description: string;
  status: ServiceStatus;
  lastSync: string | null;
  pendingUploads: number;
  totalUploaded: number;
  totalConfirmed: number;
}

interface ActivityEvent {
  id: string;
  service: ServiceId;
  action: string;
  message: string;
  timestamp: string;
  success: boolean;
}

interface QSLStats {
  totalQSOs: number;
  totalUploaded: number;
  totalConfirmed: number;
  byService: Record<ServiceId, { uploaded: number; confirmed: number }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStatusColor(status: ServiceStatus): string {
  switch (status) {
    case "synced":
      return "text-signal-green";
    case "pending":
      return "text-caution-amber";
    case "error":
      return "text-alert-red";
    case "not_configured":
      return "text-gray-500";
  }
}

function getStatusBgColor(status: ServiceStatus): string {
  switch (status) {
    case "synced":
      return "bg-signal-green/20 border-signal-green/30";
    case "pending":
      return "bg-caution-amber/20 border-caution-amber/30";
    case "error":
      return "bg-alert-red/20 border-alert-red/30";
    case "not_configured":
      return "bg-white/5 border-white/10";
  }
}

function getStatusLabel(status: ServiceStatus): string {
  switch (status) {
    case "synced":
      return "Synced";
    case "pending":
      return "Pending";
    case "error":
      return "Error";
    case "not_configured":
      return "Not Configured";
  }
}

function getStatusDotColor(status: ServiceStatus): string {
  switch (status) {
    case "synced":
      return "bg-signal-green";
    case "pending":
      return "bg-caution-amber";
    case "error":
      return "bg-alert-red";
    case "not_configured":
      return "bg-gray-500";
  }
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isServiceConfigured(
  serviceId: ServiceId,
  credentials: ServiceCredentials,
): boolean {
  switch (serviceId) {
    case "lotw":
      return Boolean(credentials.lotw?.enabled);
    case "clublog":
      return Boolean(
        credentials.clublog?.email && credentials.clublog?.password,
      );
    case "eqsl":
      return Boolean(credentials.eqsl?.username && credentials.eqsl?.password);
    default:
      return false;
  }
}

// ─── Service Icons ──────────────────────────────────────────────────────────

function LoTWIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function ClubLogIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function EqslIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function SyncIcon({
  className = "w-4 h-4",
  spinning = false,
}: {
  className?: string;
  spinning?: boolean;
}) {
  return (
    <svg
      className={`${className} ${spinning ? "animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function UploadIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

// ─── Service Card ───────────────────────────────────────────────────────────

function ServiceCard({
  service,
  onSync,
  onUpload,
  syncing,
}: {
  service: ServiceInfo;
  onSync: (id: ServiceId) => void;
  onUpload: (id: ServiceId) => void;
  syncing: boolean;
}) {
  const Icon =
    service.id === "lotw"
      ? LoTWIcon
      : service.id === "clublog"
        ? ClubLogIcon
        : EqslIcon;
  const accentColor =
    service.id === "lotw"
      ? "text-aurora-purple"
      : service.id === "clublog"
        ? "text-cosmic-cyan"
        : "text-plasma-orange";

  return (
    <Card className="p-4">
      {/* Service header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${accentColor}`} />
          <h4 className="font-orbitron text-sm font-bold text-white">
            {service.name}
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${getStatusDotColor(service.status)}`}
          />
          <span
            className={`text-xs font-medium ${getStatusColor(service.status)}`}
          >
            {getStatusLabel(service.status)}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 mb-3">{service.description}</p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 bg-nebula-blue rounded-lg">
          <p className="text-sm font-bold text-white">
            {service.totalUploaded}
          </p>
          <p className="text-[10px] text-gray-400">Uploaded</p>
        </div>
        <div className="text-center p-2 bg-nebula-blue rounded-lg">
          <p className="text-sm font-bold text-signal-green">
            {service.totalConfirmed}
          </p>
          <p className="text-[10px] text-gray-400">Confirmed</p>
        </div>
        <div className="text-center p-2 bg-nebula-blue rounded-lg">
          <p className="text-sm font-bold text-caution-amber">
            {service.pendingUploads}
          </p>
          <p className="text-[10px] text-gray-400">Pending</p>
        </div>
      </div>

      {/* Last sync */}
      <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
        <span>Last sync:</span>
        <span className="font-mono">{formatTimestamp(service.lastSync)}</span>
      </div>

      {/* Action buttons */}
      {service.status !== "not_configured" ? (
        <div className="flex gap-2">
          <button
            onClick={() => onSync(service.id)}
            disabled={syncing}
            className={`
              flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-medium transition-colors
              bg-white/5 border border-white/10 text-gray-300
              hover:bg-white/10 hover:border-white/20
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <SyncIcon className="w-3.5 h-3.5" spinning={syncing} />
            Sync
          </button>
          <button
            onClick={() => onUpload(service.id)}
            disabled={syncing || service.pendingUploads === 0}
            className={`
              flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-medium transition-colors
              bg-white/5 border border-white/10 text-gray-300
              hover:bg-white/10 hover:border-white/20
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <UploadIcon className="w-3.5 h-3.5" />
            Upload
          </button>
        </div>
      ) : (
        <a
          href="/settings"
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg
                     text-xs font-medium transition-colors
                     bg-plasma-orange/10 border border-plasma-orange/30 text-plasma-orange
                     hover:bg-plasma-orange/20"
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
    </Card>
  );
}

// ─── Activity Log Entry ─────────────────────────────────────────────────────

function ActivityLogEntry({ event }: { event: ActivityEvent }) {
  const serviceLabel =
    event.service === "lotw"
      ? "LoTW"
      : event.service === "clublog"
        ? "Club Log"
        : "eQSL";

  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-white/5 last:border-0">
      {/* Status dot */}
      <div
        className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          event.success ? "bg-signal-green" : "bg-alert-red"
        }`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">{serviceLabel}</span>
          <span className="text-[10px] text-gray-500">{event.action}</span>
        </div>
        <p className="text-xs text-gray-400 truncate">{event.message}</p>
      </div>

      <span className="text-[10px] text-gray-500 flex-shrink-0 font-mono">
        {formatTimestamp(event.timestamp)}
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function QSLManager({ className = "" }: QSLManagerProps) {
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingService, setSyncingService] = useState<ServiceId | null>(null);

  // Get credentials from store to determine which services are configured
  const serviceCredentials = useUserStore((s) => s.serviceCredentials);

  // Build service info based on configuration state
  // Note: Actual sync data would come from a dedicated sync store in a
  // future iteration. For now we show the UI structure with configuration status.
  const services: ServiceInfo[] = useMemo(() => {
    const lotwConfigured = isServiceConfigured("lotw", serviceCredentials);
    const clublogConfigured = isServiceConfigured(
      "clublog",
      serviceCredentials,
    );
    const eqslConfigured = isServiceConfigured("eqsl", serviceCredentials);

    return [
      {
        id: "lotw" as ServiceId,
        name: "LoTW",
        description:
          "ARRL Logbook of The World - trusted QSL confirmation service",
        status: lotwConfigured ? "synced" : "not_configured",
        lastSync: lotwConfigured ? new Date().toISOString() : null,
        pendingUploads: 0,
        totalUploaded: 0,
        totalConfirmed: 0,
      },
      {
        id: "clublog" as ServiceId,
        name: "Club Log",
        description: "DXCC tracking and analysis with live leaderboards",
        status: clublogConfigured ? "synced" : "not_configured",
        lastSync: clublogConfigured ? new Date().toISOString() : null,
        pendingUploads: 0,
        totalUploaded: 0,
        totalConfirmed: 0,
      },
      {
        id: "eqsl" as ServiceId,
        name: "eQSL",
        description: "Electronic QSL card exchange service",
        status: eqslConfigured ? "synced" : "not_configured",
        lastSync: eqslConfigured ? new Date().toISOString() : null,
        pendingUploads: 0,
        totalUploaded: 0,
        totalConfirmed: 0,
      },
    ];
  }, [serviceCredentials]);

  // Compute aggregate statistics
  const stats: QSLStats = useMemo(() => {
    const byService: Record<
      ServiceId,
      { uploaded: number; confirmed: number }
    > = {
      lotw: { uploaded: 0, confirmed: 0 },
      clublog: { uploaded: 0, confirmed: 0 },
      eqsl: { uploaded: 0, confirmed: 0 },
    };

    for (const svc of services) {
      byService[svc.id] = {
        uploaded: svc.totalUploaded,
        confirmed: svc.totalConfirmed,
      };
    }

    return {
      totalQSOs: 0,
      totalUploaded: services.reduce((s, svc) => s + svc.totalUploaded, 0),
      totalConfirmed: services.reduce((s, svc) => s + svc.totalConfirmed, 0),
      byService,
    };
  }, [services]);

  // Recent activity log (placeholder — would be populated from a sync history store)
  const [activityLog] = useState<ActivityEvent[]>([]);

  // Count of configured services
  const configuredCount = useMemo(
    () => services.filter((s) => s.status !== "not_configured").length,
    [services],
  );

  // ── Handlers ──────────────────────────────────────────────────────────

  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSyncService = useCallback(
    async (id: ServiceId) => {
      setSyncError(null);
      const svc = services.find((s) => s.id === id);
      if (!svc || svc.status === "not_configured") {
        setSyncError(
          `${id} is not configured. Set up credentials in Settings.`,
        );
        return;
      }
      setSyncingService(id);
      try {
        switch (id) {
          case "lotw":
            // LoTW sync requires credential vault access (passphrase-gated).
            // Use Settings > QSL Services > LoTW to initiate authenticated sync.
            // The downloadFromLoTW/syncLoTWConfirmations APIs need credentials
            // that are stored in the encrypted credential vault.
            setSyncError(
              "LoTW sync is available via Settings > QSL Services after passphrase verification.",
            );
            break;
          case "eqsl": {
            const creds = serviceCredentials?.eqsl;
            if (!creds?.username || !creds?.password) {
              setSyncError("eQSL credentials missing. Configure in Settings.");
              break;
            }
            // Fetch eQSL inbox to check for new confirmations
            const resp = await fetch("/api/log/eqsl-inbox", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: creds.username,
                password: creds.password,
              }),
            });
            if (!resp.ok) throw new Error(`eQSL sync failed: ${resp.status}`);
            const data = await resp.json();
            if (data.error) {
              setSyncError(data.error);
            } else if (data.adif) {
              const recordCount = (data.adif.match(/<eor>/gi) || []).length;
              setSyncError(
                recordCount > 0
                  ? `eQSL: ${recordCount} confirmation${recordCount !== 1 ? "s" : ""} received`
                  : data.message || "eQSL sync complete — no new records",
              );
            } else {
              setSyncError(
                data.message || "eQSL sync complete — no new records",
              );
            }
            break;
          }
          case "clublog":
            // Club Log API integration not yet available
            setSyncError("Club Log sync is not yet available.");
            break;
        }
      } catch (err) {
        setSyncError(
          err instanceof Error ? err.message : `Sync failed for ${id}`,
        );
      } finally {
        setSyncingService(null);
      }
    },
    [services, serviceCredentials],
  );

  const handleSyncAll = useCallback(async () => {
    setSyncingAll(true);
    setSyncError(null);
    const configured = services.filter((s) => s.status !== "not_configured");
    for (const svc of configured) {
      await handleSyncService(svc.id);
    }
    setSyncingAll(false);
  }, [services, handleSyncService]);

  const handleUploadService = useCallback(
    async (id: ServiceId) => {
      setSyncError(null);
      const svc = services.find((s) => s.id === id);
      if (!svc || svc.status === "not_configured") {
        setSyncError(`${id} is not configured.`);
        return;
      }
      setSyncingService(id);
      try {
        switch (id) {
          case "lotw":
            // LoTW upload uses ADIF export, handled via LogUploadModal
            setSyncError(
              "Use the Upload button in your Logbook to export ADIF for LoTW.",
            );
            break;
          case "eqsl": {
            const creds = serviceCredentials?.eqsl;
            if (!creds?.username || !creds?.password) {
              setSyncError("eQSL credentials missing.");
              break;
            }
            // eQSL upload handled via LogUploadModal's upload flow
            break;
          }
          case "clublog":
            setSyncError("Club Log upload is not yet available.");
            break;
        }
      } catch (err) {
        setSyncError(
          err instanceof Error ? err.message : `Upload failed for ${id}`,
        );
      } finally {
        setSyncingService(null);
      }
    },
    [services, serviceCredentials],
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Sync status message */}
      {syncError && (
        <div className="rounded-lg bg-caution-amber/10 border border-caution-amber/30 px-3 py-2 text-xs text-caution-amber">
          {syncError}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-orbitron text-lg font-bold text-white flex items-center gap-2">
            <svg
              className="w-5 h-5 text-plasma-orange"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            QSL Manager
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {configuredCount} of 3 services configured
          </p>
        </div>

        {/* Global actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSyncAll}
            disabled={syncingAll || configuredCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       transition-colors bg-white/5 border border-white/10 text-gray-300
                       hover:bg-white/10 hover:border-white/20
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SyncIcon className="w-3.5 h-3.5" spinning={syncingAll} />
            Sync All
          </button>
          <button
            onClick={handleSyncAll}
            disabled={syncingAll || configuredCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       transition-colors bg-plasma-orange/10 border border-plasma-orange/30
                       text-plasma-orange hover:bg-plasma-orange/20
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UploadIcon className="w-3.5 h-3.5" />
            Upload Pending
          </button>
        </div>
      </div>

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {services.map((service) => (
          <ServiceCard
            key={service.id}
            service={service}
            onSync={handleSyncService}
            onUpload={handleUploadService}
            syncing={syncingAll || syncingService === service.id}
          />
        ))}
      </div>

      {/* Statistics Section */}
      <Card className="p-4">
        <h3 className="font-orbitron text-sm font-bold text-white mb-3 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-cosmic-cyan"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          QSL Statistics
        </h3>

        {/* Aggregate stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-xl font-bold text-white">{stats.totalQSOs}</p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">
              Total QSOs
            </p>
          </div>
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-xl font-bold text-plasma-orange">
              {stats.totalUploaded}
            </p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">
              Uploaded
            </p>
          </div>
          <div className="text-center p-3 bg-nebula-blue rounded-lg">
            <p className="text-xl font-bold text-signal-green">
              {stats.totalConfirmed}
            </p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">
              Confirmed
            </p>
          </div>
        </div>

        {/* Per-service breakdown */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs">
                <th className="text-left py-1.5">Service</th>
                <th className="text-right py-1.5">Uploaded</th>
                <th className="text-right py-1.5">Confirmed</th>
                <th className="text-right py-1.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {services.map((svc) => (
                <tr key={svc.id}>
                  <td className="py-2 font-medium text-white">{svc.name}</td>
                  <td className="py-2 text-right text-plasma-orange font-mono">
                    {svc.totalUploaded}
                  </td>
                  <td className="py-2 text-right text-signal-green font-mono">
                    {svc.totalConfirmed}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBgColor(svc.status)} ${getStatusColor(svc.status)}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(svc.status)}`}
                      />
                      {getStatusLabel(svc.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent Activity Log */}
      <Card className="p-4">
        <h3 className="font-orbitron text-sm font-bold text-white mb-3 flex items-center gap-2">
          <svg
            className="w-4 h-4 text-aurora-purple"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Recent Activity
        </h3>

        {activityLog.length > 0 ? (
          <div className="max-h-60 overflow-y-auto">
            {activityLog.slice(0, 10).map((event) => (
              <ActivityLogEntry key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <svg
              className="w-8 h-8 text-gray-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-gray-500">No recent activity</p>
            <p className="text-xs text-gray-600 mt-1">
              Sync or upload QSOs to see activity here
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

export default QSLManager;
