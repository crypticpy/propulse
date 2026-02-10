import { lazy, useEffect, useState, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTextScale } from "@/hooks/useTextScale";
import { useHighContrast } from "@/hooks/useHighContrast";
import { useColorBlindMode } from "@/hooks/useColorBlindMode";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSync } from "@/hooks/useSync";
import { useAuthStore } from "@/stores/authStore";
import { useProfileStore } from "@/stores/profileStore";
import { useOperatorRank } from "@/hooks/useOperatorRank";
import { RankUpCelebration } from "@/components/rank/RankUpCelebration";
import type { RankTier } from "@/types/rank";
// Import the theme store so its initializer runs and applies persisted accent/theme
import "@/stores/themeStore";
import { clearExpiredCache } from "@/lib/utils/idbCache";

// Prune stale IDB cache entries on app startup (fire-and-forget)
clearExpiredCache().catch(() => {});

// Lazy load all page components for code splitting
const Home = lazy(() =>
  import("@/pages/Home").then((m) => ({ default: m.Home })),
);
const SolarPulse = lazy(() =>
  import("@/pages/SolarPulse").then((m) => ({ default: m.SolarPulse })),
);
const DXWizard = lazy(() =>
  import("@/pages/DXWizard").then((m) => ({ default: m.DXWizard })),
);
const BandPlanner = lazy(() =>
  import("@/pages/BandPlanner").then((m) => ({ default: m.BandPlanner })),
);
const Logbook = lazy(() =>
  import("@/pages/Logbook").then((m) => ({ default: m.Logbook })),
);
const Contest = lazy(() =>
  import("@/pages/Contest").then((m) => ({ default: m.Contest })),
);
const PropSphere = lazy(() =>
  import("@/pages/PropSphere").then((m) => ({ default: m.PropSphere })),
);
const MobileMap = lazy(() =>
  import("@/components/mobile/MobileMap").then((m) => ({
    default: m.MobileMap,
  })),
);
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const ShackPage = lazy(() => import("@/pages/ShackPage"));
const SdrConsole = lazy(() =>
  import("@/pages/SdrConsole").then((m) => ({ default: m.SdrConsole })),
);
const RadioDaemonSetup = lazy(() =>
  import("@/pages/RadioDaemonSetup").then((m) => ({
    default: m.RadioDaemonSetup,
  })),
);
const SystemHealthPage = lazy(() =>
  import("@/pages/SystemHealthPage").then((m) => ({
    default: m.SystemHealthPage,
  })),
);
const BridgeInfoPage = lazy(() =>
  import("@/pages/BridgeInfoPage").then((m) => ({
    default: m.BridgeInfoPage,
  })),
);
const SetupGuidePage = lazy(() =>
  import("@/pages/SetupGuidePage").then((m) => ({
    default: m.SetupGuidePage,
  })),
);

function AppLayout() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <Layout />;
}

function MapRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileMap /> : <PropSphere />;
}

function App() {
  // Apply text scale preference to DOM
  useTextScale();
  // Apply high-contrast mode class to <html>
  useHighContrast();
  // Apply color blind mode CSS variable palette to <html>
  useColorBlindMode();

  // Initialize auth on app boot (checks for existing session, sets up listener)
  const initAuth = useAuthStore((s) => s.initialize);
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // Start/stop sync engine based on auth state
  useSync();

  // Record daily login for streak tracking
  const recordLogin = useProfileStore((s) => s.recordLogin);
  useEffect(() => {
    recordLogin();
  }, [recordLogin]);

  // Rank-up celebration — invoke hook to trigger rank computation side-effects
  useOperatorRank();
  const rankHistory = useProfileStore((s) => s.operatorRank.rankHistory);
  const rankCelebrationSeen = useProfileStore((s) => s.rankCelebrationSeen);
  const markCelebrationSeen = useProfileStore((s) => s.markCelebrationSeen);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationRanks, setCelebrationRanks] = useState<{
    from: RankTier;
    to: RankTier;
  } | null>(null);

  // Check if there's a new rank transition to celebrate
  useEffect(() => {
    if (rankHistory.length === 0) return;
    const latestTransition = rankHistory[rankHistory.length - 1];
    const latestTimestamp = latestTransition.timestamp;

    // Show celebration if latest transition is newer than last seen
    if (!rankCelebrationSeen || latestTimestamp > rankCelebrationSeen) {
      setCelebrationRanks({
        from: latestTransition.from,
        to: latestTransition.to,
      });
      setShowCelebration(true);
    }
  }, [rankHistory, rankCelebrationSeen]);

  const handleDismissCelebration = useCallback(() => {
    setShowCelebration(false);
    markCelebrationSeen();
  }, [markCelebrationSeen]);

  return (
    <ErrorBoundary>
      {showCelebration && celebrationRanks && (
        <RankUpCelebration
          fromRank={celebrationRanks.from}
          toRank={celebrationRanks.to}
          onDismiss={handleDismissCelebration}
        />
      )}
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/solar" element={<SolarPulse />} />
          <Route path="/dx" element={<DXWizard />} />
          <Route path="/planner" element={<BandPlanner />} />
          <Route path="/log" element={<Logbook />} />
          <Route path="/contest" element={<Contest />} />
          <Route path="/map" element={<MapRoute />} />
          <Route path="/settings/*" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:callsign" element={<ProfilePage />} />
          <Route path="/shack" element={<ShackPage />} />
          <Route path="/sdr" element={<SdrConsole />} />
          <Route path="/sdr/setup" element={<RadioDaemonSetup />} />
          <Route path="/health" element={<SystemHealthPage />} />
          <Route path="/bridge" element={<BridgeInfoPage />} />
          <Route path="/setup" element={<SetupGuidePage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
