import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOperatingStore } from "@/stores/operatingStore";
import { BandModeModal } from "./BandModeModalContent";

// BandModeModalContent renders a large propagation-tinted band/mode grid via
// useBandConditionsTint, which delegates to react-query-backed solar hooks.
// Mocking it directly (rather than wrapping in a QueryClientProvider) matches
// the pattern used by PredictionsCard.test.tsx for the same dependency chain.
vi.mock("@/hooks/useBandConditionsTint", () => ({
  useBandConditionsTint: () => ({ tints: {}, statuses: {} }),
}));

const renderModal = (onClose = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={["/map"]}>
      <BandModeModal isOpen onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
};

beforeEach(() => {
  useOperatingStore.setState({
    presets: [],
    bandModeHistory: [],
    watchedBands: [],
    contestLocked: false,
    contestSessionId: null,
  });
});

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  renderModal();
  const panel = screen.getByRole("dialog", { name: "Band & Mode" });
  const heading = screen.getByRole("heading", { name: "Band & Mode" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
});

it("is a modal dialog that AccessibleDialog closes on Escape when not mid-edit", () => {
  const onClose = renderModal();
  const panel = screen.getByRole("dialog", { name: "Band & Mode" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("renders nothing when isOpen is false", () => {
  render(
    <MemoryRouter initialEntries={["/map"]}>
      <BandModeModal isOpen={false} onClose={vi.fn()} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Escape cancels the inline 'add preset' editor instead of closing the dialog (#773 onEscape)", () => {
  const onClose = renderModal();

  fireEvent.click(screen.getByRole("button", { name: "Presets" }));
  fireEvent.click(
    screen.getByRole("button", { name: "+ Save this as preset" }),
  );
  const input = screen.getByPlaceholderText("Name this preset...");
  fireEvent.change(input, { target: { value: "My QSY spot" } });

  fireEvent.keyDown(document, { key: "Escape" });

  // Dialog stays open and onClose was never called...
  expect(onClose).not.toHaveBeenCalled();
  expect(
    screen.getByRole("dialog", { name: "Band & Mode" }),
  ).toBeTruthy();
  // ...but the inline editor itself was cancelled: the input is gone and the
  // "+ Save this as preset" trigger is back.
  expect(screen.queryByPlaceholderText("Name this preset...")).toBeNull();
  expect(
    screen.getByRole("button", { name: "+ Save this as preset" }),
  ).toBeTruthy();
});

describe("band tile watch toggle is not nested in the band-select button (#816)", () => {
  it("keeps the watch toggle out of the band-select button's DOM subtree", () => {
    renderModal();
    const toggle = screen.getByRole("button", { name: "Watch 40m" });

    // Before the fix this button was a child of the band-select <button>,
    // which is invalid HTML (a button nested in a button) and folds
    // "Watch 40m" into the outer button's computed accessible name. Walking
    // up from the toggle's parent must not hit any enclosing <button>.
    expect(toggle.parentElement?.closest("button")).toBeNull();
  });

  it("still updates watchedBands on click, and never moves the selected band", () => {
    renderModal();
    const toggle = screen.getByRole("button", { name: "Watch 40m" });

    fireEvent.click(toggle);

    expect(useOperatingStore.getState().watchedBands).toContain("40m");
    expect(useOperatingStore.getState().manualBand).toBe("20m");

    const unwatch = screen.getByRole("button", { name: "Unwatch 40m" });
    fireEvent.click(unwatch);
    expect(useOperatingStore.getState().watchedBands).not.toContain("40m");
  });

  it("hides the unwatched toggle with pointer-events-none so an invisible tap can't fire it", () => {
    renderModal();
    const toggle = screen.getByRole("button", { name: "Watch 40m" });
    const hiddenClasses = toggle.className.split(/\s+/);
    expect(hiddenClasses).toContain("pointer-events-none");

    fireEvent.click(toggle);
    const watchedToggle = screen.getByRole("button", { name: "Unwatch 40m" });
    const watchedClasses = watchedToggle.className.split(/\s+/);
    expect(watchedClasses).not.toContain("pointer-events-none");
  });

  // jsdom evaluates no media query and paints no opacity, so this reads the
  // class list. That is the whole assertion available here: the reachability
  // it stands for can only be confirmed on a real touch device.
  it("keeps the unwatched toggle reachable without hover and by keyboard", () => {
    renderModal();
    const classes = screen
      .getByRole("button", { name: "Watch 40m" })
      .className.split(/\s+/);

    // Hover reveal (fine-pointer default) stays intact...
    expect(classes).toContain("group-hover:opacity-60");
    expect(classes).toContain("group-hover:pointer-events-auto");
    // ...a true no-hover device gets it permanently visible and tappable.
    // This is the only UI in the app that calls addWatchedBand, so without
    // it a touch-only user cannot add a watched band at all.
    expect(classes).toContain("[@media(hover:none)]:opacity-60");
    expect(classes).toContain("[@media(hover:none)]:pointer-events-auto");
    // Not any-pointer:coarse: that pins the dot open on a touch laptop for
    // someone driving the mouse (the reversed call in #683).
    expect(
      classes.filter((c) => c.includes("any-pointer")),
    ).toHaveLength(0);
    // Tab still lands on this button while it is pointer-events-none, so it
    // has to become visible when it does.
    expect(classes).toContain("focus-visible:opacity-100");
  });

  // Composition guard, NOT coverage of #816: this assertion stays green even
  // with the nested-button structure restored, because handleBandSelect
  // never touches watchedBands regardless of nesting — clicking the outer
  // band button was never routed through the toggle's handler either way.
  // Its job is to prove the band-select control is reachable by role/name
  // and that toggling it is not wired to the band click, guarding against a
  // future implementation mistake rather than the historical bug.
  it("composition guard: clicking the band-select button does not change watch state", () => {
    renderModal();
    const bandButton = screen.getByRole("button", { name: /^40m/ });

    fireEvent.click(bandButton);

    expect(useOperatingStore.getState().watchedBands).not.toContain("40m");
  });
});
