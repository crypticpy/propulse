import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactNode } from "react";
import { LocationMarker } from "./LocationMarker";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn(),
}));

vi.mock("@react-three/drei", () => ({
  Html: ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
    <div data-testid="html-overlay" style={style}>
      {children}
    </div>
  ),
}));

vi.mock("@/hooks/useGlobeOcclusion", () => ({
  useGlobeOcclusion: () => ({
    opacityRef: { current: 0.25 },
    opacity: 0.25,
  }),
}));

describe("LocationMarker HTML occlusion", () => {
  it.each([
    { type: "home" as const, label: "N0CALL" },
    { type: "target" as const, label: "FN31" },
  ])("applies far-side opacity to the $type DOM overlay", ({ type, label }) => {
    render(<LocationMarker lat={40} lon={-75} type={type} label={label} />);

    expect(screen.getByTestId("html-overlay").style.opacity).toBe("0.25");
  });

  it("applies far-side opacity to the interactive home tooltip", () => {
    const { container } = render(
      <LocationMarker lat={40} lon={-75} type="home" label="N0CALL" />,
    );
    fireEvent.pointerEnter(container.querySelector("mesh")!);

    const overlays = screen.getAllByTestId("html-overlay");
    expect(overlays).toHaveLength(2);
    expect(overlays.every((overlay) => overlay.style.opacity === "0.25")).toBe(
      true,
    );
  });
});
