import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { DXSpot } from "@/types/dxcluster";
import { PhonePage, PHONE_WORKSPACE_ID } from "./PhonePage";

const mocks = vi.hoisted(() => ({ cluster: vi.fn() }));
vi.mock("@/hooks/useDXCluster", () => ({ useDXCluster: mocks.cluster }));

const previousDX = useDXStore.getState();
const previousWorkspace = useWorkspaceStore.getState();

/**
 * Page 4 (`ContactScreen`, #660) reads `useSolarFlux`/`useKIndex`, which need
 * a `QueryClientProvider` ancestor — the only page here that does. Every
 * test renders through this helper so navigating to page 4 doesn't throw,
 * and stubs `fetch` so `useSolarResource`'s queryFn doesn't reach the
 * network in a unit test (pattern: `useBandActivity.test.tsx`).
 */
function renderPhone() {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no network in tests")));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PhonePage />
    </QueryClientProvider>,
  );
}

function spot(overrides: Partial<DXSpot>): DXSpot {
  return {
    id: overrides.id ?? "fixture",
    spotter: "W1AW",
    dx: "G4ABC",
    frequency: 14195,
    comment: "",
    time: new Date("2026-09-08T12:55:00Z"),
    band: "20m",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useWorkspaceStore.setState(previousWorkspace, true);
});

afterEach(() => {
  useDXStore.setState(previousDX, true);
  useWorkspaceStore.setState(previousWorkspace, true);
});

describe("PhonePage", () => {
  it("tapping a band row writes the shared cursor's band", () => {
    useDXStore.setState({ spots: [spot({ band: "20m" })] });
    renderPhone();

    fireEvent.click(screen.getByRole("button", { name: /20M/ }));

    expect(useOperatingStateStore.getState().cursor.band).toBe("20m");
  });

  it("switching bands clears a target picked on the previous band", () => {
    useDXStore.setState({
      spots: [spot({ band: "20m" }), spot({ id: "b", band: "40m" })],
    });
    useOperatingStateStore.getState().setBand("20m");
    useOperatingStateStore.getState().setTarget({
      callsign: "PY2ABC",
      grid: null,
      lat: null,
      lon: null,
      spotId: "a",
    });
    renderPhone();

    fireEvent.click(screen.getByRole("button", { name: /40M/ }));

    const { cursor } = useOperatingStateStore.getState();
    expect(cursor.band).toBe("40m");
    expect(cursor.target).toBeNull();
  });

  it("visibleBands filters the ladder to the phone's own setting", () => {
    useDXStore.setState({
      spots: [spot({ band: "20m" }), spot({ id: "b", band: "40m" })],
    });
    useWorkspaceStore.getState().setPhoneVisibleBands(["40m"]);
    renderPhone();

    expect(screen.queryByRole("button", { name: /20M/ })).toBeNull();
    expect(screen.getByRole("button", { name: /40M/ })).toBeTruthy();
  });

  it("flipping to the contacts page and tapping a spot calls selectSpot", () => {
    useDXStore.setState({
      spots: [spot({ id: "s1", dx: "PY2ABC", band: "20m" })],
    });
    useOperatingStateStore.getState().setBand("20m");
    renderPhone();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      screen.getByRole("tab", { selected: true }).getAttribute("aria-label"),
    ).toContain("CONTACTS");

    fireEvent.click(screen.getByRole("button", { name: /PY2ABC/ }));

    const target = useOperatingStateStore.getState().cursor.target;
    expect(target?.callsign).toBe("PY2ABC");
  });

  it("page dots flip pages, and PREVIOUS/NEXT are disabled at the ends", () => {
    renderPhone();

    const previous = screen.getByRole("button", {
      name: "Previous page",
    }) as HTMLButtonElement;
    const next = screen.getByRole("button", {
      name: "Next page",
    }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    const dots = screen.getAllByRole("tab");
    expect(dots).toHaveLength(4);

    fireEvent.click(dots[2]);
    expect(next.disabled).toBe(false);
    expect(
      screen.getByRole("tab", { selected: true }).getAttribute("aria-label"),
    ).toContain("SELECTION");

    fireEvent.click(dots[3]);
    expect(next.disabled).toBe(true);
    expect(
      screen.getByRole("tab", { selected: true }).getAttribute("aria-label"),
    ).toContain("CONTACT");
  });

  it("renders the band ladder and contact list without hanging when a spot is hidden", () => {
    // Regression for #685 P1: `useDXStore(selectVisibleSpots)` returns a
    // fresh array on every call once `hiddenSpotIds` is non-empty, which is
    // not a stable useSyncExternalStore snapshot and re-renders forever. If
    // either page still reads it directly, this `render` call hangs/throws
    // "Maximum update depth exceeded" instead of returning.
    useDXStore.setState({
      spots: [spot({ id: "a", band: "20m" }), spot({ id: "b", band: "40m" })],
      hiddenSpotIds: new Set(["b"]),
    });
    useOperatingStateStore.getState().setBand("20m");
    renderPhone();

    expect(screen.getByRole("button", { name: /20M/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("list", { name: /Spots on 20M/ })).toBeTruthy();
  });

  it("applies a foreign flipPage command for this workspace but ignores one for another", () => {
    renderPhone();
    expect(
      screen.getByRole("tab", { selected: true }).getAttribute("aria-label"),
    ).toContain("BAND LADDER");

    act(() => {
      useOperatingStateStore.getState().applyMessage({
        v: OPERATING_PROTOCOL_VERSION,
        senderId: "foreign-device",
        sentAt: Date.now(),
        kind: "command",
        command: {
          type: "flipPage",
          workspaceId: PHONE_WORKSPACE_ID,
          pageIndex: 2,
        },
      });
    });
    expect(
      screen.getByRole("tab", { selected: true }).getAttribute("aria-label"),
    ).toContain("SELECTION");

    act(() => {
      useOperatingStateStore.getState().applyMessage({
        v: OPERATING_PROTOCOL_VERSION,
        senderId: "foreign-device",
        sentAt: Date.now(),
        kind: "command",
        command: {
          type: "flipPage",
          workspaceId: "some-other-workspace",
          pageIndex: 0,
        },
      });
    });
    expect(
      screen.getByRole("tab", { selected: true }).getAttribute("aria-label"),
    ).toContain("SELECTION");
  });

  it("registers exactly one phone entry while mounted, never a workstation one, and unregisters on unmount", () => {
    const { unmount } = renderPhone();

    const registrations = Object.values(
      useOperatingStateStore.getState().registrations,
    );
    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.canvasType).toBe("phone");
    expect(registrations.some((r) => r.canvasType === "workstation")).toBe(
      false,
    );

    unmount();

    expect(useOperatingStateStore.getState().registrations).toEqual({});
  });

  // The phone canvas's page budget (`CANVAS_RULES.phone.phone`:
  // `maxWidgetsPerPage: 3`, `weightBudget: 3`) and its "refuses a 4th widget
  // honestly" invariant are already covered end-to-end by `autoDock`'s own
  // suite in `src/lib/workspace/workspace.test.ts` (the "phone page budget"
  // describe block) — outside this file's vitest run path, but exercised by
  // the full `npm run verify` gate. `PhonePage` builds its fixed three pages
  // directly, not via `autoDock`/the widget registry, so there is no
  // additional invariant of this kind to assert here.
});
