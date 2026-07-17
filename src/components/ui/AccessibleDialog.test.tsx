import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { AccessibleDialog } from "./AccessibleDialog";

describe("AccessibleDialog", () => {
  it("moves focus inside, traps Tab, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Open details";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <AccessibleDialog open onClose={close} title="Solar details">
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </AccessibleDialog>,
    );

    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close dialog" })));
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close dialog" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    rerender(
      <AccessibleDialog open={false} onClose={close} title="Solar details">
        <button type="button">First action</button>
      </AccessibleDialog>,
    );
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("has no automated accessibility violations in its rendered contract", async () => {
    render(
      <AccessibleDialog
        open
        onClose={() => {}}
        title="Kp details"
        description="Observed planetary Kp context"
      >
        <button type="button">Inspect source</button>
      </AccessibleDialog>,
    );
    const results = await axe.run(screen.getByRole("dialog"));
    expect(results.violations).toEqual([]);
  });
});
