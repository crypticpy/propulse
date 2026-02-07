import { lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { MobileLayout } from "@/components/layout/MobileLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTextScale } from "@/hooks/useTextScale";
import { useIsMobile } from "@/hooks/useIsMobile";

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

function AppLayout() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileLayout /> : <Layout />;
}

function App() {
  // Apply text scale preference to DOM
  useTextScale();

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
          <Route path="/map" element={<PropSphere />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
