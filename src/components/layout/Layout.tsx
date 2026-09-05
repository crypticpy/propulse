import { lazy, Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Header } from "./Header";
import { AlertBanner } from "@/components/alerts/AlertBanner";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { useDisplaySync } from "@/hooks/useDisplaySync";
import { useConnectivityTier } from "@/hooks/useConnectivityTier";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";
import { OnAirBanner } from "@/components/operating/OnAirBanner";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKioskStore } from "@/stores/kioskStore";
import { EmergencyTickerBar } from "@/components/alerts/EmergencyTickerBar";

// Kiosk chrome (and its qrcode dep) only loads when kiosk mode activates —
// keeps the wall-display machinery out of the entry bundle.
const KioskChrome = lazy(() =>
  import("@/components/kiosk/KioskChrome").then((m) => ({
    default: m.KioskChrome,
  })),
);

// Modals, toasts, and background sync hooks are invisible at first paint, so
// they load right after the shell instead of inside the entry bundle.
const ShellOverlays = lazy(() =>
  import("./ShellOverlays").then((m) => ({ default: m.ShellOverlays })),
);

/**
 * Layout - Root layout component with header and background effects
 * Also manages the global solar alert system
 */
export function Layout() {
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const location = useLocation();
  const isAtmos = location.pathname === "/atmos";
  // Kiosk mode swaps the normal chrome for the wall-display shell
  const isKiosk = useKioskStore((s) => s.active);
  // Pairing/holding screens for a wall device are full-bleed on their own —
  // no header/nav until useDisplaySync (below) flips the device into kiosk
  // mode and navigates away.
  const isDisplayRoute = location.pathname.startsWith("/display/");
  // Routes that own their own alerting: /atmos has its own alerts, kiosk uses
  // break-in takeover, display pairing screens are full-bleed.
  const quiet = isAtmos || isKiosk || isDisplayRoute;

  // Device-side Display Wall sync engine — no-op unless a paired identity
  // exists and syncActive is set (see DisplayPairPage/DisplayViewPage).
  useDisplaySync();

  // Keep the connectivity tier (cloud / LAN bridge / offline) current
  useConnectivityTier();

  // Keep rigStore synced with Bridge/Daemon CAT state
  useRigBridgeSync();

  // Initialize solar alert monitoring
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts({
    enabled: location.pathname !== "/solar",
  });

  // Alert display style preference
  const alertDisplayStyle = useSettingsStore(
    (s) => s.notifications?.alertDisplayStyle ?? "toast",
  );

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
        {!quiet && <EmergencyTickerBar />}

        {/* Alert Banner - appears below header when alerts are active */}
        {!quiet &&
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

      {/* ON-AIR transmit banner — every route, kiosk included */}
      <OnAirBanner />

      {/* Modals, toasts, sync hooks — nothing here renders at first paint */}
      <Suspense fallback={null}>
        <ShellOverlays
          variant="desktop"
          quiet={quiet}
          alertDisplayStyle={alertDisplayStyle}
          dismissAlert={dismissAlert}
          showAlertHistory={showAlertHistory}
          onOpenAlertHistory={() => setShowAlertHistory(true)}
          onCloseAlertHistory={() => setShowAlertHistory(false)}
        />
      </Suspense>
    </div>
  );
}
