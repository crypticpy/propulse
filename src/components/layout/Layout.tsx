import { lazy, Suspense, useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "./Header";
import {
  AlertBanner,
  AlertToastContainer,
  AlertHistoryModal,
  SpotAlertToastContainer,
} from "@/components/alerts";
import { useSpotAlerts } from "@/hooks/useSpotAlerts";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { UndoToast } from "@/components/ui/UndoToast";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ShortcutsHelpModal } from "@/components/ui/ShortcutsHelpModal";
import { PWAUpdatePrompt } from "@/components/ui/PWAUpdatePrompt";
import { AuthModal } from "@/components/auth";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { useSatelliteAlerts } from "@/hooks/useSatelliteAlerts";
import { useBandOpeningFeed } from "@/hooks/useBandOpeningFeed";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { ContestVoiceManager } from "@/components/contest/ContestVoiceManager";
import { ContestGlobalHotkeys } from "@/components/contest/ContestGlobalHotkeys";
import { BandSuggestToast } from "@/components/operating/BandSuggestToast";
import { OnAirBanner } from "@/components/operating/OnAirBanner";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";
import { useOperatingSync } from "@/hooks/useOperatingSync";
import { useDisplaySync } from "@/hooks/useDisplaySync";
import { useConnectivityTier } from "@/hooks/useConnectivityTier";
import { useLanSettingsSync } from "@/hooks/useLanSettingsSync";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore } from "@/stores/kioskStore";
import { AlertGlowOverlay } from "@/components/alerts/AlertGlowOverlay";
import { EmergencyTickerBar } from "@/components/alerts/EmergencyTickerBar";

// Kiosk chrome (and its qrcode dep) only loads when kiosk mode activates —
// keeps the wall-display machinery out of the entry bundle.
const KioskChrome = lazy(() =>
  import("@/components/kiosk/KioskChrome").then((m) => ({
    default: m.KioskChrome,
  })),
);

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
  const location = useLocation();
  const isAtmos = location.pathname === "/atmos";
  // Kiosk mode swaps the normal chrome for the wall-display shell
  const isKiosk = useKioskStore((s) => s.active);
  // Pairing/holding screens for a wall device are full-bleed on their own —
  // no header/nav until useDisplaySync (below) flips the device into kiosk
  // mode and navigates away.
  const isDisplayRoute = location.pathname.startsWith("/display/");

  // Device-side Display Wall sync engine — no-op unless a paired identity
  // exists and syncActive is set (see DisplayPairPage/DisplayViewPage).
  useDisplaySync();

  // Keep the connectivity tier (cloud / LAN bridge / offline) current
  useConnectivityTier();

  // Pull shared shack settings when served by the bridge (no-op elsewhere)
  useLanSettingsSync();

  // Initialize solar alert monitoring
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

  // Initialize undo/redo keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  useUndoRedo({ enabled: true });

  // Initialize sync queue background processor
  useSyncQueue();
  // Keep rigStore synced with Bridge/Daemon CAT state
  useRigBridgeSync();
  // Keep operatingStore synced with rig, WSJT-X, and contest state
  useOperatingSync();

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

        {isKiosk ? (
          <Suspense fallback={null}>
            <KioskChrome />
          </Suspense>
        ) : isDisplayRoute ? null : (
          <Header
            alertCount={activeAlerts.length}
            criticalAlertCount={criticalCount}
            onAlertClick={() => setShowAlertHistory(true)}
          />
        )}

        {/* Emergency ticker for critical space weather (not on /atmos — has its own alerts; kiosk uses break-in takeover) */}
        {!isAtmos && !isKiosk && !isDisplayRoute && <EmergencyTickerBar />}

        {/* Alert Banner - appears below header when alerts are active */}
        {!isAtmos &&
          !isKiosk &&
          !isDisplayRoute &&
          (alertDisplayStyle === "banner" || alertDisplayStyle === "both") && (
            <AlertBanner
              alerts={activeAlerts}
              onDismiss={dismissAlert}
              onViewAll={() => setShowAlertHistory(true)}
            />
          )}

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

      {/* Toast notifications - fixed position bottom-right (not on /atmos or kiosk) */}
      {!isAtmos &&
        !isKiosk &&
        !isDisplayRoute &&
        (alertDisplayStyle === "toast" || alertDisplayStyle === "both") && (
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

      {/* Undo Toast - fixed position bottom-left */}
      <UndoToast />

      {/* ON-AIR transmit banner — every route, kiosk included */}
      <OnAirBanner />

      {/* DX Spot Alert Toasts (not on /atmos or kiosk) */}
      {!isAtmos && !isKiosk && !isDisplayRoute && (
        <SpotAlertToastContainer alerts={spotAlerts} onDismiss={() => {}} />
      )}

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

      {/* Auth Modal */}
      <AuthModal />

      {/* Band opening suggest toast — bottom-center (not on /atmos or kiosk) */}
      {!isAtmos && !isKiosk && !isDisplayRoute && <BandSuggestToast />}

      {/* Visual alert glow overlay (accessibility — opt-in, not on /atmos or kiosk) */}
      {!isAtmos && !isKiosk && !isDisplayRoute && <AlertGlowOverlay />}
    </div>
  );
}
