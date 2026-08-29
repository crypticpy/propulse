import { Suspense, useState, useCallback, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MobileHeader } from "./MobileHeader";
import { BottomTabBar } from "./BottomTabBar";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { useSatelliteAlerts } from "@/hooks/useSatelliteAlerts";
import { useBandOpeningFeed } from "@/hooks/useBandOpeningFeed";
import {
  AlertBanner,
  AlertToastContainer,
  AlertHistoryModal,
  SpotAlertToastContainer,
} from "@/components/alerts";
import { useSpotAlerts } from "@/hooks/useSpotAlerts";
import { UndoToast } from "@/components/ui/UndoToast";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ShortcutsHelpModal } from "@/components/ui/ShortcutsHelpModal";
import { PWAUpdatePrompt } from "@/components/ui/PWAUpdatePrompt";
import { AuthModal } from "@/components/auth";
import { PWAInstallPrompt } from "@/components/ui/PWAInstallPrompt";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";
import { useOperatingSync } from "@/hooks/useOperatingSync";
import { useConnectivityTier } from "@/hooks/useConnectivityTier";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { BandSuggestToast } from "@/components/operating/BandSuggestToast";
import { useSettingsStore } from "@/stores/settingsStore";
import { AlertGlowOverlay } from "@/components/alerts/AlertGlowOverlay";
import { EmergencyTickerBar } from "@/components/alerts/EmergencyTickerBar";

// Matches BottomTabBar's visible tab order (Tools drawer sub-pages excluded)
const MOBILE_ROUTES = [
  "/",
  "/solar",
  "/map",
  "/atmos",
  "/log",
  "/profile",
  "/shack",
  "/nets",
];

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
  const location = useLocation();

  // Initialize solar alert monitoring (mirrors Layout.tsx)
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts({
    enabled: location.pathname !== "/solar",
  });

  // Feed live spots to the band opening detector (runs on all routes)
  useBandOpeningFeed();

  // Alert display style preference
  const alertDisplayStyle = useSettingsStore(
    (s) => s.notifications?.alertDisplayStyle ?? "toast",
  );

  // Initialize satellite pass alert monitoring (browser notifications)
  useSatelliteAlerts();

  // Initialize sync queue background processor
  useSyncQueue();
  // Keep rigStore synced with Bridge/Daemon CAT state
  useRigBridgeSync();
  // Keep operatingStore synced with rig, WSJT-X, and contest state
  useOperatingSync();

  // Keep the connectivity tier (cloud / LAN bridge / offline) current
  useConnectivityTier();

  // DX spot alert monitoring
  const {
    alerts: spotAlerts,
    startMonitoring: startSpotAlerts,
    isMonitoring: isSpotMonitoring,
  } = useSpotAlerts();

  // Auto-start spot alert monitoring when rules exist
  useEffect(() => {
    if (!isSpotMonitoring) {
      startSpotAlerts();
    }
  }, [isSpotMonitoring, startSpotAlerts]);

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
    <div className="h-[100dvh] flex flex-col bg-void-black">
      {/* Fixed mobile header */}
      <MobileHeader
        alertCount={activeAlerts.length}
        criticalAlertCount={criticalCount}
        onAlertClick={() => setShowAlertHistory(true)}
        onSettingsClick={() => navigate("/settings")}
      />

      {/* Offline connectivity banner (below header, flow-positioned) */}
      <OfflineIndicator className="w-full bg-caution-amber/90 text-void-black text-xs py-1 text-center font-medium flex-shrink-0" />

      {/* Emergency ticker for critical space weather */}
      <EmergencyTickerBar />

      {/* Alert banner (below header, above content) */}
      {(alertDisplayStyle === "banner" || alertDisplayStyle === "both") && (
        <AlertBanner
          alerts={activeAlerts}
          onDismiss={dismissAlert}
          onViewAll={() => setShowAlertHistory(true)}
        />
      )}

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
      {(alertDisplayStyle === "toast" || alertDisplayStyle === "both") && (
        <AlertToastContainer
          onDismiss={dismissAlert}
          onToastClick={() => setShowAlertHistory(true)}
        />
      )}

      {/* Alert History Modal */}
      <AlertHistoryModal
        isOpen={showAlertHistory}
        onClose={() => setShowAlertHistory(false)}
      />

      {/* Undo Toast */}
      <UndoToast />

      {/* DX Spot Alert Toasts */}
      <SpotAlertToastContainer alerts={spotAlerts} onDismiss={() => {}} />

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

      {/* Auth Modal */}
      <AuthModal />

      {/* Band opening suggest toast — bottom-center */}
      <BandSuggestToast />

      {/* Visual alert glow overlay (accessibility — opt-in) */}
      <AlertGlowOverlay />
    </div>
  );
}
