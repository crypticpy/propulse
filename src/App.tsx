import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Link, Navigate, useParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthGate } from "@/components/auth/AuthGate";
import { useTextScale } from "@/hooks/useTextScale";
import { useHighContrast } from "@/hooks/useHighContrast";
import { useColorBlindMode } from "@/hooks/useColorBlindMode";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSync } from "@/hooks/useSync";
import { useAuthStore } from "@/stores/authStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useProfileStore } from "@/stores/profileStore";

const WelcomeOverlay = lazy(() =>
  import("@/components/onboarding/WelcomeOverlay").then((m) => ({
    default: m.WelcomeOverlay,
  })),
);
const RadioSetupWizard = lazy(() =>
  import("@/components/onboarding/RadioSetupWizard").then((m) => ({
    default: m.RadioSetupWizard,
  })),
);
const WSJTXAutoLogHost = lazy(() =>
  import("@/components/ops/WSJTXAutoLogHost").then((m) => ({
    default: m.WSJTXAutoLogHost,
  })),
);
const RankPersistenceHost = lazy(() =>
  import("@/components/rank/RankPersistenceHost").then((m) => ({
    default: m.RankPersistenceHost,
  })),
);
// Import the theme store so its initializer runs and applies persisted accent/theme
import "@/stores/themeStore";
const NetAlertToasts = lazy(() =>
  import("@/components/nets/NetAlertToasts").then((m) => ({
    default: m.NetAlertToasts,
  })),
);
import { clearExpiredCache } from "@/lib/utils/idbCache";
const SpeedInsights = lazy(() =>
  import("@vercel/speed-insights/react").then((m) => ({
    default: m.SpeedInsights,
  })),
);

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
const PropSphereOpsWindow = lazy(() =>
  import("@/pages/PropSphereOpsWindow").then((m) => ({
    default: m.PropSphereOpsWindow,
  })),
);
const MapExplorerPage = lazy(() => import("@/pages/MapExplorerPage"));
const Photorealistic3DPage = lazy(
  () => import("@/pages/Photorealistic3DPage"),
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
const FeaturesPage = lazy(() => import("@/pages/FeaturesPage"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));
const HelpArticlePage = lazy(() => import("@/pages/HelpArticlePage"));
const NetsPage = lazy(() =>
  import("@/pages/NetsPage").then((m) => ({ default: m.NetsPage })),
);
const NetDetailPage = lazy(() =>
  import("@/pages/NetDetailPage").then((m) => ({ default: m.NetDetailPage })),
);
const NetCreatePage = lazy(() =>
  import("@/pages/NetCreatePage").then((m) => ({ default: m.NetCreatePage })),
);
const NCSLiveDashboard = lazy(() =>
  import("@/pages/NCSLiveDashboard").then((m) => ({
    default: m.NCSLiveDashboard,
  })),
);
const NetAnalyticsPage = lazy(() =>
  import("@/pages/NetAnalyticsPage").then((m) => ({
    default: m.NetAnalyticsPage,
  })),
);
const NetControllerPage = lazy(() =>
  import("@/pages/NetControllerPage").then((m) => ({
    default: m.NetControllerPage,
  })),
);
const NetControllerDetailPage = lazy(() =>
  import("@/pages/NetControllerDetailPage").then((m) => ({
    default: m.NetControllerDetailPage,
  })),
);
const AwardsPage = lazy(() => import("@/pages/AwardsPage"));
const ContestExplorerPage = lazy(() => import("@/pages/ContestExplorerPage"));
const ActivationPage = lazy(() => import("@/pages/ActivationPage"));
const SatellitesPage = lazy(() =>
  import("@/pages/SatellitesPage").then((m) => ({
    default: m.SatellitesPage,
  })),
);
const AtmosPulse = lazy(() =>
  import("@/pages/AtmosPulse").then((m) => ({ default: m.AtmosPulse })),
);
const KioskPage = lazy(() =>
  import("@/pages/KioskPage").then((m) => ({ default: m.KioskPage })),
);
const WallClockPage = lazy(() =>
  import("@/pages/WallClockPage").then((m) => ({ default: m.WallClockPage })),
);
const DisplayPairPage = lazy(() =>
  import("@/pages/DisplayPairPage").then((m) => ({
    default: m.DisplayPairPage,
  })),
);
const DisplayViewPage = lazy(() =>
  import("@/pages/DisplayViewPage").then((m) => ({
    default: m.DisplayViewPage,
  })),
);
const PairClaimPage = lazy(() =>
  import("@/pages/PairClaimPage").then((m) => ({
    default: m.PairClaimPage,
  })),
);
const DisplaysPage = lazy(() =>
  import("@/pages/DisplaysPage").then((m) => ({ default: m.DisplaysPage })),
);

/** Redirect helper for old /nets/:netId/* routes that moved to /ncs/:netId/* */
function NcsRedirect({ suffix }: { suffix: string }) {
  const { netId } = useParams<{ netId: string }>();
  return <Navigate to={`/ncs/${netId}${suffix}`} replace />;
}

function AppLayout() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <Layout />;
}

function MapRoute() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileMap /> : <PropSphere />;
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
      <div className="text-6xl font-mono font-bold text-plasma-orange">404</div>
      <h1 className="text-xl font-semibold text-white">Page Not Found</h1>
      <p className="text-gray-400 max-w-md">
        The frequency you&apos;re looking for isn&apos;t propagating. Check your
        heading and try again.
      </p>
      <Link
        to="/"
        className="px-4 py-2 rounded-lg bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}

function App() {
  // Apply text scale preference to DOM
  useTextScale();
  // Apply high-contrast mode class to <html>
  useHighContrast();
  // Apply color blind mode CSS variable palette to <html>
  useColorBlindMode();

  // Kiosk screens are unattended: suppress first-run wizards and celebrations
  const isKiosk = useKioskStore((s) => s.active);

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

  const [upgradeToast, setUpgradeToast] = useState(false);

  // Upgrade success toast — detect ?upgraded=true and show briefly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "true") {
      setUpgradeToast(true);
      window.history.replaceState({}, "", window.location.pathname);
      const timer = setTimeout(() => setUpgradeToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthGate>
        <Suspense fallback={null}>
          <RankPersistenceHost />
        </Suspense>
        <Suspense fallback={null}>
          <WelcomeOverlay />
        </Suspense>
        <Suspense fallback={null}>
          <WSJTXAutoLogHost />
        </Suspense>
        {!isKiosk && (
          <Suspense fallback={null}>
            <RadioSetupWizard />
          </Suspense>
        )}
        {upgradeToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[600] px-5 py-3 rounded-xl bg-signal-green/20 border border-signal-green/30 backdrop-blur-lg text-signal-green text-sm font-medium shadow-lg animate-fade-in">
            Welcome to Pro! All features unlocked.
          </div>
        )}
        <Routes>
          {/* Full-window peer for PropSphere's synchronized operating dock. */}
          <Route
            path="/map/ops"
            element={
              <Suspense
                fallback={
                  <div className="flex min-h-screen items-center justify-center bg-void-black font-mono text-xs uppercase tracking-widest text-white/40">
                    Loading operating workspace…
                  </div>
                }
              >
                <PropSphereOpsWindow />
              </Suspense>
            }
          />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/solar" element={<SolarPulse />} />
            <Route path="/dx" element={<DXWizard />} />
            <Route path="/planner" element={<BandPlanner />} />
            <Route path="/log" element={<Logbook />} />
            <Route path="/awards" element={<AwardsPage />} />
            <Route path="/contest" element={<Contest />} />
            <Route path="/contests" element={<ContestExplorerPage />} />
            <Route path="/activation" element={<ActivationPage />} />
            <Route path="/satellites" element={<SatellitesPage />} />
            <Route path="/atmos" element={<AtmosPulse />} />
            <Route path="/kiosk" element={<KioskPage />} />
            <Route path="/clock" element={<WallClockPage mode="clock" />} />
            <Route
              path="/stopwatch"
              element={<WallClockPage mode="stopwatch" />}
            />
            <Route path="/display/pair" element={<DisplayPairPage />} />
            <Route path="/display/:id" element={<DisplayViewPage />} />
            <Route path="/pair" element={<PairClaimPage />} />
            <Route path="/displays" element={<DisplaysPage />} />
            <Route path="/map" element={<MapRoute />} />
            <Route
              path="/map/explorer"
              element={
                <ErrorBoundary>
                  <MapExplorerPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="/map/photorealistic"
              element={
                <ErrorBoundary>
                  <Photorealistic3DPage />
                </ErrorBoundary>
              }
            />
            <Route path="/settings/*" element={<SettingsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:callsign" element={<ProfilePage />} />
            <Route path="/op/:callsign" element={<ProfilePage />} />
            <Route path="/op/:callsign/shack" element={<ProfilePage />} />
            <Route path="/shack" element={<ShackPage />} />
            <Route path="/sdr" element={<SdrConsole />} />
            <Route path="/sdr/setup" element={<RadioDaemonSetup />} />
            <Route path="/health" element={<SystemHealthPage />} />
            <Route path="/bridge" element={<BridgeInfoPage />} />
            <Route path="/setup" element={<SetupGuidePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/help/:sectionId" element={<HelpArticlePage />} />
            {/* Net Registry (browse / discover) */}
            <Route path="/nets" element={<NetsPage />} />
            <Route path="/nets/:netId" element={<NetDetailPage />} />

            {/* Net Controller (manage / operate) */}
            <Route path="/ncs" element={<NetControllerPage />} />
            <Route path="/ncs/create" element={<NetCreatePage />} />
            <Route path="/ncs/:netId" element={<NetControllerDetailPage />} />
            <Route path="/ncs/:netId/live" element={<NCSLiveDashboard />} />
            <Route
              path="/ncs/:netId/analytics"
              element={<NetAnalyticsPage />}
            />

            {/* Redirects from old /nets/* controller routes */}
            <Route
              path="/nets/create"
              element={<Navigate to="/ncs/create" replace />}
            />
            <Route
              path="/nets/:netId/live"
              element={<NcsRedirect suffix="/live" />}
            />
            <Route
              path="/nets/:netId/analytics"
              element={<NcsRedirect suffix="/analytics" />}
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        <Suspense fallback={null}>
          <NetAlertToasts />
        </Suspense>
        <Suspense fallback={null}>
          <SpeedInsights />
        </Suspense>
      </AuthGate>
    </ErrorBoundary>
  );
}

export default App;
