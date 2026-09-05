/**
 * ShellOverlays — deferred chrome shared by the desktop and mobile layouts.
 *
 * Everything here is invisible at first paint (modals, toasts, background
 * sync hooks), so both layouts load it with React.lazy to keep it out of the
 * app entry bundle. The hosts still mount on every route exactly as they did
 * when they were inlined in Layout / MobileLayout.
 *
 * Rig PTT monitoring (useRigBridgeSync) and the ON-AIR banner stay out of
 * this deferred chunk — they mount synchronously in Layout/MobileLayout so
 * PTT state and the on-air indicator are never delayed by chunk load.
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertToastContainer } from "@/components/alerts/AlertToastContainer";
import { AlertHistoryModal } from "@/components/alerts/AlertHistoryModal";
import { SpotAlertToastContainer } from "@/components/alerts/SpotAlertToast";
import { AlertGlowOverlay } from "@/components/alerts/AlertGlowOverlay";
import { AuthModal } from "@/components/auth/AuthModal";
import { ContestVoiceManager } from "@/components/contest/ContestVoiceManager";
import { ContestGlobalHotkeys } from "@/components/contest/ContestGlobalHotkeys";
import { BandSuggestToast } from "@/components/operating/BandSuggestToast";
import { UndoToast } from "@/components/ui/UndoToast";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ShortcutsHelpModal } from "@/components/ui/ShortcutsHelpModal";
import { PWAInstallPrompt } from "@/components/ui/PWAInstallPrompt";
import { PWAUpdatePrompt } from "@/components/ui/PWAUpdatePrompt";
import { useSpotAlerts } from "@/hooks/useSpotAlerts";
import { useSatelliteAlerts } from "@/hooks/useSatelliteAlerts";
import { useBandOpeningFeed } from "@/hooks/useBandOpeningFeed";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useSyncQueue } from "@/hooks/useSyncQueue";
import { useOperatingSync } from "@/hooks/useOperatingSync";
import { useLanSettingsSync } from "@/hooks/useLanSettingsSync";
import type { AlertDisplayStyle } from "@/types/user";

export interface ShellOverlaysProps {
  /** Desktop adds contest voice/hotkeys; mobile adds the install prompt */
  variant: "desktop" | "mobile";
  /** Routes that own their own alerting (atmos, kiosk, display) suppress ambient toasts/overlays */
  quiet: boolean;
  alertDisplayStyle: AlertDisplayStyle;
  dismissAlert: (alertId: string) => void;
  showAlertHistory: boolean;
  onOpenAlertHistory: () => void;
  onCloseAlertHistory: () => void;
}

export function ShellOverlays({
  variant,
  quiet,
  alertDisplayStyle,
  dismissAlert,
  showAlertHistory,
  onOpenAlertHistory,
  onCloseAlertHistory,
}: ShellOverlaysProps) {
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Pull shared shack settings when served by the bridge (no-op elsewhere)
  useLanSettingsSync();

  // Feed live spots to the band opening detector (runs on all routes)
  useBandOpeningFeed();

  // Initialize satellite pass alert monitoring (browser notifications)
  useSatelliteAlerts();

  // Initialize undo/redo keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  useUndoRedo({ enabled: true });

  // Initialize sync queue background processor
  useSyncQueue();
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

  const showToasts =
    alertDisplayStyle === "toast" || alertDisplayStyle === "both";

  return (
    <>
      {variant === "desktop" && (
        <>
          <ContestVoiceManager />
          <ContestGlobalHotkeys />
        </>
      )}

      {/* Toast notifications - fixed position bottom-right */}
      {!quiet && showToasts && (
        <AlertToastContainer
          onDismiss={dismissAlert}
          onToastClick={onOpenAlertHistory}
        />
      )}

      {/* Alert History Modal */}
      <AlertHistoryModal
        isOpen={showAlertHistory}
        onClose={onCloseAlertHistory}
      />

      {/* Undo Toast - fixed position bottom-left */}
      <UndoToast />

      {/* DX Spot Alert Toasts */}
      {!quiet && (
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

      {/* PWA Install (mobile) + Update Prompts */}
      {variant === "mobile" && <PWAInstallPrompt />}
      <PWAUpdatePrompt />

      {/* Auth Modal */}
      <AuthModal />

      {/* Band opening suggest toast — bottom-center */}
      {!quiet && <BandSuggestToast />}

      {/* Visual alert glow overlay (accessibility — opt-in) */}
      {!quiet && <AlertGlowOverlay />}
    </>
  );
}
