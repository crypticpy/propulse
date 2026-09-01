import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactNode } from "react";
import { SpotLabel } from "./SpotLabel";

vi.mock("@react-three/drei", () => ({
  Html: ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
    <div data-testid="html-overlay" style={style}>{children}</div>
  ),
}));

describe("SpotLabel selection", () => {
  it.each([3573, 5357, 14074])(
    "keeps hover and selection active at %s kHz regardless of band color",
    (frequency) => {
      const onHover = vi.fn();
      const onSelect = vi.fn();
      render(
        <SpotLabel
          lat={35.5}
          lon={-97.5}
          callsign="K5ABC"
          frequency={frequency}
          onHover={onHover}
          onSelect={onSelect}
        />,
      );
      const label = screen.getByRole("button", {
        name: "Select K5ABC as target",
      });

      fireEvent.mouseEnter(label);
      fireEvent.click(label);

      expect(onHover).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledOnce();
    },
  );

  it("selects the tag with accessible button semantics", () => {
    const onSelect = vi.fn();
    render(
      <SpotLabel lat={-22.5} lon={-43} callsign="PY2ABC" onSelect={onSelect} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select PY2ABC as target" }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it.each(["Enter", " "])("selects from the %j key", (key) => {
    const onSelect = vi.fn();
    render(<SpotLabel lat={0} lon={0} callsign="5N0CALL" onSelect={onSelect} />);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Select 5N0CALL as target" }),
      { key },
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not let pointer or double-click events reach the map surface", () => {
    const onParentPointerDown = vi.fn();
    const onParentDoubleClick = vi.fn();
    const onSelect = vi.fn();
    render(
      <div onPointerDown={onParentPointerDown} onDoubleClick={onParentDoubleClick}>
        <SpotLabel lat={35.5} lon={139} callsign="JA1XYZ" onSelect={onSelect} />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Select JA1XYZ as target" });
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onParentDoubleClick).not.toHaveBeenCalled();
  });
});
