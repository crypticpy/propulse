import { useThemeStore } from "@/stores/themeStore";
import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  StationProvider,
  EquipmentTile,
  TextField,
  SelectField,
  TextAreaField,
  Tabs,
  Dialog,
  Button,
  Badge,
  Notice,
  IconButton,
  ActionLink,
  ImagePicker,
  stationPalettes,
  stationTokens,
  stationContrast,
} from "./index";

describe("station design primitives", () => {
  it("keeps feedback meaning and secondary copy inside the shared treatment", () => {
    const { rerender } = render(
      <>
        <Badge tone="warning" title="Draft status">
          Needs review
        </Badge>
        <Notice title="Save failed" tone="danger" live>
          Your draft is preserved.
        </Notice>
      </>,
    );
    const badge = screen.getByText("Needs review");
    expect(badge.getAttribute("title")).toBe("Draft status");
    expect(badge.classList.contains("su-treatment--subtle")).toBe(true);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Save failed");
    expect(alert.classList.contains("su-tone-danger")).toBe(true);
    expect(
      screen
        .getByText("Your draft is preserved.")
        .classList.contains("su-treatment-secondary"),
    ).toBe(true);
    rerender(
      <Notice title="Saved" tone="success" live>
        Ready to use.
      </Notice>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Ready to use.");
  });

  it("preserves action refs, native attributes and pending behavior with recipes", async () => {
    const clicked = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <Button ref={ref} variant="primary" onClick={clicked} name="save" pending>
        Save draft
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save draft" });
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("name")).toBe("save");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.classList.contains("su-treatment--solid")).toBe(true);
    const user = userEvent.setup();
    await user.click(button);
    expect(clicked).not.toHaveBeenCalled();
    rerender(
      <Button ref={ref} variant="primary" onClick={clicked}>
        Save draft
      </Button>,
    );
    expect(button.hasAttribute("aria-busy")).toBe(false);
    await user.click(button);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("retains quiet actions, link destinations and icon button names", () => {
    const iconRef = createRef<HTMLButtonElement>();
    render(
      <>
        <Button variant="quiet">Cancel</Button>
        <Button variant="danger">Remove</Button>
        <ActionLink href="/station" variant="primary">
          Open station
        </ActionLink>
        <IconButton ref={iconRef} label="Inspect equipment">
          <span aria-hidden="true">+</span>
        </IconButton>
      </>,
    );
    expect(
      screen
        .getByRole("button", { name: "Cancel" })
        .classList.contains("su-treatment"),
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "Remove" })
        .classList.contains("su-tone-danger"),
    ).toBe(true);
    const link = screen.getByRole("link", { name: "Open station" });
    expect(link.getAttribute("href")).toBe("/station");
    expect(link.classList.contains("su-treatment--solid")).toBe(true);
    expect(iconRef.current).toBe(
      screen.getByRole("button", { name: "Inspect equipment" }),
    );
  });

  it("announces a unit suffix alongside the hint and validation error", () => {
    render(
      <StationProvider>
        <TextField
          label="Frequency"
          suffix="MHz"
          hint="Enter a frequency"
          error="Frequency is required"
        />
      </StationProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Frequency" });
    expect(
      input
        .getAttribute("aria-describedby")
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toEqual(["Enter a frequency", "Frequency is required", "MHz"]);
  });

  it("preserves external invalid states and prioritizes a supplied field error", () => {
    const { rerender } = render(
      <StationProvider>
        <TextField label="External name" aria-invalid />
        <SelectField label="External connector" aria-invalid="grammar">
          <option>Unknown</option>
        </SelectField>
        <TextAreaField label="External notes" aria-invalid="spelling" />
      </StationProvider>,
    );
    expect(
      screen
        .getByRole("textbox", { name: "External name" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByRole("combobox", { name: "External connector" })
        .getAttribute("aria-invalid"),
    ).toBe("grammar");
    expect(
      screen
        .getByRole("textbox", { name: "External notes" })
        .getAttribute("aria-invalid"),
    ).toBe("spelling");
    rerender(
      <StationProvider>
        <TextField
          label="External name"
          aria-invalid={false}
          error="Name required"
        />
      </StationProvider>,
    );
    expect(
      screen
        .getByRole("textbox", { name: "External name" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("follows the app's custom-primary predicate without changing preferences", () => {
    const original = useThemeStore.getState();
    try {
      for (const [customPrimary, expected] of [
        [null, "#ff6b35"],
        ["#000000", "#000000"],
      ] as const) {
        useThemeStore.setState({ accentId: "plasma", customPrimary });
        const { getByTestId, unmount } = render(
          <StationProvider data-testid="theme" />,
        );
        expect(getByTestId("theme").style.getPropertyValue("--su-accent")).toBe(
          expected,
        );
        expect(useThemeStore.getState().customPrimary).toBe(customPrimary);
        unmount();
      }
    } finally {
      useThemeStore.setState(original);
    }
  });

  it("distinguishes inspector actions from actual selection tiles", () => {
    render(
      <StationProvider>
        <EquipmentTile
          name="Inspect tuner"
          kind="tuner"
          opensDialog
          onSelect={() => {}}
        />
        <EquipmentTile
          name="Select antenna"
          kind="antenna"
          selected
          onSelect={() => {}}
        />
      </StationProvider>,
    );
    const inspector = screen.getByRole("button", { name: "Inspect tuner" });
    expect(inspector.hasAttribute("aria-pressed")).toBe(false);
    expect(inspector.getAttribute("aria-haspopup")).toBe("dialog");
    expect(
      screen
        .getByRole("button", { name: "Select antenna" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stacks EquipmentTile glyph, name and hint and marks selection with an outline, corner check and colour rail", () => {
    render(
      <StationProvider>
        <EquipmentTile
          name="Homebrew tuner"
          kind="tuner"
          detail="Owned · 2 ports"
          selected
          onSelect={() => {}}
        />
        <EquipmentTile
          name="Portable dipole"
          kind="antenna"
          detail="Planned · 1 port"
          selected={false}
          onSelect={() => {}}
        />
      </StationProvider>,
    );

    const selectedTile = screen.getByRole("button", {
      name: /Homebrew tuner/,
    });
    expect(selectedTile.getAttribute("aria-pressed")).toBe("true");
    const mark = selectedTile.querySelector(".su-selection-mark");
    expect(mark).not.toBeNull();

    const selectedChildren = Array.from(selectedTile.children);
    expect(selectedChildren[0].tagName).toBe("svg");
    const strong = selectedTile.querySelector("strong");
    const hint = selectedTile.querySelector(".su-hint");
    expect(strong?.textContent).toBe("Homebrew tuner");
    expect(hint?.textContent).toBe("Owned · 2 ports");
    expect(strong?.compareDocumentPosition(hint as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // The mark is a sibling that precedes the name/hint wrapper in the DOM.
    expect(mark?.compareDocumentPosition(strong as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    const unselectedTile = screen.getByRole("button", {
      name: /Portable dipole/,
    });
    expect(unselectedTile.getAttribute("aria-pressed")).toBe("false");
    expect(unselectedTile.querySelector(".su-selection-mark")).toBeNull();
    const unselectedChildren = Array.from(unselectedTile.children);
    expect(unselectedChildren[0].tagName).toBe("svg");
  });

  it("keeps text and custom accent labels legible across every theme", () => {
    for (const [theme, palette] of Object.entries(stationPalettes)) {
      expect(
        stationContrast(palette.line, palette.panel),
      ).toBeGreaterThanOrEqual(3);
      expect(palette.text).not.toBe("#ffffff");
      for (const background of [palette.canvas, palette.panel, palette.input]) {
        expect(
          stationContrast(palette.text, background),
        ).toBeGreaterThanOrEqual(7);
        for (const foreground of [
          palette.text,
          palette.muted,
          palette.info,
          palette.success,
          palette.warning,
          palette.danger,
        ])
          expect(
            stationContrast(foreground, background),
          ).toBeGreaterThanOrEqual(4.5);
      }
      for (const accent of [
        "#ff6b35",
        "#8b5cf6",
        "#22c55e",
        "#3b82f6",
        "#000000",
        "#ffffff",
        "#808080",
        "invalid",
      ]) {
        const tokens = stationTokens(
          theme as keyof typeof stationPalettes,
          accent,
        );
        expect(
          stationContrast(tokens["--su-accent"], tokens["--su-on-accent"]),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          stationContrast(tokens["--su-accent-text"], palette.panel),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("associates labels, hints and validation with the native input", () => {
    render(
      <StationProvider>
        <TextField
          label="Name"
          hint="Recognizable on the canvas"
          error="A name is required"
          required
        />
      </StationProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Name (required)" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      input
        .getAttribute("aria-describedby")
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toEqual(["Recognizable on the canvas", "A name is required"]);
  });
  it("moves tab focus and selection with arrows while skipping disabled items", async () => {
    function Example() {
      const [value, setValue] = useState("a");
      return (
        <Tabs
          label="Sections"
          value={value}
          onChange={setValue}
          items={[
            { value: "a", label: "About", content: "About content" },
            {
              value: "b",
              label: "Hidden",
              content: "Hidden content",
              disabled: true,
            },
            { value: "c", label: "Gear", content: "Gear content" },
          ]}
        />
      );
    }
    render(<Example />);
    const user = userEvent.setup();
    screen.getByRole("tab", { name: "About" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Gear" }),
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("Gear content");
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "About" }),
    );
  });
  it("carries scoped theme into the portal and restores trigger focus on Escape", async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <StationProvider theme="light" density="compact" textSize="large">
          <Button onClick={() => setOpen(true)}>Inspect</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Equipment">
            <TextField label="Port name" />
          </Dialog>
        </StationProvider>
      );
    }
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Inspect" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-station-theme")).toBe("light");
    expect(dialog.style.getPropertyValue("--su-text-scale")).toBe("1.125");
    expect(dialog.style.getPropertyValue("--su-panel")).toBe("#f3f4ef");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Inspect" }),
    );
  });
  it("rejects unsuitable photos and reports decode failures", () => {
    const change = vi.fn();
    const { rerender } = render(<ImagePicker onChange={change} />);
    fireEvent.change(screen.getByLabelText("Add a photo · Equipment photo"), {
      target: {
        files: [new File(["x"], "bad.svg", { type: "image/svg+xml" })],
      },
    });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Choose a JPG");
    rerender(
      <ImagePicker
        onChange={change}
        previewUrl="blob:test"
        fileName="broken.png"
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(change).toHaveBeenCalledWith(null);
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be read",
    );
  });
});
