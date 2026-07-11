import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { SolarPulse } from "@/pages/SolarPulse";
import { Logbook } from "@/pages/Logbook";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OnboardingWizard } from "@/components/onboarding";
import { useUserStore } from "@/stores/userStore";

// Lazy load PropSphere to split Three.js into separate chunk
const PropSphere = lazy(() =>
  import("@/pages/PropSphere").then((m) => ({ default: m.PropSphere })),
);

// Lazy load Learn page
const Learn = lazy(() =>
  import("@/pages/Learn").then((m) => ({ default: m.Learn })),
);

function App() {
  const hasCompletedOnboarding = useUserStore(
    (state) => state.preferences.hasCompletedOnboarding,
  );

  return (
    <ErrorBoundary>
      {/* Show onboarding wizard for first-time users */}
      {!hasCompletedOnboarding && <OnboardingWizard />}

      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/solar" element={<SolarPulse />} />
          <Route path="/log" element={<Logbook />} />
          <Route
            path="/map"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <LoadingSpinner size="lg" />
                      <p className="text-gray-500 text-sm">
                        Loading PropSphere...
                      </p>
                    </div>
                  </div>
                }
              >
                <PropSphere />
              </Suspense>
            }
          />
          <Route
            path="/learn"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <LoadingSpinner size="lg" />
                      <p className="text-gray-500 text-sm">Loading Learn...</p>
                    </div>
                  </div>
                }
              >
                <Learn />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
