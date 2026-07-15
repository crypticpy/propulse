import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SolarDisclosure } from "./SolarDisclosure";

describe("SolarDisclosure", () => {
  it("does not mount expensive children while closed", () => {
    const toggle = vi.fn();
    const { rerender } = render(
      <SolarDisclosure id="details" title="Details" summary="More" open={false} onToggle={toggle}>
        <svg aria-label="expensive chart" />
      </SolarDisclosure>,
    );
    expect(screen.queryByLabelText("expensive chart")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Details/i }));
    expect(toggle).toHaveBeenCalledOnce();

    rerender(
      <SolarDisclosure id="details" title="Details" summary="More" open onToggle={toggle}>
        <svg aria-label="expensive chart" />
      </SolarDisclosure>,
    );
    expect(screen.getByLabelText("expensive chart")).not.toBeNull();
  });
});
