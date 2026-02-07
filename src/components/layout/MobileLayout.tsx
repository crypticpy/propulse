import { Suspense, useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
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
import { PWAUpdatePrompt } from "@/components/ui/PWAUpdatePrompt";
import { PWAInstallPrompt } from "@/components/ui/PWAInstallPrompt";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";

// Matches BottomTabBar's visible tab order (Tools drawer sub-pages excluded)
const MOBILE_ROUTES = ["/", "/solar", "/map", "/log"];

/**
 * MobileLayout - Root layout for mobile viewports
 *
 * Renders a compact header, scrollable content area, and fixed bottom tab bar.
 * Mirrors the desktop Layout's alert/toast/settings overlay pattern.
 */
export function MobileLayout() {
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Initialize solar alert monitoring (mirrors Layout.tsx)
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts();

  // Initialize sync queue background processor
  useSyncQueue();

  // Pull-to-refresh for mobile
  const {
    pullProgress,
    isRefreshing,
    containerRef: pullRef,
  } = usePullToRefresh();

  // Swipe navigation between pages
  const { containerRef: swipeRef } = useSwipeNavigation(MOBILE_ROUTES);

  // Merge pull-to-refresh + swipe refs into one callback ref
  const mainRef = useCallback(
    (node: HTMLElement | null) => {
      pullRef(node);
      swipeRef(node);
    },
    [pullRef, swipeRef],
  );

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
        onSettingsClick={() => navigate("/settings")}
      />

      {/* Offline connectivity banner (below header, flow-positioned) */}
      <OfflineIndicator className="w-full bg-caution-amber/90 text-void-black text-xs py-1 text-center font-medium flex-shrink-0" />

      {/* Alert banner (below header, above content) */}
      <AlertBanner
        alerts={activeAlerts}
        onDismiss={dismissAlert}
        onViewAll={() => setShowAlertHistory(true)}
      />

      {/* Scrollable content area with pull-to-refresh */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto scroll-smooth-touch pb-[calc(56px+env(safe-area-inset-bottom,0px))]"
      >
        <PullToRefreshIndicator
          pullProgress={pullProgress}
          isRefreshing={isRefreshing}
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

      {/* PWA Install + Update Prompts */}
      <PWAInstallPrompt />
      <PWAUpdatePrompt />
    </div>
  );
}
