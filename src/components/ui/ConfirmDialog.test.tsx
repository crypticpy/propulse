import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("wires the alertdialog's accessible description to the rendered message (#779)", () => {
    render(
      <ConfirmDialog
        open
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete this log entry?"
        message="This will permanently remove the QSO from your logbook."
      />,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Delete this log entry?" });
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      "This will permanently remove the QSO from your logbook.",
    );
  });
});
