/**
 * #708 acceptance. The three claims that only hold across a real composition
 * are proved against real components: the Settings surface and a map host in
 * one tree, both on the same owner, with the real `createViewRuntime`,
 * registry and working storage. Only the upstream live-spot query is faked —
 * everything between the panel's slider and the host's rendered spot count is
 * production code.
 */
import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ViewProvider } from "@/components/views/ViewProvider";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";
import { useViewMapSpots } from "@/hooks/useViewMapSpots";
import {
  createMemoryLibraryPort,
  type MemoryLibraryPort,
} from "@/components/settings/spots/testing";
import {
  createMemoryWorkingStorage,
  WORKING_SLOT_PREFIX,
  type ScopedViewRuntime,
} from "@/lib/views/runtime";
import type { LiveSpot } from "@/types/livespot";
import { SpotsPathsPreferences } from "./SpotsPathsSection";
import { familySlotForLayout } from "./spotsPathsTarget";

const mocks = vi.hoisted(() => ({ live: vi.fn() }));
vi.mock("@/hooks/useLiveSpots", () => ({ useLiveSpots: mocks.live }));

const OWNER = "owner-708";

function liveSpot(index: number, now: number): LiveSpot {
  return {
    id: `spot-${index}`,
    spotter: `K${index}ABC`,
    dx: `EA${index}XYZ`,
    frequency: 14074 + index,
    mode: "USB",
    comment: "",
    // Well inside the default 30-minute window, distinct per spot so the
    // recency ordering the budget applies is stable.
    time: new Date(now - index * 1000),
    band: "20m",
    source: "PSKReporter",
    dxLat: 40 + index * 0.25,
    dxLon: -3 - index * 0.25,
  };
}

function liveSpotsResult(spots: LiveSpot[]) {
  return {
    spots,
    evidenceSpots: spots,
    feedScopeKey: "spots-paths-708",
    sourceMetadata: {},
    sourceStates: { PSKReporter: "LIVE", RBN: "OFF", "WSJT-X": "OFF" },
    isLoading: false,
    isFeedReady: true,
    isError: false,
    spotsBySource: { PSKReporter: spots, RBN: [], Cluster: [], "WSJT-X": [] },
    refetch: vi.fn(),
  };
}

let client: QueryClient;
let libraryPort: MemoryLibraryPort;

beforeEach(() => {
  const now = Date.now();
  mocks.live.mockReturnValue(
    liveSpotsResult(Array.from({ length: 25 }, (_, index) => liveSpot(index, now))),
  );
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  libraryPort = createMemoryLibraryPort();
});

function workingSlotKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(WORKING_SLOT_PREFIX)) keys.push(key);
  }
  return keys;
}

function MapHostProbe({ onRuntime }: { onRuntime?: (runtime: ScopedViewRuntime) => void }) {
  const runtime = useViewRuntime();
  const feed = useViewMapSpots({ enabled: true, grid: "EM10aa" });
  useEffect(() => {
    onRuntime?.(runtime);
  }, [onRuntime, runtime]);
  return <div data-testid="host-mapped">{feed.candidateSpots.length}</div>;
}

function MapHost({ onRuntime }: { onRuntime?: (runtime: ScopedViewRuntime) => void }) {
  return (
    <ViewProvider ownerId={OWNER} slot="normal" storage={createMemoryWorkingStorage()}>
      <MapHostProbe onRuntime={onRuntime} />
    </ViewProvider>
  );
}

function Settings() {
  return (
    <SpotsPathsPreferences ownerId={OWNER} targetSlot="normal" library={libraryPort} />
  );
}

function Tree({
  host = true,
  settings = true,
  onHostRuntime,
}: {
  host?: boolean;
  settings?: boolean;
  onHostRuntime?: (runtime: ScopedViewRuntime) => void;
}) {
  return (
    <QueryClientProvider client={client}>
      {host && <MapHost onRuntime={onHostRuntime} />}
      {settings && <Settings />}
    </QueryClientProvider>
  );
}

describe("familySlotForLayout", () => {
  it("routes Lite to the Normal mount point's slot and keeps the others", () => {
    expect(familySlotForLayout("lite")).toBe("normal");
    expect(familySlotForLayout("normal")).toBe("normal");
    expect(familySlotForLayout("pro")).toBe("pro");
    expect(familySlotForLayout("hamclock")).toBe("hamclock");
  });
});

describe("SpotsPaths settings entry point", () => {
  it("changes what the map draws: a smaller report cap applied from the panel shrinks the host's candidate spots", async () => {
    const user = userEvent.setup();
    render(<Tree />);

    const mapped = await screen.findByTestId("host-mapped");
    expect(mapped.textContent).toBe("25");

    await user.click(
      screen.getByRole("button", { name: /Open Spots & paths preferences/i }),
    );
    const slider = await screen.findByRole("slider", { name: "Maximum reports shown" });
    fireEvent.change(slider, { target: { value: "10" } });
    // Closing the panel unmounts the section, which flushes the debounced
    // slider commit into the preview runtime.
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    // Nothing has reached the map yet: the preview slot is not the map's slot.
    expect(screen.getByTestId("host-mapped").textContent).toBe("25");

    await user.click(screen.getByRole("button", { name: /Apply to Standard map/i }));
    await waitFor(() =>
      expect(screen.getByTestId("host-mapped").textContent).toBe("10"),
    );
    expect(
      screen.getByText(/Your Standard map is showing these settings now\./),
    ).toBeTruthy();
  });

  it("never disposes the other surface's runtime: the host reads fine after Settings mounts and unmounts, and Settings still edits after the host goes", async () => {
    const user = userEvent.setup();
    let captured: ScopedViewRuntime | null = null;
    const { rerender } = render(
      <Tree
        onHostRuntime={(runtime) => {
          captured = runtime;
        }}
      />,
    );
    await screen.findByTestId("host-mapped");
    const host = captured as ScopedViewRuntime | null;
    expect(host).not.toBeNull();

    // Settings mounted second. If it took the host's registry key
    // (`ownerId\0slotId\0kind`), `registerRuntimeWriter` would have disposed
    // the host and this read would throw "View runtime has been disposed".
    expect(() => host!.getSnapshot()).not.toThrow();

    // Drop Settings, read the host again.
    rerender(<Tree settings={false} />);
    await screen.findByTestId("host-mapped");
    expect(() => host!.getSnapshot()).not.toThrow();

    // And the reverse: drop the host, and the Settings surface must still be
    // able to read and write its own runtime.
    rerender(<Tree host={false} />);
    await user.click(
      screen.getByRole("button", { name: /Open Spots & paths preferences/i }),
    );
    const slider = await screen.findByRole("slider", { name: "Maximum reports shown" });
    fireEvent.change(slider, { target: { value: "40" } });
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: /Apply to Standard map/i }));
    expect(
      screen.getByText(/will use these settings the next time you open it\./),
    ).toBeTruthy();
  });

  it("writes nothing to the working-slot session storage when the section is merely visited", async () => {
    render(<Tree host={false} />);
    await screen.findByRole("button", { name: /Open Spots & paths preferences/i });

    expect(workingSlotKeys()).toEqual([]);
  });
});
