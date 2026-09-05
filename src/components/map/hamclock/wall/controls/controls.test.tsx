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

  it("defaults to type=button but lets a caller override it", () => {
    const { rerender } = render(<HamClockButton>REFRESH</HamClockButton>);
    expect(
      screen.getByRole("button", { name: "REFRESH" }).getAttribute("type"),
    ).toBe("button");

    rerender(<HamClockButton type="submit">SAVE</HamClockButton>);
    expect(
      screen.getByRole("button", { name: "SAVE" }).getAttribute("type"),
    ).toBe("submit");
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

  it("gives the switch a stable accessible name from the row label", () => {
    render(
      <HamClockToggleRow
        label="Auto page"
        checked={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("switch", { name: "Auto page" })).not.toBeNull();
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

  it("falls back to the first enabled option as the tab stop when the value matches a disabled option", () => {
    render(
      <HamClockSegmented
        label="Choice"
        options={options}
        value="b"
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "A" }).getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen.getByRole("radio", { name: "B" }).getAttribute("tabindex"),
    ).toBe("-1");
    expect(
      screen.getByRole("radio", { name: "C" }).getAttribute("tabindex"),
    ).toBe("-1");
  });

  it("falls back to the first enabled option as the tab stop when the value matches no option", () => {
    const onChange = vi.fn();
    render(
      <HamClockSegmented
        label="Choice"
        options={options}
        value={"missing" as Val}
        onChange={onChange}
      />,
    );
    const a = screen.getByRole("radio", { name: "A" });
    expect(a.getAttribute("tabindex")).toBe("0");
    // Arrow-key movement starts from the fallback tab stop (A), so the next
    // enabled option (skipping disabled B) is C.
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("c");
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

  it("uses the first enabled tab as the tab stop when the active tab is disabled or unknown", () => {
    const tabsWithDisabled = [
      { id: "one", label: "One", content: <p>Content one</p>, disabled: true },
      { id: "two", label: "Two", content: <p>Content two</p> },
    ];
    const { rerender } = render(
      <HamClockTabs label="Sections" tabs={tabsWithDisabled} active="one" />,
    );
    expect(
      screen.getByRole("tab", { name: "Two" }).getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen.getByRole("tab", { name: "One" }).getAttribute("tabindex"),
    ).toBe("-1");

    rerender(<HamClockTabs label="Sections" tabs={tabs} active="unknown-id" />);
    expect(
      screen.getByRole("tab", { name: "One" }).getAttribute("tabindex"),
    ).toBe("0");
  });

  it("gives the focused tab tabIndex 0 while the tablist has focus, and resets to the active tab on blur", () => {
    render(<HamClockTabs label="Sections" tabs={tabs} />);
    const one = screen.getByRole("tab", { name: "One" });
    const two = screen.getByRole("tab", { name: "Two" });
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(document.activeElement).toBe(two);
    expect(two.getAttribute("tabindex")).toBe("0");
    expect(one.getAttribute("tabindex")).toBe("-1");
    // Selection is still "one" — the focused tab is a roving tab stop, not
    // a change of which tab is selected.
    expect(one.getAttribute("aria-selected")).toBe("true");

    // Focus leaves the tablist entirely: the tab stop resets to the active tab.
    fireEvent.blur(two, { relatedTarget: document.body });
    expect(one.getAttribute("tabindex")).toBe("0");
    expect(two.getAttribute("tabindex")).toBe("-1");
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
    // Rendered twice: the visible (aria-hidden) purpose line, and the
    // sr-only description AccessibleDialog wires up via aria-describedby.
    expect(screen.getAllByText("Configure the wall.").length).toBe(2);
  });

  it("exposes purpose as the dialog's accessible description", () => {
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
    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      "Configure the wall.",
    );
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
