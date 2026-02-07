import { Suspense, useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MobileHeader } from "./MobileHeader";
import { BottomTabBar } from "./BottomTabBar";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import {
  AlertBanner,
  AlertToastContainer,
  AlertHistoryModal,
} from "@/components/alerts";
import { UndoToast } from "@/components/ui/UndoToast";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ShortcutsHelpModal } from "@/components/ui/ShortcutsHelpModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useSyncQueue } from "@/hooks/useSyncQueue";

/**
 * MobileLayout - Root layout for mobile viewports
 *
 * Renders a compact header, scrollable content area, and fixed bottom tab bar.
 * Mirrors the desktop Layout's alert/toast/settings overlay pattern.
 */
export function MobileLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const queryClient = useQueryClient();

  // Initialize solar alert monitoring (mirrors Layout.tsx)
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts();

  // Initialize sync queue background processor
  useSyncQueue();

  // Initialize undo/redo keyboard shortcuts
  useUndoRedo({ enabled: true });

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
    <div className="min-h-[100dvh] flex flex-col bg-void-black">
      {/* Fixed mobile header */}
      <MobileHeader
        alertCount={activeAlerts.length}
        criticalAlertCount={criticalCount}
        onAlertClick={() => setShowAlertHistory(true)}
        onSettingsClick={() => setShowSettings(true)}
      />

      {/* Alert banner (below header, above content) */}
      <AlertBanner
        alerts={activeAlerts}
        onDismiss={dismissAlert}
        onViewAll={() => setShowAlertHistory(true)}
      />

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto scroll-smooth-touch pb-[calc(56px+env(safe-area-inset-bottom,0px))]">
        <Suspense
          fallback={
            <div className="min-h-[50vh] flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      {/* Fixed bottom tab bar */}
      <BottomTabBar />

      {/* Toast notifications */}
      <AlertToastContainer
        onDismiss={dismissAlert}
        onToastClick={() => setShowAlertHistory(true)}
      />

      {/* Alert History Modal */}
      <AlertHistoryModal
        isOpen={showAlertHistory}
        onClose={() => setShowAlertHistory(false)}
      />

      {/* Undo Toast */}
      <UndoToast />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onShowShortcuts={() => {
          setShowCommandPalette(false);
          setShowShortcuts(true);
        }}
        onOpenSettings={() => setShowSettings(true)}
        onRefreshData={() => queryClient.invalidateQueries()}
      />

      {/* Keyboard Shortcuts Help (?) */}
      <ShortcutsHelpModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}
