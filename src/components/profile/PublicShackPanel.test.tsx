import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicShackPanel } from "./PublicShackPanel";

const { photo } = vi.hoisted(() => ({ photo: vi.fn() }));
vi.mock("@/hooks/usePublicEquipmentImage", () => ({ usePublicEquipmentImage: photo }));
vi.mock("@/components/shack/EquipmentCard", () => ({
  EquipmentCard: () => { throw new Error("Public gear must not read visitor rank or history"); },
}));
beforeEach(() => {
  photo.mockReset();
  photo.mockImplementation((owner, id) => owner && id ? `https://photos.example/${owner}/${id}.jpg` : null);
});
afterEach(cleanup);

describe("public station showcase", () => {
  it.each([null, undefined, "invalid", {}, { nodes: [{ type: "radio", label: "Incomplete" }] }])("renders an unavailable summary without local equipment for %j", (equipment) => {
    render(<PublicShackPanel equipment={equipment} ownerUserId="other-operator" />);
    expect(screen.getByText("Equipment info not available")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(photo).toHaveBeenCalledWith("other-operator", undefined);
  });

  it("retains shared names, node order, duplicate labels, metadata and owner-bound photos", () => {
    render(<PublicShackPanel ownerUserId="other-operator" equipment={{
      chainId: "private-chain-id", radioId: "private-radio-id", antennaId: "private-antenna-id",
      chainName: "Weekend station", stationLine: "Built for a quiet afternoon on 20m",
      radioName: "Homebrew transceiver", antennaName: "Garden dipole", antennaType: "Wire dipole",
      powerWatts: 25, erp20m: 1200, erp40m: 6.5,
      radioPhotoId: "shared-radio", antennaPhotoId: "shared-antenna",
      nodes: [{ type: "radio", label: "RF source" }, { type: "feedline", label: "Patch cable" }, { type: "feedline", label: "Patch cable" }, { type: "antenna", label: "Garden feedpoint" }],
      privateNotes: "Do not publish this field",
    }} />);
    expect(screen.getByRole("heading", { name: "Weekend station" })).toBeTruthy();
    expect(screen.getByText("Built for a quiet afternoon on 20m")).toBeTruthy();
    expect(screen.getByText("Wire dipole")).toBeTruthy();
    expect(screen.getByText("25 W")).toBeTruthy();
    expect(screen.getByText("1.2 kW")).toBeTruthy();
    expect(screen.getByText("6.5 W")).toBeTruthy();
    expect(screen.getByText("20m ERP · estimated")).toBeTruthy();
    expect(screen.getByText("40m ERP · estimated")).toBeTruthy();
    expect(screen.getByRole("list").getAttribute("role")).toBe("list");
    const nodes = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(nodes.map((node) => node.querySelector("p")?.textContent)).toEqual(["RF source", "Patch cable", "Patch cable", "Garden feedpoint"]);
    expect(photo).toHaveBeenCalledWith("other-operator", "shared-radio");
    expect(photo).toHaveBeenCalledWith("other-operator", "shared-antenna");
    expect(screen.getByAltText("Shared photo of Homebrew transceiver").getAttribute("src")).toBe("https://photos.example/other-operator/shared-radio.jpg");
    expect(screen.getByAltText("Shared photo of Garden dipole").getAttribute("src")).toBe("https://photos.example/other-operator/shared-antenna.jpg");
    expect(screen.queryByText(/private-.*-id|Do not publish this field/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("preserves zero values and distinguishes unknown/non-finite data from zero", () => {
    const equipment = { radioName: "Radio", antennaName: "Antenna", powerWatts: 0, erp20m: 0, erp40m: Number.NaN };
    const { rerender } = render(<PublicShackPanel equipment={equipment} />);
    expect(screen.getAllByText("0 W")).toHaveLength(2);
    expect(screen.getByText("Not shared")).toBeTruthy();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
    rerender(<PublicShackPanel equipment={{ ...equipment, powerWatts: undefined, erp20m: Infinity }} />);
    expect(screen.getAllByText("Not shared")).toHaveLength(3);
  });

  it("keeps the shared equipment visible when a photo fails, and accepts a replacement photo", () => {
    const equipment = { radioName: "Portable rig", radioPhotoId: "missing" };
    const { rerender } = render(<PublicShackPanel equipment={equipment} ownerUserId="owner" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Portable rig" })).toBeTruthy();
    rerender(<PublicShackPanel equipment={{ ...equipment, radioPhotoId: "replacement" }} ownerUserId="owner" />);
    expect(screen.getByRole("img").getAttribute("src")).toContain("/owner/replacement.jpg");
  });

  it.each([
    [0.04, "40 mW"],
    [0.00004, "0.04 mW"],
    [1e-12, "1e-9 mW"],
    [Number.MIN_VALUE, "4.94e-321 mW"],
  ])("keeps small positive ERP %s W distinct from actual zero", (erp20m, expected) => {
    render(<PublicShackPanel equipment={{ antennaName: "Lossy path antenna", erp20m, erp40m: 0 }} />);
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getAllByText("0 W")).toHaveLength(1);
    expect(screen.queryByText("0 mW")).toBeNull();
  });

  it("shows negative power and ERP as unknown rather than meaningful performance", () => {
    render(<PublicShackPanel equipment={{ radioName: "Radio", antennaName: "Antenna", powerWatts: -1, erp20m: -0.04, erp40m: -Infinity }} />);
    expect(screen.getAllByText("Not shared")).toHaveLength(3);
    expect(screen.queryByText(/^-.* [mk]?W$/)).toBeNull();
  });
});
