import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createViewConfiguration } from "@/lib/views/defaults";
import {
  applyPresetRecipe,
  getActivityRecipe,
  getDisplayRecipe,
} from "@/lib/views/presets";
import { PresetPreviewDialog } from "./PresetPreviewDialog";
import { ALL_FEEDS_AVAILABLE, WSJTX_UNAVAILABLE } from "./testing";

describe("PresetPreviewDialog", () => {
  it("renders nothing when open with no recipe/result yet", () => {
    render(
      <PresetPreviewDialog
        open={false}
        recipe={null}
        result={null}
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("previews an activity recipe: field changes, layout-preserved note, source availability", async () => {
    const user = userEvent.setup();
    const base = createViewConfiguration("pro");
    const recipe = getActivityRecipe("activity-ft8-v1");
    const result = applyPresetRecipe(recipe, base, { feedAvailability: ALL_FEEDS_AVAILABLE });
    const onCancel = vi.fn();
    const onApply = vi.fn();

    render(
      <PresetPreviewDialog
        open
        recipe={recipe}
        result={result}
        onCancel={onCancel}
        onApply={onApply}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "FT8 monitoring" });
    expect(within(dialog).getByText("Activity recipe")).toBeTruthy();
    expect(
      within(dialog).getByText(/layout, projection and camera stay exactly as they are/i),
    ).toBeTruthy();

    const changeList = within(dialog).getByRole("list", { name: "Changes from FT8 monitoring" });
    expect(within(changeList).getByText("All modes")).toBeTruthy();
    expect(within(changeList).getByText("Specific modes")).toBeTruthy();
    expect(within(changeList).getByText("Include unknown modes")).toBeTruthy();
    expect(within(changeList).getByText("Spot age limit")).toBeTruthy();
    expect(within(changeList).getByText("Spot limit")).toBeTruthy();

    expect(within(dialog).getByText(/PSKReporter is enabled, authorized, and connected/)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledOnce();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("presents a display template as a full view replacement", () => {
    const base = createViewConfiguration("pro");
    const recipe = getDisplayRecipe("display-hamclock-v1");
    const result = applyPresetRecipe(recipe, base, { feedAvailability: ALL_FEEDS_AVAILABLE });

    render(
      <PresetPreviewDialog
        open
        recipe={recipe}
        result={result}
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "HamClock Wall" });
    expect(within(dialog).getByText("Display template")).toBeTruthy();
    expect(within(dialog).getByText(/explicit full view replacement/i)).toBeTruthy();
  });

  it("presents a no-op application as a safe, change-free confirm", () => {
    const recipe = getActivityRecipe("activity-balanced-v1");
    const base = createViewConfiguration("pro");
    base.spots = recipe.spots;
    const result = applyPresetRecipe(recipe, base, { feedAvailability: ALL_FEEDS_AVAILABLE });
    expect(result.changes).toEqual([]);

    render(
      <PresetPreviewDialog
        open
        recipe={recipe}
        result={result}
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Balanced activity" });
    expect(
      within(dialog).getByText(/matches your current settings.*changes nothing/i),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Apply (no changes)" })).toBeTruthy();
  });

  it("never asserts a substituted source or a started connection when a feed is unavailable", () => {
    const base = createViewConfiguration("pro");
    const recipe = getActivityRecipe("activity-ft8-v1");
    const result = applyPresetRecipe(recipe, base, { feedAvailability: WSJTX_UNAVAILABLE });

    render(
      <PresetPreviewDialog
        open
        recipe={recipe}
        result={result}
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "FT8 monitoring" });
    const sourceSection = within(dialog).getByRole("list", { name: "Source availability" });
    expect(
      within(sourceSection).getByText(/no substitute feed is selected and no connection is started/),
    ).toBeTruthy();
  });
});
