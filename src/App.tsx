import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Home } from "@/pages/Home";
import { SolarPulse } from "@/pages/SolarPulse";
import { DXWizard } from "@/pages/DXWizard";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy load PropSphere to split Three.js into separate chunk
const PropSphere = lazy(() =>
  import("@/pages/PropSphere").then((m) => ({ default: m.PropSphere })),
);

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/solar" element={<SolarPulse />} />
          <Route path="/dx" element={<DXWizard />} />
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
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
