/**
 * #708 acceptance. The three claims that only hold across a real composition
 * are proved against real components: the Settings surface and a map host in
 * one tree, both on the same owner, with the real `createViewRuntime`,
 * registry and working storage. Only the upstream live-spot query is faked —
 * everything between the panel's slider and the host's rendered spot count is
 * production code.
 */
import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  getAnonymousInstallId,
  workingSlotKey,
  WORKING_SLOT_PREFIX,
  type ScopedViewRuntime,
} from "@/lib/views/runtime";
import type { IndexedViewLibrary } from "@/lib/views/persistence/indexedLibrary";
import type { RevisionedViewRepository } from "@/lib/views/persistence/repository";
import { useAuthStore } from "@/stores/authStore";
import { useMapStore } from "@/stores/mapStore";
import { useViewLibrarySessionStore } from "@/stores/viewLibrarySessionStore";
import type { LiveSpot } from "@/types/livespot";
import { SpotsPathsPreferences, SpotsPathsSection } from "./SpotsPathsSection";
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
  // jsdom ships no matchMedia; `useIsMobile` (folded into the target slot
  // derivation) needs one. Desktop viewport, so the target follows layoutMode.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
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
    expect(familySlotForLayout("lite", false)).toBe("normal");
    expect(familySlotForLayout("normal", false)).toBe("normal");
    expect(familySlotForLayout("pro", false)).toBe("pro");
    expect(familySlotForLayout("hamclock", false)).toBe("hamclock");
  });

  it("pins every mobile layout to normal, the only slot MobileMap mounts", () => {
    // `MobileMap` hard-codes `<BoundViewHost slot="normal">`, and layoutMode is
    // persisted per profile, so a phone carrying a Pro layout must still be
    // offered the slot its own host reads.
    expect(familySlotForLayout("pro", true)).toBe("normal");
    expect(familySlotForLayout("hamclock", true)).toBe("normal");
    expect(familySlotForLayout("lite", true)).toBe("normal");
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
    //
    // On revert the assertion that moves is not this `not.toThrow()` — the
    // render above throws first, because `useViewMapSpots` reads the disposed
    // runtime during the host's re-render. This line is the backstop that
    // names the failure when the crash is somewhere less obvious.
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

/**
 * Acceptance item (b) through the path production actually takes: no host is
 * mounted (Settings and the map are separate routes), so the commit has to
 * land in the working-slot record the next host recovers. The owner value the
 * section derives is the whole point — `BoundViewHost` binds the raw auth id,
 * and `ViewProvider` derives the storage namespace itself, so a section that
 * passes an already-namespaced owner writes to a key no host ever reads.
 */
describe("SpotsPathsSection storage handoff", () => {
  const repository = {
    saveView: vi.fn(),
    savePreset: vi.fn(),
    deleteEntry: vi.fn(),
  } as unknown as RevisionedViewRepository;
  const library = { list: async () => [] } as unknown as IndexedViewLibrary;

  it("applies into the slot a signed-out production host reads on its next mount", async () => {
    const user = userEvent.setup();
    // Signed out: `BoundViewHost` will pass ownerId null.
    useAuthStore.setState({ user: null, session: null });
    // What `useViewLibrarySession` puts in the store for that same session.
    useViewLibrarySessionStore.setState({
      epoch: {},
      phase: "ready",
      ownerId: `anon:${getAnonymousInstallId()}`,
      repository,
      library,
      message: null,
    });
    useMapStore.setState({ layoutMode: "normal" });

    const settings = render(
      <QueryClientProvider client={client}>
        <SpotsPathsSection />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: /Open Spots & paths preferences/i }),
    );
    const slider = await screen.findByRole("slider", { name: "Maximum reports shown" });
    fireEvent.change(slider, { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await user.click(screen.getByRole("button", { name: /Apply to Standard map/i }));
    expect(
      screen.getByText(/will use these settings the next time you open it\./),
    ).toBeTruthy();
    settings.unmount();

    // Bound exactly as `BoundViewHost` binds a Standard map for this session:
    // the raw auth id (null), the family slot, and the default session-backed
    // working storage. Nothing is injected, so the handoff is observable.
    render(
      <QueryClientProvider client={client}>
        <ViewProvider ownerId={null} slot="normal">
          <MapHostProbe />
        </ViewProvider>
      </QueryClientProvider>,
    );
    const mapped = await screen.findByTestId("host-mapped");
    expect(mapped.textContent).toBe("10");
  });

  /**
   * The second event on the target: the map layout moves while the section is
   * open. The mount keeps editing the slot its seed came from — remounting
   * would silently discard unapplied edits — so the three things that have to
   * hold together are that the frozen slot is what gets written, that the
   * button names it, and that the user is told both that the map moved and
   * what Apply did.
   */
  it("keeps writing to the slot it was seeded from when the layout diverges, and still reports the outcome", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({ user: null, session: null });
    useViewLibrarySessionStore.setState({
      epoch: {},
      phase: "ready",
      ownerId: `anon:${getAnonymousInstallId()}`,
      repository,
      library,
      message: null,
    });
    useMapStore.setState({ layoutMode: "normal" });

    render(
      <QueryClientProvider client={client}>
        <SpotsPathsSection />
      </QueryClientProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: /Open Spots & paths preferences/i }),
    );
    const slider = await screen.findByRole("slider", { name: "Maximum reports shown" });
    fireEvent.change(slider, { target: { value: "10" } });
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    act(() => {
      useMapStore.setState({ layoutMode: "pro" });
    });

    expect(
      screen.getByText(/Your map switched to the Pro map while this section was open\./),
    ).toBeTruthy();
    // The label still names the slot that will actually be written, and Apply
    // is live again because what was applied no longer describes this map.
    const apply = screen.getByRole("button", {
      name: /Apply to Standard map/i,
    }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);

    await user.click(apply);

    // The frozen slot, never the new live one.
    expect(workingSlotKeys()).toEqual([
      workingSlotKey(`anon:${getAnonymousInstallId()}`, "normal"),
    ]);
    // Divergence must not swallow the outcome: both sentences are present.
    const status = screen.getByText(/Your map switched to the Pro map/);
    expect(status.textContent).toMatch(
      /will use these settings the next time you open it\./,
    );
  });
});
