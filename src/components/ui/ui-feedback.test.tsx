import { createRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Badge, type BadgeStatus } from "./Badge";
import { PanelCard } from "./PanelCard";
import { ConfirmDialog } from "./ConfirmDialog";
import { AccessibleDialog } from "./AccessibleDialog";
import { StationProvider } from "@/components/station-ui/StationProvider";

afterEach(cleanup);

it.each([
  ["excellent", "success"],
  ["good", "success"],
  ["fair", "warning"],
  ["poor", "danger"],
  ["quiet", "purple"],
  ["active", "info"],
  ["storm", "danger"],
] as const)(
  "adapts Badge %s to shared treatment while preserving its public span API",
  (status: BadgeStatus, tone) => {
    const ref = createRef<HTMLSpanElement>();
    const click = vi.fn();
    const { rerender } = render(
      <Badge
        status={status}
        size="sm"
        ref={ref}
        className="custom-badge"
        title="Conditions"
        onClick={click}
      >
        {status}
      </Badge>,
    );
    const badge = screen.getByText(status);
    expect(ref.current).toBe(badge);
    expect(badge.classList.contains(`su-tone-${tone}`)).toBe(true);
    expect(badge.classList.contains("su-treatment")).toBe(true);
    expect(badge.classList.contains("su-treatment--subtle")).toBe(true);
    expect(badge.classList.contains("su-treatment--interactive")).toBe(false);
    expect(badge.classList.contains("border")).toBe(true);
    expect(badge.classList.contains("text-xs")).toBe(true);
    expect(badge.classList.contains("custom-badge")).toBe(true);
    expect(badge.getAttribute("title")).toBe("Conditions");
    fireEvent.click(badge);
    expect(click).toHaveBeenCalledOnce();
    rerender(<Badge status={status}>{status}</Badge>);
    expect(screen.getByText(status).classList.contains("text-sm")).toBe(true);
  },
);

it("keeps storm label and every inherited wrapper free of pulse and opacity treatments", () => {
  const { container } = render(
    <Badge status="storm">
      <span>Storm conditions</span>
    </Badge>,
  );
  let element: HTMLElement | null = screen.getByText("Storm conditions");
  while (element && element !== container) {
    expect(element.className).not.toMatch(/(?:animate-pulse|opacity-)/);
    expect(element.style.opacity).toBe("");
    element = element.parentElement;
  }
});

it("maps all PanelCard badge roles without losing zero, labels, ref or collapse behavior", () => {
  const ref = createRef<HTMLDivElement>();
  const toggle = vi.fn();
  const props = {
    title: "Propagation",
    collapsible: true,
    onToggleCollapse: toggle,
    badges: [
      { label: "Default", value: 0 },
      { label: "Success", value: "Open", color: "success" as const },
      { label: "Warning", value: "Watch", color: "warning" as const },
      { label: "Danger", value: "Storm", color: "danger" as const },
    ],
  };
  const { rerender } = render(
    <PanelCard {...props} ref={ref} footer="Footer" collapsedSummary="Summary">
      Body
    </PanelCard>,
  );
  for (const [label, tone] of [
    ["Default 0", "neutral"],
    ["Success Open", "success"],
    ["Warning Watch", "warning"],
    ["Danger Storm", "danger"],
  ]) {
    const badge = screen.getByText(label);
    expect(badge.classList.contains(`su-tone-${tone}`)).toBe(true);
    expect(badge.classList.contains("su-treatment")).toBe(true);
    expect(badge.classList.contains("su-treatment--subtle")).toBe(true);
    expect(badge.classList.contains("border")).toBe(false);
  }
  expect(ref.current?.contains(screen.getByText("Body"))).toBe(true);
  expect(screen.getByText("Footer")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
  expect(toggle).toHaveBeenCalledTimes(1);
  rerender(
    <PanelCard {...props} collapsed collapsedSummary="Summary">
      Body
    </PanelCard>,
  );
  expect(screen.getByText("Summary")).toBeTruthy();
  const header = screen.getByRole("button", { expanded: false });
  fireEvent.keyDown(header, { key: "Enter" });
  fireEvent.keyDown(header, { key: " " });
  expect(toggle).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole("button", { name: "Expand panel" }));
  expect(toggle).toHaveBeenCalledTimes(4);
});

it("preserves the separate panel expand callback", () => {
  const expand = vi.fn();
  render(
    <PanelCard title="Propagation" expandable onExpand={expand}>
      Body
    </PanelCard>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Expand panel" }));
  expect(expand).toHaveBeenCalledOnce();
});

it.each([
  ["destructive", "danger"],
  ["warning", "warning"],
  ["default", "accent"],
] as const)(
  "routes %s confirmation actions without adding toggle or pending semantics",
  async (variant, tone) => {
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Confirm change"
        message="This affects your saved item."
        onConfirm={confirm}
        onCancel={cancel}
        variant={variant}
        confirmLabel="Proceed"
        cancelLabel="Keep item"
      />,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Confirm change" });
    expect(
      document.getElementById(dialog.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("This affects your saved item.");
    const action = within(dialog).getByRole("button", { name: "Proceed" });
    const back = within(dialog).getByRole("button", { name: "Keep item" });
    for (const [button, role] of [
      [action, tone],
      [back, "neutral"],
    ] as const) {
      expect(button.classList.contains(`su-tone-${role}`)).toBe(true);
      expect(button.classList.contains("su-treatment")).toBe(true);
      expect(button.classList.contains("su-treatment--subtle")).toBe(true);
      expect(button.classList.contains("su-treatment--interactive")).toBe(true);
      expect(button.classList.contains("border")).toBe(true);
      expect(button.hasAttribute("aria-pressed")).toBe(false);
      expect(button.hasAttribute("aria-busy")).toBe(false);
    }
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole("button", { name: "Close dialog" }),
      ),
    );
    fireEvent.click(action);
    fireEvent.click(back);
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  },
);

it("preserves unscoped root inheritance and default confirmation labels", () => {
  render(
    <ConfirmDialog
      open
      title="Delete item?"
      message="Permanent removal"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  const dialog = screen.getByRole("alertdialog");
  expect(dialog.style.getPropertyValue("--su-text")).toBe("");
  expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
});

it("bridges changing scoped tokens to the actual confirmation portal", () => {
  const props = {
    open: true,
    title: "Delete item?",
    message: "Permanent removal",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  const rootStyle = document.documentElement.getAttribute("style");
  const { container, rerender } = render(
    <StationProvider theme="light" accent="#9944cc">
      <ConfirmDialog {...props} />
    </StationProvider>,
  );
  const dialog = screen.getByRole("alertdialog");
  const provider = container.querySelector<HTMLElement>(".station-ui")!;
  expect(container.contains(dialog)).toBe(false);
  for (const token of [
    "--su-panel",
    "--su-text",
    "--su-solid-accent-fill",
    "--su-solid-accent-ink",
  ]) {
    expect(dialog.style.getPropertyValue(token)).not.toBe("");
    expect(dialog.style.getPropertyValue(token)).toBe(
      provider.style.getPropertyValue(token),
    );
  }
  const previous = dialog.style.getPropertyValue("--su-text");
  rerender(
    <StationProvider theme="midnight" accent="#22aa99">
      <ConfirmDialog {...props} />
    </StationProvider>,
  );
  expect(dialog.style.getPropertyValue("--su-text")).not.toBe(previous);
  expect(dialog.style.getPropertyValue("--su-text")).toBe(
    provider.style.getPropertyValue("--su-text"),
  );
  expect(document.documentElement.getAttribute("style")).toBe(rootStyle);
  expect(dialog.classList.contains("su-fixed-dark")).toBe(false);
});

it("dismisses only the top confirmation on Escape", () => {
  const outerClose = vi.fn();
  const cancel = vi.fn();
  const view = (open: boolean) => (
    <AccessibleDialog open onClose={outerClose} title="Underlying dialog">
      <ConfirmDialog
        open={open}
        title="Delete item?"
        message="Permanent removal"
        onConfirm={vi.fn()}
        onCancel={cancel}
      />
    </AccessibleDialog>
  );
  const { rerender } = render(view(false));
  rerender(view(true));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(outerClose).not.toHaveBeenCalled();
});
