import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { HomeCustomizeDialog } from "./HomeCustomizeDialog";
import { useHomeLayout } from "@/hooks/useHomeLayout";
import { HOME_LAYOUT_DEFAULT, HOME_LAYOUT_KEY } from "@/lib/home/layout";

function Harness({ guest = false }: { guest?: boolean }) {
  const layout = useHomeLayout(false, guest);
  return <HomeCustomizeDialog open onClose={() => {}} layout={layout} guest={guest} isMobile={false} />;
}

const stored = () => JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY) ?? "null").desktop as string[];
const rows = () => within(screen.getByRole("list", { name: "Your layout" })).getAllByRole("listitem").map(row => row.getAttribute("aria-label"));

beforeEach(() => localStorage.clear());

it("lists the default layout in order with a full-width or tile badge", () => {
  render(<Harness />);
  expect(rows()).toEqual(["Bands now", "Next 24 hours on your band", "Solar outlook", "Local weather", "Daylight", "Your station & recent operating", "Moon", "DXpeditions", "World clocks"]);
  const moon = within(screen.getByRole("list", { name: "Your layout" })).getByLabelText("Moon");
  expect(within(moon).getByText("Tile")).toBeTruthy();
});

it("moves a panel up with the arrow button and persists the new order", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Move Moon up" }));
  expect(rows()[5]).toBe("Moon");
  expect(stored().indexOf("moon")).toBeLessThan(stored().indexOf("station"));
  expect(screen.getByRole("button", { name: "Move Bands now up" })).toHaveProperty("disabled", true);
});

it("reorders by native drag and drop", () => {
  render(<Harness />);
  const list = screen.getByRole("list", { name: "Your layout" });
  const dataTransfer = { effectAllowed: "", data: new Map<string, string>(), setData(key: string, value: string) { this.data.set(key, value); }, getData(key: string) { return this.data.get(key) ?? ""; } };
  fireEvent.dragStart(within(list).getByLabelText("Moon"), { dataTransfer });
  fireEvent.drop(within(list).getByLabelText("Bands now"), { dataTransfer });
  expect(rows()[0]).toBe("Moon");
  expect(stored()[0]).toBe("moon");
});

it("hides a panel and offers it again under Add panels", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Hide Moon" }));
  expect(rows()).not.toContain("Moon");
  expect(stored()).not.toContain("moon");
  fireEvent.click(screen.getByRole("button", { name: "Add Moon to your dashboard" }));
  expect(rows().at(-1)).toBe("Moon");
  expect(stored().at(-1)).toBe("moon");
});

it("adds an off-dashboard panel to the end of the layout", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add Tides to your dashboard" }));
  expect(rows().at(-1)).toBe("Tides");
  expect(stored()).toEqual([...HOME_LAYOUT_DEFAULT, "tides"]);
});

it("restores the default list with Reset to default", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Hide Moon" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Tides to your dashboard" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
  expect(stored()).toEqual([...HOME_LAYOUT_DEFAULT]);
  expect(rows().at(-1)).toBe("World clocks");
});

it("keeps signed-in-only panels out of a guest's lists and out of storage", () => {
  render(<Harness guest />);
  expect(rows()).not.toContain("Your station & recent operating");
  expect(screen.queryByRole("button", { name: "Add This day in history to your dashboard" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Move Moon up" }));
  expect(rows()[4]).toBe("Moon");
  expect(localStorage.getItem(HOME_LAYOUT_KEY)).toBeNull();
});
