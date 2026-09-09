import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useUserStore } from "@/stores/userStore";
import { RadioManager } from "./RadioManager";

// EquipmentCard (rendered once an instance is added) uses useOperatorRank ->
// useLogbookStats -> useLogbook, which does a real IndexedDB read whose async
// resolution can fire after jsdom teardown between tests in this file
// (unhandled `window is not defined` from useLogbook.ts's setLoading, since
// useStationQsoIndex's own shared-index scan is a separate, already-safe
// path). Stub it synchronously, matching the DXSpotList.test.tsx convention.
vi.mock("@/hooks/useLogbook", () => ({
  useLogbook: () => ({
    entries: [],
    loading: false,
    error: null,
    isWorked: () => false,
    getWorkedBands: () => [],
    getWorkedModes: () => [],
  }),
}));

describe("RadioManager live regions (#754/#772)", () => {
  beforeEach(() => {
    useUserStore.getState().resetPreferences();
    // EquipmentCard (rendered once an instance is added) reads
    // prefers-reduced-motion for its flip transition; jsdom has no
    // matchMedia implementation.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts the no-matching-radios region empty, then mutates the same node once a search finds nothing", () => {
    render(
      <MemoryRouter>
        <RadioManager />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add Radio Instance" }));
    const dialog = screen.getByRole("dialog", { name: "Add Radio" });

    const before = within(dialog).getByRole("status");
    expect(before.textContent).toBe("");

    fireEvent.change(
      within(dialog).getByLabelText("Search radio catalog and custom definitions"),
      { target: { value: "zzz-not-a-real-radio-zzz" } },
    );

    const after = within(dialog).getByRole("status");
    expect(after).toBe(before);
    expect(after.textContent).toContain("No matching radios");
  });

  it("mounts the instance-error region empty, then mutates the same node once an invalid power limit is saved", () => {
    render(
      <MemoryRouter>
        <RadioManager />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Add Radio Instance" }));
    const addDialog = screen.getByRole("dialog", { name: "Add Radio" });
    fireEvent.click(
      within(addDialog).getAllByRole("button", { name: /^Add instance of/ })[0],
    );

    const instanceDialog = screen.getByRole("dialog", { name: "Radio Instance" });
    const before = within(instanceDialog).getByRole("alert");
    expect(before.textContent).toBe("");

    fireEvent.change(within(instanceDialog).getByLabelText("TX power limit (W)"), {
      target: { value: "-5" },
    });
    fireEvent.click(
      within(instanceDialog).getByRole("button", { name: "Save radio details" }),
    );

    const after = within(instanceDialog).getByRole("alert");
    expect(after).toBe(before);
    expect(after.textContent).toBe("Power limit must be a positive number");
  });

  it("mounts the custom-radio-error region empty, then mutates the same node once an incomplete definition is saved", () => {
    render(
      <MemoryRouter>
        <RadioManager />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Custom Definition" }));
    const dialog = screen.getByRole("dialog", { name: "New Custom Radio" });

    const before = within(dialog).getByRole("alert");
    expect(before.textContent).toBe("");

    // Defaults leave displayName/manufacturer/model blank — saving as-is
    // fails validation without any further input.
    fireEvent.click(within(dialog).getByRole("button", { name: "Save custom definition" }));

    const after = within(dialog).getByRole("alert");
    expect(after).toBe(before);
    expect(after.textContent).toBe("Custom radio name is required.");
  });
});
