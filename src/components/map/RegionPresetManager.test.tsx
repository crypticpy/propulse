import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { RegionPreset } from "@/types/map";
import { RegionPresetManager } from "./RegionPresetManager";

const presets: RegionPreset[] = [
  {
    id: "builtin-1",
    name: "North America",
    center: { lat: 40, lon: -100 },
    zoom: 3,
    isBuiltIn: true,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-1",
    name: "My Shack",
    center: { lat: 51, lon: -1 },
    zoom: 5,
    isBuiltIn: false,
    createdAt: "2026-01-02T00:00:00Z",
  },
];

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (
    selector: (state: {
      regionPresets: RegionPreset[];
      activePresetId: string | null;
      setActivePreset: () => void;
      updateRegionPreset: () => void;
      deleteRegionPreset: () => void;
      reorderRegionPresets: () => void;
      exportRegionPresets: () => string;
      importRegionPresets: () => boolean;
    }) => unknown,
  ) =>
    selector({
      regionPresets: presets,
      activePresetId: null,
      setActivePreset: vi.fn(),
      updateRegionPreset: vi.fn(),
      deleteRegionPreset: vi.fn(),
      reorderRegionPresets: vi.fn(),
      exportRegionPresets: () => "[]",
      importRegionPresets: () => true,
    }),
}));

it("wires the visible heading as the dialog's sole accessible name (#773)", () => {
  render(<RegionPresetManager visible onClose={vi.fn()} />);
  const panel = screen.getByRole("dialog", { name: "Region Presets" });
  const heading = screen.getByRole("heading", { name: "Region Presets" });
  expect(panel.getAttribute("aria-labelledby")).toBe(heading.id);
  expect(
    screen.getAllByRole("heading", { name: "Region Presets" }),
  ).toHaveLength(1);
});

it("names the dialog by its visible heading, not the old aria-label text (#773)", () => {
  // Before the migration this panel's accessible name came from
  // aria-label="Region Preset Manager", which didn't match the visible
  // "Region Presets" heading (WCAG 2.5.3). labelledBy fixes that.
  render(<RegionPresetManager visible onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog", { name: "Region Preset Manager" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Region Presets" })).toBeTruthy();
});

it("is a modal dialog that AccessibleDialog closes on Escape", () => {
  const onClose = vi.fn();
  render(<RegionPresetManager visible onClose={onClose} />);
  const panel = screen.getByRole("dialog", { name: "Region Presets" });
  expect(panel.getAttribute("aria-modal")).toBe("true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("renders nothing when not visible", () => {
  render(<RegionPresetManager visible={false} onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
});
