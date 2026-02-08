import { Suspense, useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "./Header";
import {
  AlertBanner,
  AlertToastContainer,
  AlertHistoryModal,
} from "@/components/alerts";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { UndoToast } from "@/components/ui/UndoToast";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ShortcutsHelpModal } from "@/components/ui/ShortcutsHelpModal";
import { PWAUpdatePrompt } from "@/components/ui/PWAUpdatePrompt";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { ContestVoiceManager } from "@/components/contest/ContestVoiceManager";
import { ContestGlobalHotkeys } from "@/components/contest/ContestGlobalHotkeys";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";

/**
 * Layout - Root layout component with header and background effects
 * Also manages the global solar alert system
 */
export function Layout() {
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Initialize solar alert monitoring
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts();

  // Initialize undo/redo keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  useUndoRedo({ enabled: true });

  // Initialize sync queue background processor
  useSyncQueue();
  // Keep rigStore synced with Bridge/Daemon CAT state
  useRigBridgeSync();

  // Global keyboard shortcuts (Ctrl+K, ?, Escape)
  useGlobalShortcuts({
    onOpenCommandPalette: useCallback(
      () => setShowCommandPalette((v) => !v),
      [],
    ),
    onShowShortcuts: useCallback(() => setShowShortcuts((v) => !v), []),
    onEscape: useCallback(() => {
      setShowCommandPalette(false);
      setShowShortcuts(false);
    }, []),
    enabled: true,
  });

  return (
    <div className="min-h-screen bg-cosmic-gradient">
      {/* Stars background */}
      <div className="fixed inset-0 bg-stars opacity-40 pointer-events-none" />

      {/* Orange glow effect */}
      <div className="fixed inset-0 bg-glow-orange pointer-events-none" />

      {/* Offline connectivity banner */}
      <OfflineIndicator />

      {/* Main content */}
      <div className="relative z-10">
        <ContestVoiceManager />
        <ContestGlobalHotkeys />

        <Header
          alertCount={activeAlerts.length}
          criticalAlertCount={criticalCount}
          onAlertClick={() => setShowAlertHistory(true)}
        />

        {/* Alert Banner - appears below header when alerts are active */}
        <AlertBanner
          alerts={activeAlerts}
          onDismiss={dismissAlert}
          onViewAll={() => setShowAlertHistory(true)}
        />

        <Suspense
          fallback={
            <div className="min-h-[50vh] flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </div>

      {/* Toast notifications - fixed position bottom-right */}
      <AlertToastContainer
        onDismiss={dismissAlert}
        onToastClick={() => setShowAlertHistory(true)}
      />

      {/* Alert History Modal */}
      <AlertHistoryModal
        isOpen={showAlertHistory}
        onClose={() => setShowAlertHistory(false)}
      />

      {/* Undo Toast - fixed position bottom-left */}
      <UndoToast />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onShowShortcuts={() => {
          setShowCommandPalette(false);
          setShowShortcuts(true);
        }}
        onOpenSettings={() => navigate("/settings")}
        onRefreshData={() => queryClient.invalidateQueries()}
      />

      {/* Keyboard Shortcuts Help (?) */}
      <ShortcutsHelpModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* PWA Update Prompt */}
      <PWAUpdatePrompt />
    </div>
  );
}
