import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
// Temporary DS-09 bridge: remaps the app's remaining fixed white/grey text
// classes onto the station tokens under the Light theme. Deleted by DS-12.
import "./styles/legacy-theme-bridge.css";
import { runStoreDecompositionMigration } from "@/lib/migrations/userStoreMigration";
import { installStaleChunkRecovery } from "@/lib/pwa/staleChunkRecovery";

// Run one-time migration from monolithic userStore (v14) to decomposed stores
// Must execute synchronously before React renders and stores hydrate
runStoreDecompositionMigration();

// Recover once from a stale PWA shell after a deployment. The recovery helper
// clears only HTTP asset caches/service workers and guards against reload loops.
installStaleChunkRecovery();

// Development utilities: attach __seedEquipment / __clearEquipment to window
if (import.meta.env.DEV) {
  import("@/lib/dev");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
