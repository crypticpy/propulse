import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import BasemapCategory from "./BasemapCategory";

describe("BasemapCategory", () => {
  beforeEach(() => {
    useMapStore.setState({ mapStyle: "satellite", nightDarkness: 1 });
  });

  it("keeps style choices together with the shared night-intensity control", () => {
    render(<BasemapCategory />);

    expect(screen.getByRole("button", { name: /satellite/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /standard/i })).toBeTruthy();

    fireEvent.change(screen.getByRole("slider", { name: /night darkness/i }), {
      target: { value: "35" },
    });

    expect(useMapStore.getState().nightDarkness).toBe(0.35);
    expect(screen.getByText("35%")).toBeTruthy();
  });
});
