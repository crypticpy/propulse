import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
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
