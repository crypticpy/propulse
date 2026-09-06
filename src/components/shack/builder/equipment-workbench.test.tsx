import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StationProvider } from "@/components/station-ui";
import { ALL_EQUIPMENT_OPTIONS } from "@/lib/chainOrdering";
import { AddEquipmentPanel } from "./AddEquipmentPanel";
import { EquipmentDrawer } from "./EquipmentDrawer";

vi.mock("@/stores/shackStore", () => ({
  useUserRadios: () => [],
  useUserAntennas: () => [],
  useUserFeedlines: () => [
    {
      id: "cable-1",
      name: "Portable coax",
      feedlineType: "rg213",
      lengthFeet: 25,
    },
  ],
  useUserAccessories: () => [
    { id: "supply-1", name: "Bench supply", category: "power_supply" },
  ],
  useInlineComponents: () => [],
  useStationChains: () => [
    {
      nodes: [{ type: "feedline_run", feedlineRunId: "run-1" }],
      feedlineRuns: [{ id: "run-1", feedlineId: "cable-1" }],
    },
  ],
}));
afterEach(cleanup);
const wrap = (children: React.ReactNode) =>
  render(
    <MemoryRouter>
      <StationProvider>{children}</StationProvider>
    </MemoryRouter>,
  );

describe("equipment workbench presentation", () => {
  it("retains shared inventory selection and the existing insertion callback", () => {
    const add = vi.fn();
    wrap(
      <AddEquipmentPanel
        position={2}
        validTypes={ALL_EQUIPMENT_OPTIONS}
        onAdd={add}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Feedline 1 in inventory/ }),
    );
    expect(screen.getByText("Also used in a signal path")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find feedline in your inventory"), {
      target: { value: "coax" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add Portable coax to path" }),
    );
    expect(add).toHaveBeenCalledWith("feedline", "cable-1");
  });
  it("keeps empty valid categories actionable and links to their real inventory view", () => {
    const cancel = vi.fn();
    wrap(
      <AddEquipmentPanel
        position={0}
        validTypes={ALL_EQUIPMENT_OPTIONS.filter(
          (type) => type.inventoryKey === "antenna",
        )}
        onAdd={vi.fn()}
        onCancel={cancel}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: /Radio Not available/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: /Antenna Add your first item/ }),
    );
    const link = screen.getByRole("link", { name: "Open inventory" });
    expect(link.getAttribute("href")).toBe(
      "/shack?view=equipment&category=antennas",
    );
    fireEvent.click(link);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("preserves unwired shack gear, category navigation and labeled filtering", () => {
    wrap(<EquipmentDrawer activeChain={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Shack Gear (1)" }));
    expect(screen.getByText("Bench supply")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Manage inventory" })
        .getAttribute("href"),
    ).toBe("/shack?view=equipment&category=accessories");
    fireEvent.change(screen.getByLabelText("Search your equipment"), {
      target: { value: "absent" },
    });
    expect(screen.getByText("No matches")).toBeTruthy();
  });
});
