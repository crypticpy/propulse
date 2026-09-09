import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WIDGET_REGISTRY } from "@/lib/workspace/registry";
import { DEFAULT_PAGE_ID, useWorkspaceStore } from "@/stores/workspaceStore";
import { WorkspaceCanvas } from "./WorkspaceCanvas";

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
    // Fill every rail (17 slots) directly through the store, leaving the
    // space open so the widget under test can only be attempted there.
    const oneWeightIds = ONE_WEIGHT_RAIL_IDS.slice(0, 17);
    expect(oneWeightIds).toHaveLength(17);
    for (const id of oneWeightIds) {
      expect(useWorkspaceStore.getState().addWidget(DEFAULT_PAGE_ID, id)).toEqual({ ok: true });
    }
    const overflowEntry = WIDGET_REGISTRY[ONE_WEIGHT_RAIL_IDS[17]];

    render(<WorkspaceCanvas />);

    const space = screen.getByTestId("workspace-space");
    fireEvent.click(within(space).getByText("+ ADD WIDGET"));

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
