import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LibraryNoticeBar } from "./LibraryNoticeBar";

// #754/#772: the notice bar used to be an `{notice && <p role="status">}`
// conditional, so a saved-then-dismissed cycle never announced — the region
// wasn't in the tree yet when the notice first appeared. It now stays
// mounted and the same node's content changes.
it("mounts the notice region empty, then mutates the same node once a notice arrives, and clears it back on dismiss", () => {
  const onDismiss = vi.fn();
  const { rerender } = render(
    <LibraryNoticeBar notice={null} onDismiss={onDismiss} />,
  );
  const before = screen.getByRole("status");
  expect(before.textContent).toBe("");

  rerender(
    <LibraryNoticeBar
      notice={{ kind: "saved", message: "Recipe saved." }}
      onDismiss={onDismiss}
    />,
  );
  const after = screen.getByRole("status");
  expect(after).toBe(before);
  expect(after.textContent).toContain("Recipe saved.");

  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(onDismiss).toHaveBeenCalledTimes(1);

  rerender(<LibraryNoticeBar notice={null} onDismiss={onDismiss} />);
  const cleared = screen.getByRole("status");
  expect(cleared).toBe(before);
  expect(cleared.textContent).toBe("");
});
