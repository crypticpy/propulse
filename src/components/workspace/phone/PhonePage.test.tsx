import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDXStore } from "@/stores/dxStore";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { DXSpot } from "@/types/dxcluster";
import { PhonePage } from "./PhonePage";

const mocks = vi.hoisted(() => ({ cluster: vi.fn() }));
vi.mock("@/hooks/useDXCluster", () => ({ useDXCluster: mocks.cluster }));

const previousDX = useDXStore.getState();
const previousWorkspace = useWorkspaceStore.getState();

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
    render(<PhonePage />);

    fireEvent.click(screen.getByRole("button", { name: /20M/ }));

    expect(useOperatingStateStore.getState().cursor.band).toBe("20m");
  });

  it("visibleBands filters the ladder to the phone's own setting", () => {
    useDXStore.setState({ spots: [spot({ band: "20m" }), spot({ id: "b", band: "40m" })] });
    useWorkspaceStore.getState().setPhoneVisibleBands(["40m"]);
    render(<PhonePage />);

    expect(screen.queryByRole("button", { name: /20M/ })).toBeNull();
    expect(screen.getByRole("button", { name: /40M/ })).toBeTruthy();
  });

  it("flipping to the contacts page and tapping a spot calls selectSpot", () => {
    useDXStore.setState({ spots: [spot({ id: "s1", dx: "PY2ABC", band: "20m" })] });
    useOperatingStateStore.getState().setBand("20m");
    render(<PhonePage />);

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("tab", { selected: true }).getAttribute("aria-label")).toContain("CONTACTS");

    fireEvent.click(screen.getByRole("button", { name: /PY2ABC/ }));

    const target = useOperatingStateStore.getState().cursor.target;
    expect(target?.callsign).toBe("PY2ABC");
  });

  it("page dots flip pages, and PREVIOUS/NEXT are disabled at the ends", () => {
    render(<PhonePage />);

    const previous = screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    const dots = screen.getAllByRole("tab");
    expect(dots).toHaveLength(3);

    fireEvent.click(dots[2]);
    expect(next.disabled).toBe(true);
    expect(screen.getByRole("tab", { selected: true }).getAttribute("aria-label")).toContain("SELECTION");
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
