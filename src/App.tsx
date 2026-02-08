import { lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTextScale } from "@/hooks/useTextScale";
import { useHighContrast } from "@/hooks/useHighContrast";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSync } from "@/hooks/useSync";
import { useAuthStore } from "@/stores/authStore";
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

  // Initialize auth on app boot (checks for existing session, sets up listener)
  const initAuth = useAuthStore((s) => s.initialize);
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // Start/stop sync engine based on auth state
  useSync();

  return (
    <ErrorBoundary>
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
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
