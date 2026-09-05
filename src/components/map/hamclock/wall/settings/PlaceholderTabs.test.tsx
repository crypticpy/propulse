import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LayersTab, MapTab } from "./PlaceholderTabs";

describe("LayersTab", () => {
  it("says what is coming and adds no controls", () => {
    render(<LayersTab />);
    expect(screen.getByText("LAYERS")).toBeTruthy();
    expect(screen.getByText(/B6/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("MapTab", () => {
  it("says what is coming and adds no controls", () => {
    render(<MapTab />);
    expect(screen.getByText("MAP")).toBeTruthy();
    expect(screen.getByText(/B6/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
