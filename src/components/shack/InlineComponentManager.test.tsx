import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useShackStore } from "@/stores/shackStore";
import { StationProvider } from "@/components/station-ui";
import { InlineComponentManager } from "./InlineComponentManager";

const initial = useShackStore.getState();
beforeEach(() => {
  useShackStore.setState({
    ...initial,
    inlineComponents: [],
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

function renderManager() {
  return render(
    <StationProvider>
      <InlineComponentManager />
    </StationProvider>,
  );
}

function openFerriteForm() {
  fireEvent.click(screen.getByRole("button", { name: "+ Add Inline Component" }));
  fireEvent.change(screen.getByLabelText("Component name", { exact: false }), {
    target: { value: "Test ferrite" },
  });
  fireEvent.change(screen.getByLabelText("Type", { exact: false }), {
    target: { value: "ferrite" },
  });
}

describe("InlineComponentManager ferrite count validation (#327)", () => {
  it("rejects a non-integer ferrite count instead of coercing it", () => {
    renderManager();
    openFerriteForm();

    fireEvent.change(screen.getByLabelText("Count", { exact: false }), {
      target: { value: "4.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Count must be a positive integer.",
    );
    expect(useShackStore.getState().inlineComponents).toHaveLength(0);
  });

  it("rejects a zero ferrite count", () => {
    renderManager();
    openFerriteForm();

    fireEvent.change(screen.getByLabelText("Count", { exact: false }), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "Count must be a positive integer.",
    );
    expect(useShackStore.getState().inlineComponents).toHaveLength(0);
  });

  it("accepts a valid positive integer ferrite count", () => {
    renderManager();
    openFerriteForm();

    fireEvent.change(screen.getByLabelText("Count", { exact: false }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(useShackStore.getState().inlineComponents).toHaveLength(1);
    expect(useShackStore.getState().inlineComponents[0]).toMatchObject({
      componentType: "ferrite",
      count: 4,
    });
  });
});
