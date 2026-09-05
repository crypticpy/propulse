import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockButton } from "./HamClockButton";
import { HamClockDialog } from "./HamClockDialog";
import { HamClockSegmented } from "./HamClockSegmented";
import { HamClockTabs } from "./HamClockTabs";
import { HamClockToggleRow } from "./HamClockToggleRow";

describe("HamClockButton", () => {
  it("sets aria-busy and disables the button when busy", () => {
    render(<HamClockButton busy>REFRESH</HamClockButton>);
    const button = screen.getByRole("button", { name: "REFRESH" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("is not busy by default", () => {
    render(<HamClockButton>REFRESH</HamClockButton>);
    const button = screen.getByRole("button", { name: "REFRESH" });
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("HamClockToggleRow", () => {
  it("renders visible ON/OFF text and a role=switch with aria-checked", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HamClockToggleRow
        label="Auto page"
        checked={false}
        onChange={onChange}
      />,
    );
    const toggle = screen.getByRole("switch");
    expect(toggle.textContent).toBe("OFF");
    expect(toggle.getAttribute("aria-checked")).toBe("false");

    rerender(
      <HamClockToggleRow label="Auto page" checked onChange={onChange} />,
    );
    expect(screen.getByRole("switch").textContent).toBe("ON");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("clicking the label text does not toggle the row", () => {
    const onChange = vi.fn();
    render(
      <HamClockToggleRow
        label="Auto page"
        checked={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Auto page"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking the toggle button does flip the state", () => {
    const onChange = vi.fn();
    render(
      <HamClockToggleRow
        label="Auto page"
        checked={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("OPTIONS expands inline content inside the row element, never a popover", () => {
    render(
      <HamClockToggleRow
        label="News feeds"
        checked
        onChange={vi.fn()}
        options={<p>Fetch every 30 min</p>}
      />,
    );
    const gear = screen.getByRole("button", { name: "News feeds options" });
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Fetch every 30 min")).toBeNull();

    fireEvent.click(gear);
    expect(gear.getAttribute("aria-expanded")).toBe("true");
    const options = screen.getByText("Fetch every 30 min");
    const panelId = gear.getAttribute("aria-controls");
    expect(panelId).not.toBeNull();
    expect(panelId && document.getElementById(panelId)?.contains(options)).toBe(
      true,
    );
    // The panel is a descendant of the row itself, not a portal elsewhere.
    expect(options.closest(".hcc-row")).not.toBeNull();
  });
});

describe("HamClockSegmented", () => {
  type Val = "a" | "b" | "c";
  const options = [
    { value: "a" as Val, label: "A" },
    { value: "b" as Val, label: "B", disabled: true },
    { value: "c" as Val, label: "C" },
  ];

  function Wrapper() {
    const [value, setValue] = useState<Val>("a");
    return (
      <HamClockSegmented
        label="Choice"
        options={options}
        value={value}
        onChange={setValue}
      />
    );
  }

  it("uses role=radiogroup with role=radio options", () => {
    render(<Wrapper />);
    expect(screen.getByRole("radiogroup", { name: "Choice" })).not.toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("only the selected option is a tab stop", () => {
    render(<Wrapper />);
    expect(
      screen.getByRole("radio", { name: "A" }).getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen.getByRole("radio", { name: "C" }).getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("arrow keys move selection and skip the disabled option, wrapping around", () => {
    render(<Wrapper />);
    const a = screen.getByRole("radio", { name: "A" });
    fireEvent.keyDown(a, { key: "ArrowRight" });
    // B is disabled, so selection skips straight to C.
    expect(
      screen.getByRole("radio", { name: "C" }).getAttribute("aria-checked"),
    ).toBe("true");
    const c = screen.getByRole("radio", { name: "C" });
    fireEvent.keyDown(c, { key: "ArrowRight" });
    // Wraps back to A.
    expect(
      screen.getByRole("radio", { name: "A" }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("HamClockTabs", () => {
  const tabs = [
    { id: "one", label: "One", content: <p>Content one</p> },
    { id: "two", label: "Two", content: <p>Content two</p> },
  ];

  it("arrow keys move focus without changing the active tab", () => {
    render(<HamClockTabs label="Sections" tabs={tabs} />);
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(document.activeElement).toBe(two);
    // Selection did not move: tab one is still selected and its panel shown.
    expect(one.getAttribute("aria-selected")).toBe("true");
    expect(two.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("Content one")).not.toBeNull();
  });

  it("Enter on a focused tab commits the selection", () => {
    render(<HamClockTabs label="Sections" tabs={tabs} />);
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    fireEvent.keyDown(two, { key: "Enter" });
    expect(two.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Content two")).not.toBeNull();
  });

  it("only mounts the active tab's panel", () => {
    render(<HamClockTabs label="Sections" tabs={tabs} />);
    expect(screen.getByText("Content one")).not.toBeNull();
    expect(screen.queryByText("Content two")).toBeNull();
  });
});

describe("HamClockDialog", () => {
  afterEach(() => {
    useHamClockDisplayStore.setState({ theme: "pulse" });
  });

  it("renders the title and purpose", () => {
    render(
      <HamClockDialog
        open
        onClose={vi.fn()}
        title="SETTINGS"
        purpose="Configure the wall."
      >
        <p>Body</p>
      </HamClockDialog>,
    );
    expect(screen.getAllByText("SETTINGS").length).toBeGreaterThan(0);
    expect(screen.getByText("Configure the wall.")).not.toBeNull();
  });

  it("closes via the ESC · CLOSE button", () => {
    const onClose = vi.fn();
    render(
      <HamClockDialog open onClose={onClose} title="SETTINGS">
        <p>Body</p>
      </HamClockDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "ESC · CLOSE" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <HamClockDialog open onClose={onClose} title="SETTINGS">
        <p>Body</p>
      </HamClockDialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("carries data-hamclock-theme from the display store on the panel", () => {
    useHamClockDisplayStore.setState({ theme: "brass" });
    render(
      <HamClockDialog open onClose={vi.fn()} title="SETTINGS">
        <p>Body</p>
      </HamClockDialog>,
    );
    const panel = document.querySelector(".hcc-dialog");
    expect(panel?.getAttribute("data-hamclock-theme")).toBe("brass");
  });

  it("omits the foot when there is no hint or actions", () => {
    render(
      <HamClockDialog open onClose={vi.fn()} title="SETTINGS">
        <p>Body</p>
      </HamClockDialog>,
    );
    expect(document.querySelector(".hcc-dialog-foot")).toBeNull();
  });

  it("renders the foot when hint or actions are present", () => {
    render(
      <HamClockDialog
        open
        onClose={vi.fn()}
        title="SETTINGS"
        hint="SELECT to apply"
        actions={<button type="button">SAVE</button>}
      >
        <p>Body</p>
      </HamClockDialog>,
    );
    expect(document.querySelector(".hcc-dialog-foot")).not.toBeNull();
    expect(screen.getByText("SELECT to apply")).not.toBeNull();
    expect(screen.getByRole("button", { name: "SAVE" })).not.toBeNull();
  });
});
