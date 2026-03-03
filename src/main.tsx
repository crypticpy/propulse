import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/globals.css";
import { runStoreDecompositionMigration } from "@/lib/migrations/userStoreMigration";

// Run one-time migration from monolithic userStore (v14) to decomposed stores
// Must execute synchronously before React renders and stores hydrate
runStoreDecompositionMigration();

// Auto-reload on stale chunk errors after redeployment.
// When Vercel deploys a new build, chunk hashes change. Users with a cached
// index.html will reference old chunk filenames that no longer exist, causing
// "Failed to fetch dynamically imported module" errors. This handler reloads
// the page once to pick up the new index.html.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

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
