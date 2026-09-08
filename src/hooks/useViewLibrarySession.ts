import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import { LAYER_PRESETS } from "@/stores/mapStore";
import { IndexedViewLibrary } from "@/lib/views/persistence/indexedLibrary";
import { HttpViewLibraryTransport } from "@/lib/views/persistence/httpTransport";
import { ViewLibrarySync } from "@/lib/views/persistence/librarySync";
import { RevisionedViewRepository } from "@/lib/views/persistence/repository";
import { bootstrapViewLibrary } from "@/lib/views/persistence/viewLibraryBootstrap";
import { getAnonymousInstallId } from "@/lib/views/runtime/ids";

/** Mounted once by useSync; each auth session owns its own inert-then-started library. */
export function useViewLibrarySession(): void {
  const initialized = useAuthStore((state) => state.initialized);
  const authSession = useAuthStore((state) => state.session);
  const userId = useAuthStore((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!initialized) return;
    const epoch = {};
    const controller = new AbortController();
    const ownerId = authSession && userId ? userId : `anon:${getAnonymousInstallId()}`;
    const mode = authSession && userId ? "account" : "local";
    const library = new IndexedViewLibrary(ownerId);
    const active = () => !controller.signal.aborted &&
      useViewLibrarySessionStore.getState().epoch === epoch &&
      useAuthStore.getState().session === authSession &&
      (useAuthStore.getState().user?.id ?? null) === userId;
    const sync = mode === "account" ? new ViewLibrarySync(library,
      new HttpViewLibraryTransport(ownerId, async () => active() && authSession
        ? { ownerId, accessToken: authSession.access_token } : null),
      () => active() ? ownerId : null,
    ) : null;
    const repository = sync?.repository ?? new RevisionedViewRepository(library, { mode: "local" });
    useViewLibrarySessionStore.setState({ epoch, ownerId, phase: "loading", repository: null, library: null, message: null });

    const refresh = async () => {
      if (!active() || !sync || useViewLibrarySessionStore.getState().phase !== "ready") return;
      try {
        await sync.refresh();
        if (active()) await repository.flushPending();
      } catch {
        // Cached records and durable drafts remain available for the next reconnect.
      }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    void (async () => {
      try {
        const result = await bootstrapViewLibrary(library, { local: localStorage, session: sessionStorage },
          { ownerId, mode, layerPresets: LAYER_PRESETS }, { signal: controller.signal, isActive: active });
        if (!active()) return;
        if (result.status !== "ready") {
          useViewLibrarySessionStore.setState({ phase: "unavailable", message: result.message });
          return;
        }
        useViewLibrarySessionStore.setState({ phase: "ready", repository, library, message: null });
        window.addEventListener("online", refresh);
        document.addEventListener("visibilitychange", visible);
        void refresh();
      } catch {
        if (active()) useViewLibrarySessionStore.setState({ phase: "unavailable", message: "View library could not be prepared; original settings retained" });
      }
    })();
    return () => {
      controller.abort();
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      sync?.dispose();
      if (!sync) repository.dispose();
      if (useViewLibrarySessionStore.getState().epoch === epoch) {
        useViewLibrarySessionStore.setState({ epoch: null, ownerId: null, phase: "waiting", repository: null, library: null, message: null });
      }
    };
  }, [initialized, authSession, userId]);
}
