import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useShackStore } from "@/stores/shackStore";
import { StationProvider } from "@/components/station-ui";
import { EquipmentSection } from "./EquipmentSection";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

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

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back in history</button>
      <button onClick={() => navigate(1)}>Forward in history</button>
    </>
  );
}
function renderInventory(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StationProvider>
        <EquipmentSection />
        <NavigationProbe />
      </StationProvider>
    </MemoryRouter>,
  );
}

describe("inventory and guided setup navigation", () => {
  it("keeps guided setup open after saving the first radio and can continue to antennas", () => {
    renderInventory("/shack?view=equipment");
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
    renderInventory("/shack?view=equipment&category=feedlines");
    expect(screen.getByText("Feedline editor").closest("[hidden]")).toBeNull();
    expect(
      screen.getByText("Antenna editor").closest("[hidden]"),
    ).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Add Your Radios" }),
    ).toBeNull();
  });
  it("keeps category buttons, reload URLs and Back/Forward navigation in agreement", async () => {
    const first = renderInventory(
      "/shack?view=equipment&category=feedlines&keep=yes",
    );
    fireEvent.click(screen.getByRole("button", { name: /^Antennas/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain(
        "category=antennas",
      ),
    );
    const selectedUrl = screen.getByTestId("location").textContent!;
    expect(selectedUrl).toContain("keep=yes");
    expect(screen.getByText("Antenna editor").closest("[hidden]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back in history" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /^Feedlines/ })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Forward in history" }));
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /^Antennas/ })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    first.unmount();
    renderInventory(selectedUrl);
    expect(
      screen
        .getByRole("button", { name: /^Antennas/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^All gear/ }));
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/shack?view=equipment&keep=yes",
      ),
    );
    expect(screen.getByText("Feedline editor").closest("[hidden]")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Add Your Radios" }),
    ).toBeNull();
  });
});
