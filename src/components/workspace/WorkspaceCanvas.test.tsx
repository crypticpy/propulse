import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { canvasRulesFor } from "@/lib/workspace/canvasRules";
import { WIDGET_REGISTRY } from "@/lib/workspace/registry";
import { DEFAULT_PAGE_ID, useWorkspaceStore } from "@/stores/workspaceStore";
import { WorkspaceBar } from "./WorkspaceBar";
import { WorkspaceCanvas } from "./WorkspaceCanvas";

/** Every non-planned registry entry a workstation rail can dock, in registry order — 33 today, so the picker's 8-per-page paging spans 5 pages. */
const RAIL_COMPATIBLE_ENTRIES = Object.values(WIDGET_REGISTRY).filter(
  (entry) => entry.status !== "planned" && entry.densities.some((d) => canvasRulesFor("workstation").railDensities.includes(d)),
);

const originalState = useWorkspaceStore.getState();

/** Every weight-1, rail-eligible, non-hero registry id — used to fill workstation's 5+6+6=17 rail slots deterministically. */
const ONE_WEIGHT_RAIL_IDS = Object.values(WIDGET_REGISTRY)
  .filter(
    (entry) =>
      entry.weight === 1 &&
      !entry.canSpace &&
      entry.status !== "planned" &&
      (entry.densities.includes("work") || entry.densities.includes("glance")),
  )
  .map((entry) => entry.id);

describe("WorkspaceCanvas", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceStore.setState(originalState, true);
  });

  it("renders the space and every rail, each with its own ADD WIDGET button, on an empty page", () => {
    render(<WorkspaceCanvas />);

    expect(screen.getByTestId("workspace-space")).toBeTruthy();
    expect(screen.getByTestId("workspace-rail-left")).toBeTruthy();
    expect(screen.getByTestId("workspace-rail-right")).toBeTruthy();
    expect(screen.getByTestId("workspace-rail-bottom")).toBeTruthy();

    // One "+ ADD WIDGET" per empty slot: space + 3 rails.
    expect(screen.getAllByText("+ ADD WIDGET")).toHaveLength(4);
  });

  it("adding a hero-eligible widget places it in the space", () => {
    render(<WorkspaceCanvas />);

    const space = screen.getByTestId("workspace-space");
    fireEvent.click(within(space).getByText("+ ADD WIDGET"));

    const dialog = screen.getByRole("dialog");
    const heroEntry = WIDGET_REGISTRY.mapHero;
    fireEvent.click(within(dialog).getByText(heroEntry.title).closest(".workspace-add-widget-row")!.querySelector("button")!);

    expect(within(space).getByTestId("workspace-widget-mapHero")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the full-rail refusal sentence in the overlay, without placing the widget", () => {
    // Fill every rail (17 slots) directly through the store. Every rail's own
    // "+ ADD WIDGET" button disappears once it holds a widget (it only shows
    // on a completely empty rail), so the only surviving entry point for a
    // rail-only widget is the workspace bar's button (context "any" —
    // SpaceSlot's is hero-only and the space is still empty, so it would
    // just dock there instead of refusing).
    const oneWeightIds = ONE_WEIGHT_RAIL_IDS.slice(0, 17);
    expect(oneWeightIds).toHaveLength(17);
    for (const id of oneWeightIds) {
      expect(useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, id)).toEqual({ ok: true });
    }
    const overflowEntry = WIDGET_REGISTRY[ONE_WEIGHT_RAIL_IDS[17]];
    expect(overflowEntry.canSpace).toBe(false);

    render(
      <>
        <WorkspaceBar />
        <WorkspaceCanvas />
      </>,
    );

    fireEvent.click(screen.getByText("ADD WIDGET"));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog)
        .getByText(overflowEntry.title)
        .closest(".workspace-add-widget-row")!
        .querySelector("button")!,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/full/i);
    // Refused: the dialog stays open and the widget was never stored.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(useWorkspaceStore.getState().workspaces[0].pages[0].widgetIds).toEqual(oneWeightIds);
  });

  it("offers only workstation-compatible widgets — wall-only entries never appear in the picker", () => {
    render(<WorkspaceCanvas />);

    const leftRail = screen.getByTestId("workspace-rail-left");
    fireEvent.click(within(leftRail).getByText("+ ADD WIDGET"));
    const dialog = screen.getByRole("dialog");

    const wallOnlyTitles = [WIDGET_REGISTRY.pskStation.title, WIDGET_REGISTRY.reliability.title, WIDGET_REGISTRY.sdrScope.title];
    for (let guard = 0; guard < RAIL_COMPATIBLE_ENTRIES.length; guard++) {
      for (const title of wallOnlyTitles) {
        expect(within(dialog).queryByText(title)).toBeNull();
      }
      const next = within(dialog).getByText("NEXT ▶") as HTMLButtonElement;
      if (next.disabled) break;
      fireEvent.click(next);
    }
  });

  it("pages the picker 8 rows at a time, and NEXT reaches the last entry", () => {
    render(<WorkspaceCanvas />);

    const leftRail = screen.getByTestId("workspace-rail-left");
    fireEvent.click(within(leftRail).getByText("+ ADD WIDGET"));
    const dialog = screen.getByRole("dialog");

    const totalPages = Math.ceil(RAIL_COMPATIBLE_ENTRIES.length / 8);
    expect(totalPages).toBe(5);
    expect(within(dialog).getByText(`Page 1 of ${totalPages}`)).toBeTruthy();
    expect((within(dialog).getByText("◀ PREVIOUS") as HTMLButtonElement).disabled).toBe(true);

    for (let i = 1; i < totalPages; i++) {
      fireEvent.click(within(dialog).getByText("NEXT ▶"));
    }

    expect(within(dialog).getByText(`Page ${totalPages} of ${totalPages}`)).toBeTruthy();
    expect((within(dialog).getByText("NEXT ▶") as HTMLButtonElement).disabled).toBe(true);
    const lastEntry = RAIL_COMPATIBLE_ENTRIES[RAIL_COMPATIBLE_ENTRIES.length - 1];
    expect(within(dialog).getByText(lastEntry.title)).toBeTruthy();
  });

  it("HIDE LEFT RAIL collapses the left rail (drawer), and SHOW LEFT RAIL brings it back", () => {
    useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, "sun");
    render(<WorkspaceCanvas />);

    expect(screen.getByTestId("workspace-widget-sun")).toBeTruthy();

    fireEvent.click(screen.getByText("HIDE LEFT RAIL"));
    expect(screen.queryByTestId("workspace-widget-sun")).toBeNull();
    expect(screen.getByText("SHOW LEFT RAIL")).toBeTruthy();

    fireEvent.click(screen.getByText("SHOW LEFT RAIL"));
    expect(screen.getByTestId("workspace-widget-sun")).toBeTruthy();
    expect(screen.getByText("HIDE LEFT RAIL")).toBeTruthy();
  });
});
