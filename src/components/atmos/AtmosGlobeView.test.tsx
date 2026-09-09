import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { AtmosGlobeView } from "./AtmosGlobeView";

// GlobeView itself is a ~3k line Three.js/WebGL component — far too heavy to
// mount in jsdom. Stub it with a component that calls the same hook real
// GlobeView bottoms out on (useViewRuntime, via useBoundVisualTarget /
// useViewSpotSelection), so this test still proves a ViewProvider is
// actually mounted above it, not just that AtmosGlobeView renders.
vi.mock("@/components/map/GlobeView", () => ({
  GlobeView: () => {
    useViewRuntime();
    return <div data-testid="globe-stub" />;
  },
}));

describe("AtmosGlobeView", () => {
  it("mounts without throwing (PR #603 N1: no ViewProvider above GlobeView white-screened /atmos in 3D)", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    // GlobeView is lazy() — a missing ViewProvider throws only once the
    // dynamic import resolves and React renders the real component, not
    // synchronously inside render(). Assert on the async resolution instead
    // of wrapping render() in a synchronous not.toThrow().
    render(
      <QueryClientProvider client={client}>
        <AtmosGlobeView />
      </QueryClientProvider>,
    );

    await expect(screen.findByTestId("globe-stub")).resolves.toBeTruthy();
  });
});
