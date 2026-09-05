import { useThemeStore } from "@/stores/themeStore";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  StationProvider,
  EquipmentTile,
  TextField,
  Tabs,
  Dialog,
  Button,
  ImagePicker,
  stationPalettes,
  stationTokens,
  stationContrast,
} from "./index";

describe("station design primitives", () => {
  it("follows the app's complete custom-color predicate without changing preferences", () => {
    const original = useThemeStore.getState();
    try {
      for (const [secondary, expected] of [
        [null, "#ff6b35"],
        ["#ffffff", "#000000"],
      ] as const) {
        useThemeStore.setState({
          accentId: "plasma",
          customPrimary: "#000000",
          customSecondary: secondary,
        });
        const { getByTestId, unmount } = render(
          <StationProvider data-testid="theme" />,
        );
        expect(getByTestId("theme").style.getPropertyValue("--su-accent")).toBe(
          expected,
        );
        expect(useThemeStore.getState().customSecondary).toBe(secondary);
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

  it("keeps text and custom accent labels legible across every theme", () => {
    for (const [theme, palette] of Object.entries(stationPalettes)) {
      expect(
        stationContrast(palette.line, palette.panel),
      ).toBeGreaterThanOrEqual(3);
      for (const background of [palette.canvas, palette.panel, palette.input]) {
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
        <StationProvider theme="light" density="compact">
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
    expect(dialog.style.getPropertyValue("--su-panel")).toBe("#ffffff");
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
