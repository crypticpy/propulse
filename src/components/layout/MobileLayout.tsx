import { lazy, Suspense, useState, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { MobileHeader } from "./MobileHeader";
import { BottomTabBar } from "./BottomTabBar";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { AlertBanner } from "@/components/alerts/AlertBanner";
import { useConnectivityTier } from "@/hooks/useConnectivityTier";
import { useRigBridgeSync } from "@/hooks/useRigBridgeSync";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { PullToRefreshIndicator } from "@/components/ui/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { useSettingsStore } from "@/stores/settingsStore";
import { EmergencyTickerBar } from "@/components/alerts/EmergencyTickerBar";

// Modals, toasts, and background sync hooks are invisible at first paint, so
// they load right after the shell instead of inside the entry bundle.
const ShellOverlays = lazy(() =>
  import("./ShellOverlays").then((m) => ({ default: m.ShellOverlays })),
);

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
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize solar alert monitoring (mirrors Layout.tsx)
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts({
    enabled: location.pathname !== "/solar",
  });

  // Alert display style preference
  const alertDisplayStyle = useSettingsStore(
    (s) => s.notifications?.alertDisplayStyle ?? "toast",
  );

  // Keep the connectivity tier (cloud / LAN bridge / offline) current
  useConnectivityTier();

  // Keep rigStore synced with Bridge/Daemon CAT state
  useRigBridgeSync();

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

      {/* Modals, toasts, sync hooks — nothing here renders at first paint */}
      <Suspense fallback={null}>
        <ShellOverlays
          variant="mobile"
          quiet={false}
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
