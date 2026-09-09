// Shim for vite-plugin-pwa's virtual module `virtual:pwa-register/react`.
// The real module only exists inside a Vite build; the design-sync bundle is
// built with esbuild directly, so this repo-owned shim (wired via
// cfg.tsconfig `paths`, resolved by lib/bundle.mjs's tsconfigPathsPlugin)
// stands in with a component whose behavior matches the real hook's default
// (no update pending) so PWAUpdatePrompt renders its natural "nothing to
// show" state instead of crashing.
import { useState } from "react";

export interface RegisterSWOptions {
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

export function useRegisterSW(_options: RegisterSWOptions = {}) {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  return {
    needRefresh: [needRefresh, setNeedRefresh] as const,
    offlineReady: [offlineReady, setOfflineReady] as const,
    updateServiceWorker: async (_reloadPage?: boolean) => {},
  };
}
