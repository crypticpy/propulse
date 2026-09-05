import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StationProvider } from "@/components/station-ui";
import { EquipmentForm } from "./EquipmentForm";

function setup(save = vi.fn().mockResolvedValue(undefined)) {
  render(
    <StationProvider>
      <EquipmentForm onSave={save} />
    </StationProvider>,
  );
  return { user: userEvent.setup(), save };
}
async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: "Name (required)" }),
    "  My tuner  ",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Type (required)" }),
    "tuner",
  );
}
describe("equipment review form", () => {
  it("validates required fields and rejects ambiguous port names before saving", async () => {
    const { user, save } = setup();
    await user.click(screen.getByRole("button", { name: "Save example" }));
    expect(screen.getByText("Give this equipment a name.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    await fillBasics(user);
    await user.clear(screen.getByRole("textbox", { name: "Port 2 name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Port 2 name" }),
      "rf in",
    );
    await user.click(screen.getByRole("button", { name: "Save example" }));
    expect(
      screen.getByText("Use a different name for each port."),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
  it("preserves duplicate-name errors during connector edits and reordering", async () => {
    const { user } = setup();
    await fillBasics(user);
    await user.clear(screen.getByRole("textbox", { name: "Port 2 name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Port 2 name" }),
      "rf in",
    );
    await user.click(screen.getByRole("button", { name: "Save example" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Port 1 connector" }),
      "BNC",
    );
    expect(
      screen.getByText("Use a different name for each port."),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Move rf in up" }),
    );
    expect(
      screen.getByText("Use a different name for each port."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("textbox", { name: "Port 1 name" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    await user.clear(screen.getByRole("textbox", { name: "Port 1 name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Port 1 name" }),
      "GROUND",
    );
    expect(
      screen.queryByText("Use a different name for each port."),
    ).toBeNull();
    expect(
      screen
        .getByRole("textbox", { name: "Port 1 name" })
        .hasAttribute("aria-invalid"),
    ).toBe(false);
  });

  it("adds, reorders and removes ports, then saves normalized input", async () => {
    const { user, save } = setup();
    await fillBasics(user);
    await user.click(screen.getByRole("button", { name: "Add port" }));
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Port 3 name" }),
    );
    await user.type(document.activeElement as HTMLElement, "GROUND");
    await user.click(screen.getByRole("button", { name: "Move GROUND up" }));
    expect(
      (screen.getByRole("textbox", { name: "Port 2 name" }) as HTMLInputElement)
        .value,
    ).toBe("GROUND");
    await user.click(screen.getByRole("button", { name: "Remove RF OUT" }));
    await user.click(screen.getByRole("button", { name: "Save example" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My tuner",
        kind: "tuner",
        ports: [
          { id: "port-1", name: "RF IN", connector: "Unknown" },
          { id: "port-3", name: "GROUND", connector: "Unknown" },
        ],
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("My tuner saved");
  });
  it("preserves entries on failure and prevents duplicate in-flight submissions", async () => {
    let reject!: (error: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const { user } = setup(save);
    await fillBasics(user);
    const form = screen
      .getByRole("button", { name: "Save example" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(save).toHaveBeenCalledOnce();
    reject(new Error("offline"));
    await screen.findByRole("alert");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Name (required)",
        }) as HTMLInputElement
      ).value,
    ).toBe("  My tuner  ");
    expect(
      (
        screen.getByRole("button", {
          name: "Save example",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("requires confirmation to reset and reveals invalid collapsed details", async () => {
    const { user, save } = setup();
    await fillBasics(user);
    await user.click(screen.getByText("Technical details"));
    await user.type(
      screen.getByRole("spinbutton", { name: "Power rating" }),
      "-2",
    );
    await user.click(screen.getByText("Technical details"));
    await user.click(screen.getByRole("button", { name: "Save example" }));
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("spinbutton", { name: "Power rating" }),
      ),
    );
    expect(save).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset form" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Keep editing",
      }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Name (required)",
        }) as HTMLInputElement
      ).value,
    ).toContain("My tuner");
    await user.click(screen.getByRole("button", { name: "Reset form" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Reset form",
      }),
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "Name (required)",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
