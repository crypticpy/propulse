import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  ALL_FEEDS_AVAILABLE,
  createTestView,
  WSJTX_UNAVAILABLE,
} from "@/components/settings/spots/testing";
import { useSpotsPreferences } from "@/components/settings/spots/useSpotsPreferences";
import type { SpotsPreferencesController } from "@/components/settings/spots/types";
import { defaultFilters } from "@/components/settings/spots/modeSelection";
import { expandModeCategory } from "@/lib/spots/presentation";
import type { FeedAvailability } from "@/lib/views/presets";
import type { ViewScopedStoreHandle } from "@/lib/views/runtime";
import { ActivitySection } from "./ActivitySection";

function Harness({
  view,
  feedAvailability,
}: {
  view: ViewScopedStoreHandle;
  feedAvailability?: readonly FeedAvailability[];
}) {
  const controller: SpotsPreferencesController = useSpotsPreferences({
    view,
    feedAvailability,
  });
  return <ActivitySection controller={controller} />;
}

describe("ActivitySection", () => {
  it("renders All modes by default and explains the empty selection", () => {
    const handle = createTestView();
    render(<Harness view={handle.view} />);

    const allCheckbox = screen.getByRole("checkbox", { name: "All modes" });
    expect(allCheckbox).toHaveProperty("checked", true);
    expect(
      screen.getByText("No specific modes chosen — showing all modes."),
    ).toBeTruthy();
    handle.dispose();
  });

  it("leaves Digital partial after unchecking FT8, with explicit members recorded", async () => {
    // Modes start at "All", where every category checkbox reads "on" (categoryState
    // treats All as every category fully selected). Isolating Digital as the sole
    // selected category means deselecting the other two — the tri-state checkbox
    // equivalent of "select only Digital" from a fully-selected starting point.
    const user = userEvent.setup();
    const handle = createTestView();
    render(<Harness view={handle.view} />);

    await user.click(screen.getByRole("checkbox", { name: "Phone / Voice category" }));
    await user.click(screen.getByRole("checkbox", { name: "CW category" }));

    const digitalCheckbox = screen.getByRole("checkbox", {
      name: "Digital category",
    }) as HTMLInputElement;
    expect(digitalCheckbox.checked).toBe(true);
    expect(digitalCheckbox.indeterminate).toBe(false);

    await user.click(screen.getByRole("checkbox", { name: "FT8" }));

    expect(digitalCheckbox.indeterminate).toBe(true);
    expect(digitalCheckbox.getAttribute("aria-checked")).toBe("mixed");

    const modes = handle.view.store.getState().config.spots.filters.modes;
    expect(modes.all).toBe(false);
    expect(modes.categories).not.toContain("digital");
    const digitalMembers = expandModeCategory("digital");
    for (const member of digitalMembers) {
      if (member === "FT8") {
        expect(modes.modes).not.toContain("FT8");
      } else {
        expect(modes.modes).toContain(member);
      }
    }
    handle.dispose();
  });

  it("turns Include unknown off for a specific selection and back on for All", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    render(<Harness view={handle.view} />);

    expect(
      screen.getByRole("checkbox", { name: "Include unknown modes" }),
    ).toHaveProperty("checked", true);

    await user.click(screen.getByRole("checkbox", { name: "SSB" }));
    expect(
      handle.view.store.getState().config.spots.filters.modes.includeUnknown,
    ).toBe(false);
    expect(
      screen.getByRole("checkbox", { name: "Include unknown modes" }),
    ).toHaveProperty("checked", false);

    await user.click(screen.getByRole("checkbox", { name: "All modes" }));
    expect(
      handle.view.store.getState().config.spots.filters.modes.includeUnknown,
    ).toBe(true);
    expect(
      screen.getByRole("checkbox", { name: "Include unknown modes" }),
    ).toHaveProperty("checked", true);
    handle.dispose();
  });

  it("clears filters to default without touching grouping or path motion", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    render(<Harness view={handle.view} />);

    await user.click(screen.getByRole("checkbox", { name: "20m" }));
    await user.click(screen.getByRole("checkbox", { name: "Follow radio" }));

    const beforeClear = handle.view.store.getState().config.spots;
    handle.view.updateWorkingView({
      spots: {
        ...beforeClear,
        grouping: { ...beforeClear.grouping, minGroupSize: 11 },
        paths: { ...beforeClear.paths, animate: "selected-only" },
      },
    });

    const clearButton = screen.getByRole("button", { name: "Clear filters" });
    expect(clearButton).not.toHaveProperty("disabled", true);
    await user.click(clearButton);

    const state = handle.view.store.getState();
    expect(state.config.spots.filters).toEqual(defaultFilters());
    expect(state.config.context.followRadio).toBe(false);
    expect(state.config.spots.grouping.minGroupSize).toBe(11);
    expect(state.config.spots.paths.animate).toBe("selected-only");
    handle.dispose();
  });

  it("shows the WSJT-X unavailable explanation without offering to connect, and still records the selection", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    render(<Harness view={handle.view} feedAvailability={WSJTX_UNAVAILABLE} />);

    expect(
      screen.getByText(/WSJT-X is not enabled and authorized/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /connect/i })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "WSJT-X" }));
    expect(
      handle.view.store.getState().config.spots.filters.sources,
    ).toContain("WSJT-X");
    handle.dispose();
  });

  it("keeps two views behaviourally isolated", async () => {
    const user = userEvent.setup();
    const handleA = createTestView();
    const handleB = createTestView();
    render(
      <div>
        <div data-testid="view-a">
          <Harness view={handleA.view} feedAvailability={ALL_FEEDS_AVAILABLE} />
        </div>
        <div data-testid="view-b">
          <Harness view={handleB.view} feedAvailability={ALL_FEEDS_AVAILABLE} />
        </div>
      </div>,
    );

    const before = JSON.stringify(handleB.view.store.getState().config);

    const viewA = within(screen.getByTestId("view-a"));
    await user.click(viewA.getByRole("checkbox", { name: "SSB" }));

    expect(JSON.stringify(handleB.view.store.getState().config)).toBe(before);
    handleA.dispose();
    handleB.dispose();
  });

  it("writes spot-limit and max-age sliders within their documented ranges", async () => {
    const handle = createTestView();
    render(<Harness view={handle.view} />);

    fireEvent.change(screen.getByLabelText("Maximum report age"), {
      target: { value: "45" },
    });
    fireEvent.change(screen.getByLabelText("Maximum reports shown"), {
      target: { value: "120" },
    });

    // Slider commits are debounced (N4 perf fix); wait for the trailing-edge
    // write to land in the store instead of asserting synchronously.
    await waitFor(() => {
      const filters = handle.view.store.getState().config.spots.filters;
      expect(filters.maxAgeMinutes).toBe(45);
      expect(filters.spotLimit).toBe(120);
    });
    handle.dispose();
  });

  it("is keyboard operable for a category checkbox and the Clear filters button", async () => {
    const user = userEvent.setup();
    const handle = createTestView();
    render(<Harness view={handle.view} />);

    // Modes start at "All", so the CW category checkbox reads checked; pressing
    // space deselects it, leaving Phone and CW's siblings (Phone, Digital) selected.
    const cwCheckbox = screen.getByRole("checkbox", {
      name: "CW category",
    }) as HTMLInputElement;
    expect(cwCheckbox.checked).toBe(true);
    cwCheckbox.focus();
    expect(document.activeElement).toBe(cwCheckbox);
    await user.keyboard(" ");
    const categories =
      handle.view.store.getState().config.spots.filters.modes.categories;
    expect(categories).toEqual(expect.arrayContaining(["phone", "digital"]));
    expect(categories).not.toContain("cw");

    const clearButton = screen.getByRole("button", { name: "Clear filters" });
    clearButton.focus();
    expect(document.activeElement).toBe(clearButton);
    await user.keyboard("{Enter}");
    expect(handle.view.store.getState().config.spots.filters).toEqual(
      defaultFilters(),
    );
    handle.dispose();
  });
});
