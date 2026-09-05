import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useHamClockWidgetConfigStore } from "@/stores/hamclockWidgetConfigStore";
import { HAMCLOCK_WALL_PAGES } from "../pages";
import { WALL_TILES } from "../tiles";
import { PagesTilesTab } from "./PagesTilesTab";

describe("PagesTilesTab", () => {
  beforeEach(() => {
    localStorage.removeItem("propulse-hamclock-widget-config");
    useHamClockWidgetConfigStore.setState({ widgets: {} });
  });

  it("lists every shipped page with its title", () => {
    render(<PagesTilesTab />);
    for (const page of HAMCLOCK_WALL_PAGES) {
      expect(screen.getByText(page.title)).toBeTruthy();
    }
  });

  it("lists every tile a page carries, by its wall title", () => {
    render(<PagesTilesTab />);
    const spotsPage = HAMCLOCK_WALL_PAGES.find((page) => page.id === "spots")!;
    for (const id of [...spotsPage.left, ...spotsPage.right]) {
      expect(screen.getAllByText(WALL_TILES[id].title).length).toBeGreaterThan(0);
    }
  });

  it("shows an OPTIONS gear only on tiles that carry a config, and opens that tile's panel", () => {
    render(<PagesTilesTab />);
    // recentContacts is the reference registration (B5); nothing else has one yet.
    const optionsButtons = screen.getAllByRole("button", { name: "OPTIONS" });
    expect(optionsButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(optionsButtons[0]);
    expect(screen.getByText("Rows shown")).toBeTruthy();
  });

  it("does not add a picker for editing rail assignment (that is B4)", () => {
    render(<PagesTilesTab />);
    expect(screen.queryByRole("button", { name: /add tile/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save as preset/i })).toBeNull();
  });
});
