import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("renders masked by default and toggles to plain text on click", async () => {
    const user = userEvent.setup();
    render(<PasswordInput id="pw" value="hunter2" onChange={vi.fn()} />);

    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.type).toBe("password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("preserves aria-label, id, and disabled/maxLength attributes across toggles", async () => {
    const user = userEvent.setup();
    render(
      <PasswordInput
        id="signup-password"
        value="abc"
        onChange={vi.fn()}
        disabled={false}
        maxLength={64}
      />,
    );

    const input = document.getElementById(
      "signup-password",
    ) as HTMLInputElement;
    expect(input.maxLength).toBe(64);
    expect(input.disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(document.getElementById("signup-password")).toBe(input);
    expect(input.maxLength).toBe(64);
  });

  it("does not receive focus via Tab (toggle button is tabIndex -1)", () => {
    render(<PasswordInput id="pw" value="" onChange={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("tabindex")).toBe("-1");
  });

  it("applies the caller's background class override", () => {
    render(
      <PasswordInput
        id="pw"
        value=""
        onChange={vi.fn()}
        bgClassName="bg-void-black/50"
      />,
    );
    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.className).toContain("bg-void-black/50");
    expect(input.className).not.toContain("bg-su-line/10");
  });

  it("defaults to the modal's background class", () => {
    render(<PasswordInput id="pw" value="" onChange={vi.fn()} />);
    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.className).toContain("bg-su-line/10");
  });
});
