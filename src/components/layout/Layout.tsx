import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import {
  AlertBanner,
  AlertToastContainer,
  AlertHistoryModal,
} from "@/components/alerts";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";

/**
 * Layout - Root layout component with header and background effects
 * Also manages the global solar alert system
 */
export function Layout() {
  const [showAlertHistory, setShowAlertHistory] = useState(false);

  // Initialize solar alert monitoring
  const { activeAlerts, dismissAlert, criticalCount } = useSolarAlerts();

  return (
    <div className="min-h-screen bg-cosmic-gradient">
      {/* Stars background */}
      <div className="fixed inset-0 bg-stars opacity-40 pointer-events-none" />

      {/* Orange glow effect */}
      <div className="fixed inset-0 bg-glow-orange pointer-events-none" />

      {/* Main content */}
      <div className="relative z-10">
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

        <Outlet />
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
    </div>
  );
}
