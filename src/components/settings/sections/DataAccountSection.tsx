import { useState, useRef, useCallback } from "react";
import {
  downloadSettingsBackup,
  readBackupFile,
  importSettings,
  getBackupSummary,
  type SettingsBackup,
  type ValidationResult,
} from "@/lib/utils/settingsBackup";
import { useLogbook } from "@/hooks/useLogbook";
import { deleteDatabase } from "@/lib/db/index";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore, selectIsAuthenticated } from "@/stores/authStore";
import { useAuthUIStore } from "@/stores/authUIStore";
import { useSyncStatus } from "@/hooks/useSyncStatus";

/** Format an ISO timestamp for display in the sync status line */
function formatSyncTime(ts: string | null): string {
  if (!ts) return "never";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

/**
 * DataAccountSection - Export/import settings, export logbook, clear data, and about info.
 * Extracted from the "backup" tab of SettingsModal for the standalone Settings page.
 */
export function DataAccountSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupStatus, setBackupStatus] = useState<{
    type: "success" | "error" | "warning" | "info";
    message: string;
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    backup: SettingsBackup;
    validation: ValidationResult;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const { entries, exportADIF } = useLogbook();

  // ── Export settings ──────────────────────────────────────────────
  const handleExport = useCallback(() => {
    try {
      downloadSettingsBackup();
      setBackupStatus({
        type: "success",
        message: "Settings exported successfully. Check your downloads folder.",
      });
    } catch (e) {
      setBackupStatus({
        type: "error",
        message: `Export failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    }
  }, []);

  // ── File selection for import ────────────────────────────────────
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setBackupStatus(null);
      setPendingImport(null);

      const result = await readBackupFile(file);

      if ("error" in result) {
        setBackupStatus({ type: "error", message: result.error });
        return;
      }

      const summary = getBackupSummary(result.data);
      setPendingImport({
        backup: result.data,
        validation: result.validation,
      });

      if (result.validation.warnings?.length) {
        setBackupStatus({
          type: "warning",
          message: result.validation.warnings.join(" "),
        });
      } else {
        setBackupStatus({ type: "info", message: summary });
      }
    },
    [],
  );

  // ── Confirm import ───────────────────────────────────────────────
  const handleConfirmImport = useCallback(() => {
    if (!pendingImport) return;

    setIsImporting(true);
    const result = importSettings(pendingImport.backup);

    if (result.success) {
      const importedSections = Object.entries(result.imported)
        .filter(([, imported]) => imported)
        .map(([section]) => section)
        .join(", ");
      setBackupStatus({
        type: "success",
        message: `Settings imported successfully. Imported: ${importedSections}`,
      });
    } else {
      setBackupStatus({
        type: "error",
        message: result.error || "Import failed",
      });
    }

    setPendingImport(null);
    setIsImporting(false);
  }, [pendingImport]);

  // ── Cancel import ────────────────────────────────────────────────
  const handleCancelImport = useCallback(() => {
    setPendingImport(null);
    setBackupStatus(null);
  }, []);

  // ── Export logbook as ADIF ───────────────────────────────────────
  const handleExportADIF = useCallback(() => {
    try {
      const adif = exportADIF();
      const blob = new Blob([adif], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `propulse-log-${new Date().toISOString().split("T")[0]}.adi`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatus({
        type: "success",
        message: `Exported ${entries.length} QSO${entries.length !== 1 ? "s" : ""} to ADIF.`,
      });
    } catch (e) {
      setBackupStatus({
        type: "error",
        message: `ADIF export failed: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    }
  }, [exportADIF, entries.length]);

  // ── Clear all local data ─────────────────────────────────────────
  const handleClearData = useCallback(async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }

    setIsClearing(true);
    try {
      // Clear localStorage
      localStorage.clear();
      // Delete IndexedDB
      await deleteDatabase();
      setBackupStatus({
        type: "success",
        message: "All local data cleared. The page will reload.",
      });
      // Reload after a short delay so the user sees the message
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setBackupStatus({
        type: "error",
        message: `Failed to clear data: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
      setIsClearing(false);
      setClearConfirm(false);
    }
  }, [clearConfirm]);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const openAuthModal = useAuthUIStore((s) => s.openAuthModal);
  const syncStatus = useSyncStatus();

  return (
    <div className="space-y-6">
      {/* ── 0. Account ────────────────────────────────────────── */}
      {isSupabaseConfigured && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Account
          </h3>

          {isAuthenticated ? (
            <div className="space-y-4">
              {/* User info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-plasma-orange/20 flex items-center justify-center text-plasma-orange font-bold">
                  {(user?.email?.[0] ?? "U").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">
                    {user?.email}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        syncStatus.state === "idle"
                          ? "text-signal-green"
                          : syncStatus.state === "syncing"
                            ? "text-plasma-orange"
                            : syncStatus.state === "offline"
                              ? "text-gray-500"
                              : "text-alert-red"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          syncStatus.state === "idle"
                            ? "bg-signal-green"
                            : syncStatus.state === "syncing"
                              ? "bg-plasma-orange animate-pulse"
                              : syncStatus.state === "offline"
                                ? "bg-gray-500"
                                : "bg-alert-red"
                        }`}
                      />
                      {syncStatus.state === "idle"
                        ? "Synced"
                        : syncStatus.state === "syncing"
                          ? "Syncing..."
                          : syncStatus.state === "offline"
                            ? "Offline"
                            : "Sync error"}
                    </span>
                    {syncStatus.pendingCount > 0 && (
                      <span className="text-xs text-gray-500">
                        ({syncStatus.pendingCount} pending)
                      </span>
                    )}
                  </div>
                  {syncStatus.lastSyncAt && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      Last sync: {formatSyncTime(syncStatus.lastSyncAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Sync error */}
              {syncStatus.error && (
                <div className="p-3 bg-alert-red/10 border border-alert-red/20 rounded-lg">
                  <p className="text-xs text-alert-red">{syncStatus.error}</p>
                </div>
              )}

              {/* Sign out */}
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                Sign in to sync your settings, logbook, and profile to the
                cloud. Everything works offline — an account just adds cloud
                backup and social features.
              </p>
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30 transition-colors"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      )}

      {isSupabaseConfigured && <div className="border-t border-white/10" />}

      {/* ── 1. Export / Import Settings ─────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Export / Import Settings
        </h3>
        <p className="text-sm text-gray-400">
          Download all your settings as a JSON file. This includes your station
          profile, preferences, saved targets, watches, pins, and filter
          settings.
        </p>

        {/* Export button */}
        <button
          type="button"
          onClick={handleExport}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                     bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30
                     border border-plasma-orange/30 transition-colors"
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
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export Settings
        </button>

        {/* Import: hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Select backup file to import"
        />

        {/* Import button (shown when no pending import) */}
        {!pendingImport && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-nebula-blue border border-white/20 text-gray-200
                       hover:bg-white/10 hover:border-white/30 transition-colors"
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
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import Settings
          </button>
        )}

        {/* Pending import confirmation */}
        {pendingImport && (
          <div className="p-4 bg-deep-space border border-white/10 rounded-lg space-y-4">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-plasma-orange flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-white">
                  Ready to import settings
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {getBackupSummary(pendingImport.backup)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  This will replace your current settings. This action cannot be
                  undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium
                           bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30
                           border border-plasma-orange/30 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? "Importing..." : "Confirm Import"}
              </button>
              <button
                type="button"
                onClick={handleCancelImport}
                disabled={isImporting}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium
                           bg-white/5 border border-white/10 text-gray-300
                           hover:bg-white/10 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Export Logbook ───────────────────────────────────── */}
      <div className="border-t border-white/10 pt-6 mt-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Export Logbook
          </h3>
          <p className="text-sm text-gray-400">
            Download your logbook as an ADIF file compatible with other amateur
            radio logging software.
          </p>
          <button
            type="button"
            onClick={handleExportADIF}
            disabled={entries.length === 0}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                       ${
                         entries.length > 0
                           ? "bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 border border-plasma-orange/30"
                           : "bg-nebula-blue border border-white/10 text-gray-500 cursor-not-allowed"
                       }`}
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
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export ADIF ({entries.length} QSO{entries.length !== 1 ? "s" : ""})
          </button>
        </div>
      </div>

      {/* ── 3. Clear Local Data ─────────────────────────────────── */}
      <div className="border-t border-white/10 pt-6 mt-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Clear Local Data
          </h3>
          <p className="text-sm text-gray-400">
            Permanently delete all locally stored data including settings,
            logbook entries, pins, and cached information. This cannot be
            undone.
          </p>
          <div className="p-3 bg-alert-red/5 border border-alert-red/20 rounded-lg">
            <p className="text-xs text-alert-red/80">
              <strong className="text-alert-red">Warning:</strong> This is a
              destructive action. Export your settings and logbook first if you
              want to keep them.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearData}
            disabled={isClearing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-alert-red/20 text-alert-red hover:bg-alert-red/30
                       border border-alert-red/30 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            {isClearing
              ? "Clearing..."
              : clearConfirm
                ? "Are you sure? Click again to confirm"
                : "Clear All Local Data"}
          </button>
          {clearConfirm && !isClearing && (
            <button
              type="button"
              onClick={() => setClearConfirm(false)}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium
                         bg-white/5 border border-white/10 text-gray-300
                         hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── 4. About ────────────────────────────────────────────── */}
      <div className="border-t border-white/10 pt-6 mt-6">
        <div className="space-y-2 text-center">
          <h3 className="text-lg font-orbitron font-bold text-gradient-orange">
            Propulse
          </h3>
          <p className="text-sm text-gray-400">
            Ham radio propagation dashboard
          </p>
          <p className="text-xs text-gray-500">Version 0.11.0</p>
        </div>
      </div>

      {/* ── Status message ──────────────────────────────────────── */}
      {backupStatus && (
        <div
          className={`p-4 rounded-lg border ${
            backupStatus.type === "success"
              ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
              : backupStatus.type === "error"
                ? "bg-alert-red/10 border-alert-red/30 text-alert-red"
                : backupStatus.type === "warning"
                  ? "bg-caution-amber/10 border-caution-amber/30 text-caution-amber"
                  : "bg-white/5 border-white/10 text-gray-300"
          }`}
        >
          <div className="flex items-start gap-3">
            {backupStatus.type === "success" && (
              <svg
                className="w-5 h-5 flex-shrink-0"
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
            {backupStatus.type === "error" && (
              <svg
                className="w-5 h-5 flex-shrink-0"
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
            {backupStatus.type === "warning" && (
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            {backupStatus.type === "info" && (
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
            <p className="text-sm">{backupStatus.message}</p>
          </div>
        </div>
      )}

      {/* Backup note */}
      <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Note:</strong> Backup files include
          version information for compatibility. You can safely import backups
          from older versions of Propulse.
        </p>
      </div>
    </div>
  );
}
