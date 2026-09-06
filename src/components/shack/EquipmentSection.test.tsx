import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useShackStore } from "@/stores/shackStore";
import { StationProvider } from "@/components/station-ui";
import { EquipmentSection } from "./EquipmentSection";

vi.mock("@/components/settings/RadioManager", () => ({
  RadioManager: () => (
    <button onClick={() => useShackStore.getState().addRadio("icom-ic7300")}>
      Save fixture radio
    </button>
  ),
}));
vi.mock("./AntennaManager", () => ({
  AntennaManager: () => <div>Antenna editor</div>,
}));
vi.mock("./FeedlineManager", () => ({
  FeedlineManager: () => <div>Feedline editor</div>,
}));
vi.mock("./AccessoryManager", () => ({
  AccessoryManager: () => <div>Accessory editor</div>,
}));
vi.mock("./InlineComponentManager", () => ({
  InlineComponentManager: () => <div>Inline editor</div>,
}));
const initial = useShackStore.getState();
beforeEach(() =>
  useShackStore.setState({
    ...initial,
    radios: [],
    antennas: [],
    feedlines: [],
    accessories: [],
    inlineComponents: [],
  }),
);

describe("inventory and guided setup navigation", () => {
  it("keeps guided setup open after saving the first radio and can continue to antennas", () => {
    render(
      <StationProvider>
        <EquipmentSection />
      </StationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save fixture radio" }));
    expect(useShackStore.getState().radios).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Add Your Radios" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Set Up Antennas" }),
    ).toBeTruthy();
    expect(screen.getByText("Antenna editor")).toBeTruthy();
  });
  it("honors a specific category link even before any gear has been added", () => {
    render(
      <StationProvider>
        <EquipmentSection initialCategory="feedlines" />
      </StationProvider>,
    );
    expect(screen.getByText("Feedline editor").closest("[hidden]")).toBeNull();
    expect(
      screen.getByText("Antenna editor").closest("[hidden]"),
    ).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Add Your Radios" }),
    ).toBeNull();
  });
});
