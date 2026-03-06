import { lazy, Suspense } from "react";
import { AtmosHeader } from "@/components/atmos/AtmosHeader";
import { AtmosSidebar } from "@/components/atmos/AtmosSidebar";
import { ActivationBanner } from "@/components/atmos/emcomm/ActivationBanner";
import { useAtmosStore } from "@/stores/atmosStore";
import { useEmcommStore } from "@/stores/emcommStore";

const EmCommQuickActions = lazy(() =>
  import("@/components/atmos/emcomm/EmCommQuickActions").then((m) => ({
    default: m.EmCommQuickActions,
  })),
);

const AtlasView = lazy(() =>
  import("@/components/atmos/AtlasView").then((m) => ({
    default: m.AtlasView,
  })),
);

const AtmosGlobeView = lazy(() =>
  import("@/components/atmos/AtmosGlobeView").then((m) => ({
    default: m.AtmosGlobeView,
  })),
);

export function AtmosLayout() {
  const viewMode = useAtmosStore((s) => s.viewMode);
  const activeIncident = useEmcommStore((s) => s.activeIncident);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] bg-void-black overflow-hidden">
      <AtmosHeader />
      {activeIncident && <ActivationBanner />}
      <div className="flex flex-1 min-h-0">
        <AtmosSidebar />
        {/* Main viewport area */}
        <main className="flex-1 relative">
          {viewMode === "2d" ? (
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center bg-void-black">
                  <span className="text-xs font-mono text-gray-600">
                    Loading map...
                  </span>
                </div>
              }
            >
              <AtlasView />
            </Suspense>
          ) : (
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center bg-void-black">
                  <span className="text-xs font-mono text-gray-600">
                    Loading globe...
                  </span>
                </div>
              }
            >
              <AtmosGlobeView />
            </Suspense>
          )}
          {activeIncident && (
            <Suspense fallback={null}>
              <EmCommQuickActions />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}
