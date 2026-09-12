/**
 * QslSyncPanel -- Unified QSL service sync modal
 *
 * Centered modal with 3 tabs: LoTW | eQSL | QRZ
 * Each tab shows last sync time, upload/download buttons, and status.
 *
 * Props: { isOpen, onClose }
 */

import { useState, useCallback, useEffect, useId } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useQSOStore } from "@/stores/qsoStore";
import { useLotwSync } from "@/hooks/useLotwSync";
import { useEqslSync } from "@/hooks/useEqslSync";
import { useQrzSync } from "@/hooks/useQrzSync";
import { isUnlocked } from "@/lib/db/credentialStore";

// -- Types ------------------------------------------------------------------

interface QslSyncPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type SyncTab = "lotw" | "eqsl" | "qrz";

// -- Helpers ----------------------------------------------------------------

function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;

  if (isNaN(then)) return "Unknown";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(isoStr).toLocaleDateString();
}

// -- Spinner SVG ------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? "w-4 h-4"}`}
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
  );
}

// -- Tab button -------------------------------------------------------------

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        active
          ? "text-plasma-orange border-plasma-orange"
          : "text-su-muted border-transparent hover:text-su-text hover:border-su-line/50"
      }`}
    >
      {label}
    </button>
  );
}

// -- Upload icon ------------------------------------------------------------

function UploadIcon() {
  return (
    <svg
      className="w-5 h-5 shrink-0"
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

// -- Download icon ----------------------------------------------------------

function DownloadIcon() {
  return (
    <svg
      className="w-5 h-5 shrink-0"
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
  );
}

// -- Lock icon --------------------------------------------------------------

function LockIcon() {
  return (
    <svg
      className="w-4 h-4 text-caution-amber"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

// -- Credential lock warning ------------------------------------------------

function CredentialLockBanner() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-caution-amber/10 border border-caution-amber/20 rounded-lg">
      <LockIcon />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-caution-amber">Credential store is locked</p>
        <p className="text-xs text-su-muted mt-0.5">
          Unlock credentials in Settings to sync with QSL services.
        </p>
      </div>
    </div>
  );
}

// -- LoTW Tab ---------------------------------------------------------------

function LotwTab() {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const loadEntries = useQSOStore((s) => s.loadEntries);

  const {
    upload,
    download,
    uploading,
    downloading,
    lastSync,
    error,
    lastDownloadResult,
  } = useLotwSync();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const credUnlocked = isUnlocked();

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const handleUpload = useCallback(() => {
    const selected =
      selectedIds.size > 0
        ? entries.filter((e) => selectedIds.has(e.id))
        : entries;

    if (selected.length === 0) {
      setStatusMessage("No QSOs to export");
      return;
    }

    const result = upload(selected);
    setStatusMessage(result.message);
  }, [entries, selectedIds, upload]);

  const handleDownload = useCallback(async () => {
    const since = lastSync ? lastSync.slice(0, 10) : undefined;
    const result = await download(since);
    setStatusMessage(result.message);
    if (result.matchedCount > 0) {
      await loadEntries();
    }
  }, [lastSync, download, loadEntries]);

  const isProcessing = uploading || downloading;

  if (!credUnlocked) {
    return (
      <div className="p-4 space-y-4">
        <CredentialLockBanner />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Sync status */}
      <div className="flex items-center justify-between text-xs text-su-muted">
        <span>Last sync</span>
        <span className="font-mono">
          {lastSync ? formatRelativeTime(lastSync) : "Never"}
        </span>
      </div>

      {lastDownloadResult && lastDownloadResult.matchedCount > 0 && (
        <p className="text-xs text-signal-green">
          Last sync: {lastDownloadResult.matchedCount} QSO
          {lastDownloadResult.matchedCount !== 1 ? "s" : ""} confirmed
        </p>
      )}

      {/* Upload */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={isProcessing || entries.length === 0}
        className="w-full flex items-center gap-3 px-4 py-3 bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <UploadIcon />
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm text-su-text font-medium">Export for TQSL</p>
          <p className="text-xs text-su-muted">
            {selectedIds.size > 0
              ? `Generate ADIF for ${selectedIds.size} selected QSO${selectedIds.size !== 1 ? "s" : ""}`
              : `Generate ADIF for all ${entries.length} QSO${entries.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {uploading && <Spinner />}
      </button>

      {/* Download */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={isProcessing}
        className="w-full flex items-center gap-3 px-4 py-3 bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <DownloadIcon />
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm text-su-text font-medium">
            Download Confirmations
          </p>
          <p className="text-xs text-su-muted">
            Fetch QSL confirmations and update local log
          </p>
        </div>
        {downloading && <Spinner />}
      </button>

      {/* Status / Error */}
      {(statusMessage || error) && (
        <div
          className={`px-3 py-2 rounded-lg text-xs ${
            error
              ? "bg-alert-red/10 border border-alert-red/20 text-alert-red"
              : "bg-su-line/10 text-su-muted"
          }`}
        >
          {error || statusMessage}
        </div>
      )}
    </div>
  );
}

// -- eQSL Tab ---------------------------------------------------------------

function EqslTab() {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const loadEntries = useQSOStore((s) => s.loadEntries);

  const {
    upload,
    download,
    uploading,
    downloading,
    lastSync,
    error,
    lastDownloadResult,
  } = useEqslSync();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const credUnlocked = isUnlocked();

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const handleUpload = useCallback(async () => {
    const selected =
      selectedIds.size > 0
        ? entries.filter((e) => selectedIds.has(e.id))
        : entries;

    if (selected.length === 0) {
      setStatusMessage("No QSOs to upload");
      return;
    }

    const result = await upload(selected);
    setStatusMessage(result.message);
  }, [entries, selectedIds, upload]);

  const handleDownload = useCallback(async () => {
    const since = lastSync ? lastSync.slice(0, 10) : undefined;
    const result = await download(since);
    setStatusMessage(result.message);
    if (result.matchedCount > 0) {
      await loadEntries();
    }
  }, [lastSync, download, loadEntries]);

  const isProcessing = uploading || downloading;

  if (!credUnlocked) {
    return (
      <div className="p-4 space-y-4">
        <CredentialLockBanner />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Sync status */}
      <div className="flex items-center justify-between text-xs text-su-muted">
        <span>Last sync</span>
        <span className="font-mono">
          {lastSync ? formatRelativeTime(lastSync) : "Never"}
        </span>
      </div>

      {lastDownloadResult && lastDownloadResult.matchedCount > 0 && (
        <p className="text-xs text-signal-green">
          Last sync: {lastDownloadResult.matchedCount} QSO
          {lastDownloadResult.matchedCount !== 1 ? "s" : ""} confirmed
        </p>
      )}

      {/* Upload */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={isProcessing || entries.length === 0}
        className="w-full flex items-center gap-3 px-4 py-3 bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <UploadIcon />
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm text-su-text font-medium">Upload to eQSL</p>
          <p className="text-xs text-su-muted">
            {selectedIds.size > 0
              ? `Upload ${selectedIds.size} selected QSO${selectedIds.size !== 1 ? "s" : ""}`
              : `Upload all ${entries.length} QSO${entries.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {uploading && <Spinner />}
      </button>

      {/* Download */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={isProcessing}
        className="w-full flex items-center gap-3 px-4 py-3 bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <DownloadIcon />
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm text-su-text font-medium">Download Inbox</p>
          <p className="text-xs text-su-muted">
            Check eQSL inbox for new confirmations
          </p>
        </div>
        {downloading && <Spinner />}
      </button>

      {/* Status / Error */}
      {(statusMessage || error) && (
        <div
          className={`px-3 py-2 rounded-lg text-xs ${
            error
              ? "bg-alert-red/10 border border-alert-red/20 text-alert-red"
              : "bg-su-line/10 text-su-muted"
          }`}
        >
          {error || statusMessage}
        </div>
      )}
    </div>
  );
}

// -- QRZ Tab ----------------------------------------------------------------

function QrzTab() {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);

  const { upload, uploading, lastSync, error, lastUploadResult } = useQrzSync();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const credUnlocked = isUnlocked();

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const handleUpload = useCallback(async () => {
    const selected =
      selectedIds.size > 0
        ? entries.filter((e) => selectedIds.has(e.id))
        : entries;

    if (selected.length === 0) {
      setStatusMessage("No QSOs to upload");
      return;
    }

    const result = await upload(selected);
    setStatusMessage(result.message);
  }, [entries, selectedIds, upload]);

  if (!credUnlocked) {
    return (
      <div className="p-4 space-y-4">
        <CredentialLockBanner />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Sync status */}
      <div className="flex items-center justify-between text-xs text-su-muted">
        <span>Last sync</span>
        <span className="font-mono">
          {lastSync ? formatRelativeTime(lastSync) : "Never"}
        </span>
      </div>

      {lastUploadResult && lastUploadResult.success && (
        <p className="text-xs text-signal-green">
          Last upload:{" "}
          {lastUploadResult.recordsUploaded ?? lastUploadResult.qsoCount} QSO
          {(lastUploadResult.recordsUploaded ?? lastUploadResult.qsoCount) !== 1
            ? "s"
            : ""}{" "}
          sent
        </p>
      )}

      {/* Upload */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={uploading || entries.length === 0}
        className="w-full flex items-center gap-3 px-4 py-3 bg-su-line/10 hover:bg-su-line/20 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <UploadIcon />
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm text-su-text font-medium">Upload to QRZ.com</p>
          <p className="text-xs text-su-muted">
            {selectedIds.size > 0
              ? `Upload ${selectedIds.size} selected QSO${selectedIds.size !== 1 ? "s" : ""}`
              : `Upload all ${entries.length} QSO${entries.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {uploading && <Spinner />}
      </button>

      {/* Info: no download */}
      <div className="px-3 py-2 bg-su-line/10 rounded-lg text-xs text-su-muted">
        QRZ.com only supports log upload. Confirmation downloads are not
        available via the API.
      </div>

      {/* Status / Error */}
      {(statusMessage || error) && (
        <div
          className={`px-3 py-2 rounded-lg text-xs ${
            error
              ? "bg-alert-red/10 border border-alert-red/20 text-alert-red"
              : "bg-su-line/10 text-su-muted"
          }`}
        >
          {error || statusMessage}
        </div>
      )}
    </div>
  );
}

// -- Main Component ---------------------------------------------------------

export function QslSyncPanel({ isOpen, onClose }: QslSyncPanelProps) {
  const [activeTab, setActiveTab] = useState<SyncTab>("lotw");
  const titleId = useId();

  return (
    <AccessibleDialog
      open={isOpen}
      onClose={onClose}
      title="QSL Sync"
      chrome="bare"
      labelledBy={titleId}
      panelProps={{
        className:
          "w-full max-w-md bg-deep-space border border-su-line/50 rounded-2xl shadow-2xl overflow-hidden",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-su-line/40">
        <h2 id={titleId} className="text-base font-semibold text-su-text">
          QSL Sync
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-su-line/20 transition-colors text-su-muted hover:text-su-text"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
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

      {/* Tabs */}
      <div
        className="flex border-b border-su-line/40"
        role="tablist"
        aria-label="QSL services"
      >
        <TabButton
          label="LoTW"
          active={activeTab === "lotw"}
          onClick={() => setActiveTab("lotw")}
        />
        <TabButton
          label="eQSL"
          active={activeTab === "eqsl"}
          onClick={() => setActiveTab("eqsl")}
        />
        <TabButton
          label="QRZ"
          active={activeTab === "qrz"}
          onClick={() => setActiveTab("qrz")}
        />
      </div>

      {/* Tab Content */}
      <div role="tabpanel" className="max-h-[60vh] overflow-y-auto">
        {activeTab === "lotw" && <LotwTab />}
        {activeTab === "eqsl" && <EqslTab />}
        {activeTab === "qrz" && <QrzTab />}
      </div>
    </AccessibleDialog>
  );
}
