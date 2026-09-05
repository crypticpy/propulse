import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockRail } from "./HamClockRail";

vi.mock("./tiles", () => ({
  WALL_TILES: {
    cluster: { title: "DX cluster", Component: () => <div>Cluster Tile</div> },
    bandActivity: {
      title: "Band activity",
      Component: () => <div>Band Activity Tile</div>,
    },
    recentContacts: {
      title: "Recent contacts",
      Component: () => <div>Recent Contacts Tile</div>,
    },
    weather: { title: "Local weather", Component: () => <div>Weather Tile</div> },
    alerts: {
      title: "Weather alerts",
      Component: () => <div>Alerts Tile</div>,
    },
  },
}));

beforeEach(() => {
  useHamClockDisplayStore.getState().resetDisplay();
});

describe("HamClockRail (B4/HW-27)", () => {
  it("renders the operator's own railLayout composition for this page and side, not the shipped one", () => {
    useHamClockDisplayStore.setState({
      railLayout: {
        left: [{ pageId: "spots", tileIds: ["cluster"] }],
        right: [{ pageId: "spots", tileIds: ["weather"] }],
      },
    });
    render(<HamClockRail side="left" pageIndex={0} label="Left tile rail" />);
    expect(screen.getByText("Cluster Tile")).toBeTruthy();
    // The shipped left/spots composition (bandActivity, recentContacts) is
    // not what was configured, so it must not render.
    expect(screen.queryByText("Band Activity Tile")).toBeNull();
    expect(screen.queryByText("Recent Contacts Tile")).toBeNull();
  });

  it("renders an empty rail for a page/side the operator's layout does not define", () => {
    useHamClockDisplayStore.setState({
      railLayout: {
        left: [],
        right: [{ pageId: "spots", tileIds: ["cluster"] }],
      },
    });
    const { container } = render(
      <HamClockRail side="left" pageIndex={0} label="Left tile rail" />,
    );
    expect(container.querySelector(".hc-rail-left")?.children).toHaveLength(0);
  });

  it("shows a pinned tile at the top of its rail without duplicating it", () => {
    useHamClockDisplayStore.setState({
      pinnedTile: { side: "left", tileId: "weather" },
      railLayout: {
        left: [{ pageId: "spots", tileIds: ["weather", "cluster"] }],
        right: [],
      },
    });
    const { container } = render(
      <HamClockRail side="left" pageIndex={0} label="Left tile rail" />,
    );
    const rendered = Array.from(container.querySelectorAll("div")).map(
      (el) => el.textContent,
    );
    expect(rendered).toEqual(["Weather Tile", "Cluster Tile"]);
  });

  it("does not show a rail's pinned tile on the other rail", () => {
    useHamClockDisplayStore.setState({
      pinnedTile: { side: "left", tileId: "weather" },
      railLayout: {
        left: [],
        right: [{ pageId: "spots", tileIds: ["cluster"] }],
      },
    });
    render(<HamClockRail side="right" pageIndex={0} label="Right tile rail" />);
    expect(screen.queryByText("Weather Tile")).toBeNull();
    expect(screen.getByText("Cluster Tile")).toBeTruthy();
  });

  it("resolves an out-of-range pageIndex against the layout's own page count, not the fixed shipped catalogue (review pass after B4)", () => {
    // A single-page layout (a Living-room-style preset). Before this fix,
    // pageIndex resolved against the fixed five-page shipped catalogue, so a
    // stale index of 1 would look up the catalogue's second page ("solar")
    // instead of clamping into this layout's only page ("spots") — leaving
    // the rail empty even though a page is actually defined.
    useHamClockDisplayStore.setState({
      railLayout: {
        left: [{ pageId: "spots", tileIds: ["cluster"] }],
        right: [{ pageId: "spots", tileIds: ["weather"] }],
      },
    });
    render(<HamClockRail side="left" pageIndex={1} label="Left tile rail" />);
    expect(screen.getByText("Cluster Tile")).toBeTruthy();
  });
});
